#!/usr/bin/env node
// Generates src/assets/ModernPackMap.ts: where a 1.6+ resource pack's textures
// (assets/minecraft/textures/...) go in a 1.5.2 texture pack. Only file NAMES end up in the
// output; the Mojang jars it reads stay in the cache directory and are never committed.
//
// How: every PNG of the 1.5.2 client jar and of later client jars (1.6.4, 1.7.10, 1.8.9,
// 1.12.2, 1.13.2, 1.14.4, 1.20.1) is decoded and hashed by its pixels. A later texture with
// the same pixels as a 1.5.2 one is the same texture under its new name; a texture that was
// repainted keeps the mapping of the previous version's file with the same pixels or the same
// name. Where 1.5.2 had identical images (carrots/potatoes stages, quartz top/side, ...) the
// names decide, and a few files are mapped by hand (OVERRIDES).
//
// Usage: node scripts/gen-pack-map.mjs [--cache .cache/mojang]

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { unzipSync } from 'fflate';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const cacheDir = path.resolve(argv.includes('--cache') ? argv[argv.indexOf('--cache') + 1] : path.join(root, '.cache', 'mojang'));
const VERSION_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const CHAIN = ['1.6.4', '1.7.10', '1.8.9', '1.12.2', '1.13.2', '1.14.4', '1.20.1'];
const OUT = path.join(root, 'src', 'assets', 'ModernPackMap.ts');

/** Modern path (under assets/minecraft/textures/) -> 1.5.2 paths, decided by hand. */
const OVERRIDES = {
  'gui/widgets.png': ['gui/gui.png'],
  'gui/icons.png': ['gui/icons.png'],
  'gui/container/inventory.png': ['gui/inventory.png'],
  'entity/beacon_beam.png': ['misc/beacon.png'],
  'blocks/lapis_block.png': ['textures/blocks/blockLapis.png'],
  'block/lapis_block.png': ['textures/blocks/blockLapis.png'],
  'items/potion_bottle_drinkable.png': ['textures/items/potion.png'],
  'items/potion_bottle_empty.png': ['textures/items/glassBottle.png'],
  'item/potion.png': ['textures/items/potion.png'],
  'item/glass_bottle.png': ['textures/items/glassBottle.png'],
  'items/map_filled.png': ['textures/items/map.png'],
  'items/map_empty.png': ['textures/items/emptyMap.png'],
  'item/filled_map.png': ['textures/items/map.png'],
  'item/map.png': ['textures/items/emptyMap.png'],
};

async function jar(version) {
  const file = path.join(cacheDir, `${version}-client.jar`);
  if (existsSync(file)) return new Uint8Array(await fs.readFile(file));
  const manifest = await (await fetch(VERSION_MANIFEST)).json();
  const entry = manifest.versions.find((v) => v.id === version);
  const meta = await (await fetch(entry.url)).json();
  const buf = new Uint8Array(await (await fetch(meta.downloads.client.url)).arrayBuffer());
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(file, buf);
  return buf;
}

/** Minimal PNG decoder (8/16-bit and palette, not interlaced) -> RGBA with clear pixels zeroed. */
function decodePng(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0) !== 0x89504e47) return null;
  let p = 8;
  let w = 0, h = 0, depth = 0, ct = 0, interlace = 0, pal = null, trns = null;
  const idat = [];
  while (p + 8 <= buf.length) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7]);
    const d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') [w, h, depth, ct, interlace] = [dv.getUint32(p + 8), dv.getUint32(p + 12), d[8], d[9], d[12]];
    else if (type === 'PLTE') pal = d;
    else if (type === 'tRNS') trns = d;
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (interlace) return null;
  const raw = inflateSync(Buffer.concat(idat));
  const chans = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
  const bpp = Math.max(1, (chans * depth) >> 3);
  const stride = (w * chans * depth + 7) >> 3;
  const out = new Uint8Array(w * h * 4);
  let prev = new Uint8Array(stride);
  let q = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[q++];
    const line = Uint8Array.from(raw.subarray(q, q + stride));
    q += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 255;
    }
    const sample = (idx) => {
      if (depth === 8) return line[idx];
      if (depth === 16) return line[idx * 2];
      const bit = idx * depth;
      return (line[bit >> 3] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
    };
    for (let x = 0; x < w; x++) {
      let r, g, b, a = 255;
      if (ct === 3) {
        const i = sample(x);
        [r, g, b] = [pal[i * 3], pal[i * 3 + 1], pal[i * 3 + 2]];
        a = trns && i < trns.length ? trns[i] : 255;
      } else if (ct === 0) {
        let v = sample(x);
        if (depth < 8) v = Math.round((v * 255) / ((1 << depth) - 1));
        r = g = b = v;
      } else if (ct === 4) {
        r = g = b = sample(x * 2);
        a = sample(x * 2 + 1);
      } else if (ct === 2) {
        [r, g, b] = [sample(x * 3), sample(x * 3 + 1), sample(x * 3 + 2)];
      } else {
        [r, g, b, a] = [sample(x * 4), sample(x * 4 + 1), sample(x * 4 + 2), sample(x * 4 + 3)];
      }
      if (a === 0) r = g = b = 0;
      out.set([r, g, b, a], (y * w + x) * 4);
    }
    prev = line;
  }
  return { w, h, data: out };
}

async function loadPngs(version, prefix) {
  const files = unzipSync(await jar(version), { filter: (f) => f.name.endsWith('.png') && f.name.startsWith(prefix) });
  const byPath = new Map();
  const byHash = new Map();
  for (const [name, data] of Object.entries(files)) {
    const img = decodePng(data);
    if (!img) continue;
    const hash = createHash('sha1').update(`${img.w}x${img.h}`).update(img.data).digest('hex');
    const rel = name.slice(prefix.length);
    byPath.set(rel, { hash, w: img.w, h: img.h });
    if (!byHash.has(hash)) byHash.set(hash, []);
    byHash.get(hash).push(rel);
  }
  return { byPath, byHash };
}

const GENERIC = new Set(['png', 'textures', 'blocks', 'items', 'block', 'item', 'gui', 'entity', 'mob']);
function tokens(p) {
  return new Set(
    p
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((t) => t && !GENERIC.has(t)),
  );
}
/** How well two paths' names agree: shared words, and much more for the same file name. */
function score(a, b) {
  const tb = tokens(b);
  let n = 0;
  for (const t of tokens(a)) if (tb.has(t)) n++;
  const name = (s) => path.basename(s, '.png').replace(/_/g, '').toLowerCase();
  return name(a) === name(b) ? n + 10 : n;
}
/** Advancement backgrounds copy block textures but are not them. */
const SKIP = /^gui\/advancements\//;

const base = await loadPngs('1.5.2', '');
const result = new Map();
let prev = null;
let prevMap = null;
for (const version of CHAIN) {
  const cur = await loadPngs(version, 'assets/minecraft/textures/');
  const direct = new Map();
  for (const [p, info] of cur.byPath) {
    if (SKIP.test(p)) continue;
    const hits = base.byHash.get(info.hash);
    if (!hits) continue;
    const best = Math.max(...hits.map((t) => score(p, t)));
    direct.set(p, new Set(best > 0 ? hits.filter((t) => score(p, t) === best) : hits));
  }
  const map = new Map(direct);
  for (const [p, info] of cur.byPath) {
    if (map.has(p) || !prev || SKIP.test(p)) continue;
    const ts = new Set();
    for (const q of prev.byHash.get(info.hash) ?? []) for (const t of prevMap.get(q) ?? []) ts.add(t);
    if (ts.size === 0) for (const t of prevMap.get(p) ?? []) ts.add(t);
    if (ts.size > 0) map.set(p, ts);
  }
  // A 1.5.2 image several later files copy (carrot and beetroot stages, furnace and smoker):
  // only the best named of them keep it.
  const bestFor = new Map();
  for (const [p, ts] of map) for (const t of ts) bestFor.set(t, Math.max(bestFor.get(t) ?? 0, score(p, t)));
  for (const [p, ts] of map) {
    for (const t of [...ts]) if (score(p, t) < bestFor.get(t)) ts.delete(t);
    if (ts.size === 0) map.delete(p);
  }
  for (const [p, ts] of map) if (!result.has(p)) result.set(p, ts);
  console.log(`[packmap] ${version}: ${cur.byPath.size} textures, ${map.size} mapped`);
  prev = cur;
  prevMap = map;
}
for (const [p, ts] of Object.entries(OVERRIDES)) result.set(p, new Set(ts));

// Output: 'modern path' -> 'target[,target]' without .png; b: and i: abbreviate the 1.5.2 atlases.
const strip = (s) => s.replace(/\.png$/, '');
const abbreviate = (t) => strip(t).replace(/^textures\/blocks\//, 'b:').replace(/^textures\/items\//, 'i:');
const lines = [...result.entries()]
  .sort(([a], [b]) => (a < b ? -1 : 1))
  .map(([p, ts]) => `${strip(p)}=${[...ts].sort().map(abbreviate).join(',')}`);
const dims = new Map();
for (const ts of result.values()) for (const t of ts) if (!t.startsWith('textures/')) dims.set(strip(t), base.byPath.get(t));
const dimLines = [...dims.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([t, d]) => `${t}=${d.w}x${d.h}`);
const ts = `// Generated by scripts/gen-pack-map.mjs from the 1.5.2 and ${CHAIN.join(', ')} client jars (names only).
// Do not edit by hand: change OVERRIDES in the script and run it again.

/**
 * 1.6+ resource pack textures (paths under assets/minecraft/textures/, without .png) and the
 * 1.5.2 texture pack files they become ("b:" is textures/blocks/, "i:" is textures/items/).
 */
export const MODERN_TEXTURES = \`
${lines.join('\n')}
\`;

/** Size of each 1.5.2 file above outside the block and item atlases (a different layout is skipped). */
export const CLASSIC_SIZES = \`
${dimLines.join('\n')}
\`;
`;
await fs.writeFile(OUT, ts);
console.log(`[packmap] wrote ${path.relative(root, OUT)}: ${lines.length} textures, ${dimLines.length} sizes`);
