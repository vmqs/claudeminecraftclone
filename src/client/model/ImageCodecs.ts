import { unzlibSync, zlibSync } from 'fflate';

/**
 * Image helpers that need no DOM (the conversion script and Node tests use them; the browser
 * importer uses them for the formats browsers cannot decode: DDS and TGA): a PNG decoder and
 * encoder, DDS (DXT1/3/5, BC1-3, uncompressed) and TGA decoders, halving and alpha checks.
 */

export interface RgbaImage {
  width: number;
  height: number;
  /** width * height * 4 bytes, rows top to bottom. */
  rgba: Uint8Array;
}

/** Largest image side accepted from any file. */
export const MAX_IMAGE_SIDE = 8192;

function checkSize(w: number, h: number): void {
  if (!(w > 0 && h > 0 && w <= MAX_IMAGE_SIDE && h <= MAX_IMAGE_SIDE)) throw new Error(`bad image size ${w}x${h}`);
}

// ------------------------------------------------------------------ PNG

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];

export function isPng(b: Uint8Array): boolean {
  return b.length > 8 && PNG_SIG.every((v, i) => b[i] === v);
}

export function isJpeg(b: Uint8Array): boolean {
  return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

export function isDds(b: Uint8Array): boolean {
  return b.length > 128 && b[0] === 0x44 && b[1] === 0x44 && b[2] === 0x53 && b[3] === 0x20;
}

/** Decodes a non-interlaced PNG of any colour type and bit depth into RGBA8; null if unsupported. */
export function decodePng(bytes: Uint8Array): RgbaImage | null {
  if (!isPng(bytes)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let ctype = 0;
  let interlace = 0;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (pos + 8 <= bytes.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
    const data = bytes.subarray(pos + 8, Math.min(bytes.length, pos + 8 + len));
    pos += 12 + len;
    if (type === 'IHDR') {
      if (data.length < 13) return null;
      const hv = new DataView(data.buffer, data.byteOffset, data.byteLength);
      width = hv.getUint32(0);
      height = hv.getUint32(4);
      depth = data[8];
      ctype = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  if (!width || !height || interlace !== 0) return null;
  checkSize(width, height);
  const channels = ctype === 0 ? 1 : ctype === 2 ? 3 : ctype === 3 ? 1 : ctype === 4 ? 2 : ctype === 6 ? 4 : 0;
  if (!channels) return null;
  const bitsPerPixel = channels * depth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const bpp = Math.max(1, bitsPerPixel >> 3);
  let total = 0;
  for (const d of idat) total += d.length;
  const joined = new Uint8Array(total);
  let o = 0;
  for (const d of idat) {
    joined.set(d, o);
    o += d.length;
  }
  let raw: Uint8Array;
  try {
    raw = unzlibSync(joined, { out: new Uint8Array((stride + 1) * height) });
  } catch {
    return null;
  }
  if (raw.length < (stride + 1) * height) return null;
  const px = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[src + x];
      const a = x >= bpp ? px[dst + x - bpp] : 0;
      const b = y > 0 ? px[dst - stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[dst - stride + x - bpp] : 0;
      let r: number;
      switch (filter) {
        case 1:
          r = v + a;
          break;
        case 2:
          r = v + b;
          break;
        case 3:
          r = v + ((a + b) >> 1);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          r = v;
      }
      px[dst + x] = r & 255;
    }
  }
  const out = new Uint8Array(width * height * 4);
  const sample = (row: number, i: number): number => {
    // i-th sample of the row, scaled to 8 bits.
    if (depth === 8) return px[row * stride + i];
    if (depth === 16) return px[row * stride + i * 2];
    const perByte = 8 / depth;
    const byte = px[row * stride + Math.floor(i / perByte)];
    const shift = 8 - depth * ((i % perByte) + 1);
    const v = (byte >> shift) & ((1 << depth) - 1);
    return ctype === 3 ? v : Math.round((v * 255) / ((1 << depth) - 1));
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = (y * width + x) * 4;
      if (ctype === 3) {
        const idx = sample(y, x);
        out[d] = palette?.[idx * 3] ?? 0;
        out[d + 1] = palette?.[idx * 3 + 1] ?? 0;
        out[d + 2] = palette?.[idx * 3 + 2] ?? 0;
        out[d + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else if (ctype === 0 || ctype === 4) {
        const g = sample(y, x * channels);
        out[d] = out[d + 1] = out[d + 2] = g;
        out[d + 3] = ctype === 4 ? sample(y, x * channels + 1) : 255;
      } else {
        out[d] = sample(y, x * channels);
        out[d + 1] = sample(y, x * channels + 1);
        out[d + 2] = sample(y, x * channels + 2);
        out[d + 3] = ctype === 6 ? sample(y, x * channels + 3) : 255;
      }
    }
  }
  return { width, height, rgba: out };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ data[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Encodes RGBA8 as a PNG (RGB when every pixel is opaque), choosing a filter per row. */
export function encodePng(img: RgbaImage): Uint8Array {
  const { width, height, rgba } = img;
  const opaque = !hasAlpha(img);
  const ch = opaque ? 3 : 4;
  const stride = width * ch;
  const raw = new Uint8Array((stride + 1) * height);
  const line = new Uint8Array(stride);
  const prev = new Uint8Array(stride);
  const cand = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < ch; c++) line[x * ch + c] = rgba[(y * width + x) * 4 + c];
    }
    let best = 0;
    let bestScore = Infinity;
    const out = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (const filter of [0, 1, 2, 4]) {
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= ch ? line[i - ch] : 0;
        const b = y > 0 ? prev[i] : 0;
        const c = i >= ch && y > 0 ? prev[i - ch] : 0;
        let v: number;
        if (filter === 1) v = line[i] - a;
        else if (filter === 2) v = line[i] - b;
        else if (filter === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v = line[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        } else v = line[i];
        v &= 255;
        cand[i] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) {
        bestScore = score;
        best = filter;
        out.set(cand);
      }
    }
    raw[y * (stride + 1)] = best;
    prev.set(line);
  }
  const idat = zlibSync(raw, { level: 9 });
  const chunks: [string, Uint8Array][] = [];
  const ihdr = new Uint8Array(13);
  const hv = new DataView(ihdr.buffer);
  hv.setUint32(0, width);
  hv.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = opaque ? 2 : 6;
  chunks.push(['IHDR', ihdr], ['IDAT', idat], ['IEND', new Uint8Array(0)]);
  let size = 8;
  for (const [, d] of chunks) size += 12 + d.length;
  const out = new Uint8Array(size);
  out.set(PNG_SIG, 0);
  const ov = new DataView(out.buffer);
  let p = 8;
  for (const [type, d] of chunks) {
    ov.setUint32(p, d.length);
    for (let i = 0; i < 4; i++) out[p + 4 + i] = type.charCodeAt(i);
    out.set(d, p + 8);
    ov.setUint32(p + 8 + d.length, crc32(out, p + 4, p + 8 + d.length));
    p += 12 + d.length;
  }
  return out;
}

// ------------------------------------------------------------------ DDS

function rgb565(c: number, out: number[], o: number): void {
  const r = (c >> 11) & 31;
  const g = (c >> 5) & 63;
  const b = c & 31;
  out[o] = (r << 3) | (r >> 2);
  out[o + 1] = (g << 2) | (g >> 4);
  out[o + 2] = (b << 3) | (b >> 2);
}

/** Decodes the first mip level of a DDS texture (DXT1/BC1, DXT3/BC2, DXT5/BC3, 24/32-bit RGB). */
export function decodeDds(bytes: Uint8Array): RgbaImage | null {
  if (!isDds(bytes)) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const height = v.getUint32(12, true);
  const width = v.getUint32(16, true);
  checkSize(width, height);
  const pfFlags = v.getUint32(80, true);
  let fourCC = String.fromCharCode(bytes[84], bytes[85], bytes[86], bytes[87]);
  let offset = 128;
  if (fourCC === 'DX10') {
    const dxgi = v.getUint32(128, true);
    offset += 20;
    fourCC = dxgi === 71 || dxgi === 72 ? 'DXT1' : dxgi === 74 || dxgi === 75 ? 'DXT3' : dxgi === 77 || dxgi === 78 ? 'DXT5' : dxgi === 28 || dxgi === 29 ? 'RGBA' : dxgi === 87 || dxgi === 91 ? 'BGRA' : '?';
  }
  const out = new Uint8Array(width * height * 4);
  if (pfFlags & 4 && fourCC !== 'RGBA' && fourCC !== 'BGRA') {
    const blockBytes = fourCC === 'DXT1' ? 8 : fourCC === 'DXT3' || fourCC === 'DXT5' ? 16 : 0;
    if (!blockBytes) return null;
    const bw = Math.ceil(width / 4);
    const bh = Math.ceil(height / 4);
    if (offset + bw * bh * blockBytes > bytes.length) return null;
    const colors: number[] = new Array(16).fill(0);
    const alphas = new Uint8Array(16);
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        const b = offset + (by * bw + bx) * blockBytes;
        const cb = blockBytes === 16 ? b + 8 : b;
        alphas.fill(255);
        if (fourCC === 'DXT3') {
          for (let i = 0; i < 16; i++) {
            const nib = (bytes[b + (i >> 1)] >> ((i & 1) * 4)) & 15;
            alphas[i] = nib * 17;
          }
        } else if (fourCC === 'DXT5') {
          const a0 = bytes[b];
          const a1 = bytes[b + 1];
          const table = [a0, a1, 0, 0, 0, 0, 0, 0];
          if (a0 > a1) for (let i = 1; i < 7; i++) table[i + 1] = Math.round(((7 - i) * a0 + i * a1) / 7);
          else {
            for (let i = 1; i < 5; i++) table[i + 1] = Math.round(((5 - i) * a0 + i * a1) / 5);
            table[6] = 0;
            table[7] = 255;
          }
          let bits = 0n;
          for (let i = 0; i < 6; i++) bits |= BigInt(bytes[b + 2 + i]) << BigInt(8 * i);
          for (let i = 0; i < 16; i++) alphas[i] = table[Number((bits >> BigInt(3 * i)) & 7n)];
        }
        const c0 = bytes[cb] | (bytes[cb + 1] << 8);
        const c1 = bytes[cb + 2] | (bytes[cb + 3] << 8);
        rgb565(c0, colors, 0);
        rgb565(c1, colors, 4);
        colors[3] = colors[7] = 255;
        if (c0 > c1 || blockBytes === 16) {
          for (let k = 0; k < 3; k++) {
            colors[8 + k] = Math.round((2 * colors[k] + colors[4 + k]) / 3);
            colors[12 + k] = Math.round((colors[k] + 2 * colors[4 + k]) / 3);
          }
          colors[11] = colors[15] = 255;
        } else {
          for (let k = 0; k < 3; k++) {
            colors[8 + k] = (colors[k] + colors[4 + k]) >> 1;
            colors[12 + k] = 0;
          }
          colors[11] = 255;
          colors[15] = 0;
        }
        const idx = v.getUint32(cb + 4, true);
        for (let i = 0; i < 16; i++) {
          const x = bx * 4 + (i & 3);
          const y = by * 4 + (i >> 2);
          if (x >= width || y >= height) continue;
          const c = ((idx >> (2 * i)) & 3) * 4;
          const d = (y * width + x) * 4;
          out[d] = colors[c];
          out[d + 1] = colors[c + 1];
          out[d + 2] = colors[c + 2];
          out[d + 3] = blockBytes === 16 ? alphas[i] : colors[c + 3];
        }
      }
    }
    return { width, height, rgba: out };
  }
  // Uncompressed: masks from the header (or the DX10 RGBA/BGRA formats).
  let bits = v.getUint32(88, true);
  let rMask = v.getUint32(92, true);
  let gMask = v.getUint32(96, true);
  let bMask = v.getUint32(100, true);
  let aMask = pfFlags & 1 ? v.getUint32(104, true) : 0;
  if (fourCC === 'RGBA' || fourCC === 'BGRA') {
    bits = 32;
    rMask = fourCC === 'RGBA' ? 0xff : 0xff0000;
    gMask = 0xff00;
    bMask = fourCC === 'RGBA' ? 0xff0000 : 0xff;
    aMask = 0xff000000;
  }
  if (bits !== 32 && bits !== 24) return null;
  const pxBytes = bits / 8;
  if (offset + width * height * pxBytes > bytes.length) return null;
  const chan = (val: number, mask: number): number => {
    if (!mask) return 255;
    let shift = 0;
    while (((mask >>> shift) & 1) === 0 && shift < 32) shift++;
    const max = mask >>> shift;
    return Math.round((((val & mask) >>> shift) * 255) / max);
  };
  for (let i = 0; i < width * height; i++) {
    const o = offset + i * pxBytes;
    const val = pxBytes === 4 ? v.getUint32(o, true) : bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16);
    out[i * 4] = chan(val, rMask);
    out[i * 4 + 1] = chan(val, gMask);
    out[i * 4 + 2] = chan(val, bMask);
    out[i * 4 + 3] = chan(val, aMask);
  }
  return { width, height, rgba: out };
}

// ------------------------------------------------------------------ TGA

/** Decodes an uncompressed or RLE true-colour / greyscale TGA. */
export function decodeTga(bytes: Uint8Array): RgbaImage | null {
  if (bytes.length < 18) return null;
  const idLen = bytes[0];
  const cmapType = bytes[1];
  const type = bytes[2];
  if (cmapType !== 0 || ![2, 3, 10, 11].includes(type)) return null;
  const width = bytes[12] | (bytes[13] << 8);
  const height = bytes[14] | (bytes[15] << 8);
  const bpp = bytes[16];
  const desc = bytes[17];
  if (![8, 24, 32].includes(bpp)) return null;
  checkSize(width, height);
  const px = bpp / 8;
  const out = new Uint8Array(width * height * 4);
  let p = 18 + idLen;
  const n = width * height;
  const put = (i: number, at: number): void => {
    const row = Math.floor(i / width);
    const x = i % width;
    const y = desc & 0x20 ? row : height - 1 - row;
    const xx = desc & 0x10 ? width - 1 - x : x;
    const d = (y * width + xx) * 4;
    if (px === 1) {
      out[d] = out[d + 1] = out[d + 2] = bytes[at];
      out[d + 3] = 255;
    } else {
      out[d] = bytes[at + 2];
      out[d + 1] = bytes[at + 1];
      out[d + 2] = bytes[at];
      out[d + 3] = px === 4 ? bytes[at + 3] : 255;
    }
  };
  if (type === 2 || type === 3) {
    if (p + n * px > bytes.length) return null;
    for (let i = 0; i < n; i++) put(i, p + i * px);
  } else {
    let i = 0;
    while (i < n) {
      if (p >= bytes.length) return null;
      const h = bytes[p++];
      const count = (h & 127) + 1;
      if (h & 128) {
        if (p + px > bytes.length) return null;
        for (let k = 0; k < count && i < n; k++) put(i++, p);
        p += px;
      } else {
        if (p + count * px > bytes.length) return null;
        for (let k = 0; k < count && i < n; k++) put(i++, p + k * px);
        p += count * px;
      }
    }
  }
  return { width, height, rgba: out };
}

// ------------------------------------------------------------------ helpers

/** Whether any pixel is not fully opaque. */
export function hasAlpha(img: RgbaImage): boolean {
  const a = img.rgba;
  for (let i = 3; i < a.length; i += 4) if (a[i] < 255) return true;
  return false;
}

/** The share of pixels with alpha below 128 (cut-out textures have many). */
export function transparentShare(img: RgbaImage): number {
  const a = img.rgba;
  let n = 0;
  for (let i = 3; i < a.length; i += 4) if (a[i] < 128) n++;
  return n / (a.length / 4);
}

/** Halves the image (2x2 box filter) until both sides are at most `max`. */
export function shrinkTo(img: RgbaImage, max: number): RgbaImage {
  let cur = img;
  while (cur.width > max || cur.height > max) {
    const w = Math.max(1, cur.width >> 1);
    const h = Math.max(1, cur.height >> 1);
    const out = new Uint8Array(w * h * 4);
    const sw = cur.width;
    const sh = cur.height;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const x0 = Math.min(sw - 1, x * 2);
        const x1 = Math.min(sw - 1, x * 2 + 1);
        const y0 = Math.min(sh - 1, y * 2);
        const y1 = Math.min(sh - 1, y * 2 + 1);
        const i00 = (y0 * sw + x0) * 4;
        const i01 = (y0 * sw + x1) * 4;
        const i10 = (y1 * sw + x0) * 4;
        const i11 = (y1 * sw + x1) * 4;
        const s = cur.rgba;
        const a = s[i00 + 3] + s[i01 + 3] + s[i10 + 3] + s[i11 + 3];
        const d = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          // Alpha-weighted so transparent pixels do not darken the edges of cut-outs.
          out[d + c] = a > 0 ? Math.round((s[i00 + c] * s[i00 + 3] + s[i01 + c] * s[i01 + 3] + s[i10 + c] * s[i10 + 3] + s[i11 + c] * s[i11 + 3]) / a) : (s[i00 + c] + s[i01 + c] + s[i10 + c] + s[i11 + c]) >> 2;
        }
        out[d + 3] = (a + 2) >> 2;
      }
    }
    cur = { width: w, height: h, rgba: out };
  }
  return cur;
}

/** Sets every alpha to 255 (textures whose alpha holds something else). */
export function dropAlpha(img: RgbaImage): RgbaImage {
  const rgba = img.rgba.slice();
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  return { width: img.width, height: img.height, rgba };
}

/** Decodes the formats this module knows (PNG, DDS, TGA); null for others (JPEG, WebP...). */
export function decodeKnown(bytes: Uint8Array, name: string): RgbaImage | null {
  try {
    if (isPng(bytes)) return decodePng(bytes);
    if (isDds(bytes)) return decodeDds(bytes);
    if (/\.tga$/i.test(name)) return decodeTga(bytes);
  } catch {
    return null;
  }
  return null;
}

/** An image codec without a DOM: reads PNG, DDS and TGA, writes PNG (the conversion script, tests). */
export const pngOnlyCodec = {
  async decode(bytes: Uint8Array, name: string): Promise<RgbaImage | null> {
    return decodeKnown(bytes, name);
  },
  async encode(img: RgbaImage, _opaque: boolean): Promise<{ mime: string; bytes: Uint8Array }> {
    return { mime: 'image/png', bytes: encodePng(img) };
  },
};
