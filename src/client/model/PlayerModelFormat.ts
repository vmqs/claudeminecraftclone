import { deflateSync, Inflate } from 'fflate';

/**
 * The runtime format of a custom player model ("MCPM", .mcpm): what the importer and the
 * conversion script write, what is stored in IndexedDB, served for the built-in models and sent
 * to other players. It is already normalised and rigged:
 *
 * - Model space ("N"): blocks, +Y up, the feet on y = 0, 1.8 tall, centred on x = z = 0, facing
 *   +Z with the right hand towards -X (an entity with yaw 0 in the world).
 * - Every vertex is bound to up to four of ModelBiped's six parts with weights summing to 255.
 * - The rig gives each part's pivot (where ModelBiped's rotation point sits on this body), the
 *   palms (held items) and the head's centre and size (head items).
 *
 * Layout: "MCPM", u32 version, u32 header length, the header as JSON, then the payload: one
 * deflated geometry block and the encoded textures (PNG / JPEG / WebP). The decoder checks every
 * count, range and index, so files from other players cannot do more than fail to load.
 */

export const PART_HEAD = 0;
export const PART_BODY = 1;
export const PART_RIGHT_ARM = 2;
export const PART_LEFT_ARM = 3;
export const PART_RIGHT_LEG = 4;
export const PART_LEFT_LEG = 5;
export const PART_COUNT = 6;
export const PART_NAMES = ['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'];

export const ALPHA_OPAQUE = 0;
export const ALPHA_MASK = 1;
export const ALPHA_BLEND = 2;

export interface ModelMaterial {
  /** RGBA 0-255, multiplied with the texture. */
  color: [number, number, number, number];
  /** Index into textures, or -1. */
  texture: number;
  alpha: number;
}

export interface ModelTexture {
  mime: string;
  bytes: Uint8Array;
}

export interface ModelRig {
  /** Pivot of each part in model space (ModelBiped's rotation points on this body). */
  pivots: [number, number, number][];
  /** Palm centres: [right, left]. */
  hands: [number, number, number][];
  headCenter: [number, number, number];
  /** The head's height (Steve's is 0.5 blocks after the player's 0.9375 scale). */
  headSize: number;
  /** 'skeleton' when the parts came from bone weights, 'geometry' when auto-rigged. */
  source: 'skeleton' | 'geometry';
}

export interface PlayerModelData {
  name: string;
  credits: string;
  positions: Float32Array;
  normals: Int8Array;
  uvs: Float32Array;
  joints: Uint8Array;
  weights: Uint8Array;
  indices: Uint16Array | Uint32Array;
  /** Index ranges (start, count in indices) and their material, opaque ones first. */
  groups: { start: number; count: number; material: number }[];
  materials: ModelMaterial[];
  textures: ModelTexture[];
  rig: ModelRig;
}

export class ModelFormatError extends Error {}

export const FORMAT_LIMITS = {
  maxVertices: 400_000,
  maxIndices: 600_000,
  maxGroups: 256,
  maxMaterials: 64,
  maxTextures: 16,
  maxTextureBytes: 16 * 1024 * 1024,
  maxHeader: 256 * 1024,
  maxName: 48,
  maxCredits: 400,
};

const MAGIC = 0x4d50434d; // "MCPM" little-endian
const VERSION = 1;
const MIMES = ['image/png', 'image/jpeg', 'image/webp'];

const align4 = (n: number) => (n + 3) & ~3;

function geometryLayout(vc: number, ic: number, wide: boolean) {
  const uvs = 0;
  const positions = align4(uvs + vc * 8);
  const normals = align4(positions + vc * 6);
  const joints = align4(normals + vc * 3);
  const weights = align4(joints + vc * 4);
  const indices = align4(weights + vc * 4);
  const end = indices + ic * (wide ? 4 : 2);
  return { uvs, positions, normals, joints, weights, indices, end };
}

/** Removes control characters and trims to `max` characters. */
export function cleanText(s: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return String(s ?? '').replace(/[\u0000-\u001f\u007f§]/g, '').slice(0, max);
}

export function encodePlayerModel(m: PlayerModelData): Uint8Array {
  const vc = m.positions.length / 3;
  const ic = m.indices.length;
  const wide = vc > 65535;
  const bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      bounds[k] = Math.min(bounds[k], m.positions[i + k]);
      bounds[k + 3] = Math.max(bounds[k + 3], m.positions[i + k]);
    }
  }
  const lay = geometryLayout(vc, ic, wide);
  const geo = new Uint8Array(lay.end);
  const gv = new DataView(geo.buffer);
  for (let i = 0; i < vc * 2; i++) gv.setFloat32(lay.uvs + i * 4, Number.isFinite(m.uvs[i]) ? m.uvs[i] : 0, true);
  for (let i = 0; i < vc; i++) {
    for (let k = 0; k < 3; k++) {
      const span = bounds[k + 3] - bounds[k] || 1;
      const q = Math.round(((m.positions[i * 3 + k] - bounds[k]) / span) * 65535);
      gv.setUint16(lay.positions + (i * 3 + k) * 2, Math.max(0, Math.min(65535, q)), true);
    }
  }
  geo.set(new Uint8Array(m.normals.buffer, m.normals.byteOffset, vc * 3), lay.normals);
  geo.set(m.joints.subarray(0, vc * 4), lay.joints);
  geo.set(m.weights.subarray(0, vc * 4), lay.weights);
  for (let i = 0; i < ic; i++) {
    if (wide) gv.setUint32(lay.indices + i * 4, m.indices[i], true);
    else gv.setUint16(lay.indices + i * 2, m.indices[i], true);
  }
  const deflated = deflateSync(geo, { level: 9 });
  const r3 = (v: number[]) => v.map((x) => Math.round(x * 1e5) / 1e5) as [number, number, number];
  let offset = deflated.length;
  const textures = m.textures.map((t) => {
    const e = { mime: t.mime, offset, length: t.bytes.length };
    offset += t.bytes.length;
    return e;
  });
  const header = {
    name: cleanText(m.name, FORMAT_LIMITS.maxName),
    credits: cleanText(m.credits, FORMAT_LIMITS.maxCredits),
    vertexCount: vc,
    indexCount: ic,
    wideIndices: wide,
    bounds,
    geometry: { offset: 0, length: deflated.length, size: lay.end },
    groups: m.groups,
    materials: m.materials,
    textures,
    rig: {
      pivots: m.rig.pivots.map(r3),
      hands: m.rig.hands.map(r3),
      headCenter: r3(m.rig.headCenter),
      headSize: Math.round(m.rig.headSize * 1e5) / 1e5,
      source: m.rig.source,
    },
  };
  const json = new TextEncoder().encode(JSON.stringify(header));
  const out = new Uint8Array(12 + json.length + offset);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, MAGIC, true);
  ov.setUint32(4, VERSION, true);
  ov.setUint32(8, json.length, true);
  out.set(json, 12);
  const base = 12 + json.length;
  out.set(deflated, base);
  for (let i = 0; i < m.textures.length; i++) out.set(m.textures[i].bytes, base + textures[i].offset);
  return out;
}

export function isPlayerModelFile(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true) === MAGIC;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function int(v: any, min: number, max: number, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new ModelFormatError(`bad ${what}`);
  return v;
}

function num(v: any, min: number, max: number, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new ModelFormatError(`bad ${what}`);
  return v;
}

function vec3(v: any, what: string): [number, number, number] {
  if (!Array.isArray(v) || v.length !== 3) throw new ModelFormatError(`bad ${what}`);
  return [num(v[0], -4, 4, what), num(v[1], -4, 4, what), num(v[2], -4, 4, what)];
}

/**
 * Reads and checks a model file. Throws ModelFormatError for anything malformed: wrong magic or
 * version, counts over the limits, ranges outside the file, indices past the vertices, joints
 * that are not parts, unknown image types.
 */
export function decodePlayerModel(bytes: Uint8Array, maxBytes = 40 * 1024 * 1024): PlayerModelData {
  if (bytes.length > maxBytes) throw new ModelFormatError('model too large');
  if (!isPlayerModelFile(bytes)) throw new ModelFormatError('not a model file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) !== VERSION) throw new ModelFormatError('unsupported model version');
  const headerLen = view.getUint32(8, true);
  if (headerLen > FORMAT_LIMITS.maxHeader || 12 + headerLen > bytes.length) throw new ModelFormatError('bad header');
  let h: any;
  try {
    h = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(12, 12 + headerLen)));
  } catch {
    throw new ModelFormatError('bad header');
  }
  if (typeof h !== 'object' || h === null) throw new ModelFormatError('bad header');
  const base = 12 + headerLen;
  const payload = bytes.length - base;
  const vc = int(h.vertexCount, 3, FORMAT_LIMITS.maxVertices, 'vertex count');
  const ic = int(h.indexCount, 3, FORMAT_LIMITS.maxIndices, 'index count');
  if (ic % 3 !== 0) throw new ModelFormatError('bad index count');
  const wide = h.wideIndices === true;
  if (!wide && vc > 65536) throw new ModelFormatError('bad index width');
  if (!Array.isArray(h.bounds) || h.bounds.length !== 6) throw new ModelFormatError('bad bounds');
  const bounds = h.bounds.map((v: any) => num(v, -8, 8, 'bounds')) as number[];
  const lay = geometryLayout(vc, ic, wide);
  const g = h.geometry ?? {};
  const gOff = int(g.offset, 0, payload, 'geometry');
  const gLen = int(g.length, 1, payload - gOff, 'geometry');
  if (g.size !== lay.end) throw new ModelFormatError('bad geometry size');
  const geo = boundedInflate(bytes.subarray(base + gOff, base + gOff + gLen), lay.end);
  const gv = new DataView(geo.buffer, geo.byteOffset, geo.byteLength);
  const positions = new Float32Array(vc * 3);
  for (let i = 0; i < vc * 3; i++) {
    const k = i % 3;
    positions[i] = bounds[k] + (gv.getUint16(lay.positions + i * 2, true) / 65535) * (bounds[k + 3] - bounds[k]);
  }
  const uvs = new Float32Array(vc * 2);
  for (let i = 0; i < vc * 2; i++) {
    const v = gv.getFloat32(lay.uvs + i * 4, true);
    uvs[i] = Number.isFinite(v) && Math.abs(v) < 1e6 ? v : 0;
  }
  const normals = new Int8Array(geo.buffer.slice(geo.byteOffset + lay.normals, geo.byteOffset + lay.normals + vc * 3));
  const joints = geo.slice(lay.joints, lay.joints + vc * 4);
  const weights = geo.slice(lay.weights, lay.weights + vc * 4);
  for (let i = 0; i < joints.length; i++) if (joints[i] >= PART_COUNT) throw new ModelFormatError('bad joint');
  const indices = wide ? new Uint32Array(ic) : new Uint16Array(ic);
  for (let i = 0; i < ic; i++) {
    const v = wide ? gv.getUint32(lay.indices + i * 4, true) : gv.getUint16(lay.indices + i * 2, true);
    if (v >= vc) throw new ModelFormatError('bad index');
    indices[i] = v;
  }
  if (!Array.isArray(h.materials) || h.materials.length < 1 || h.materials.length > FORMAT_LIMITS.maxMaterials) throw new ModelFormatError('bad materials');
  if (!Array.isArray(h.textures) || h.textures.length > FORMAT_LIMITS.maxTextures) throw new ModelFormatError('bad textures');
  const textures: ModelTexture[] = h.textures.map((t: any) => {
    if (!t || !MIMES.includes(t.mime)) throw new ModelFormatError('bad texture type');
    const off = int(t.offset, 0, payload, 'texture');
    const len = int(t.length, 1, Math.min(FORMAT_LIMITS.maxTextureBytes, payload - off), 'texture');
    return { mime: t.mime, bytes: bytes.slice(base + off, base + off + len) };
  });
  const materials: ModelMaterial[] = h.materials.map((m: any) => {
    if (!m || !Array.isArray(m.color) || m.color.length !== 4) throw new ModelFormatError('bad material');
    return {
      color: m.color.map((c: any) => int(c, 0, 255, 'colour')) as [number, number, number, number],
      texture: int(m.texture, -1, textures.length - 1, 'material texture'),
      alpha: int(m.alpha, 0, 2, 'alpha mode'),
    };
  });
  if (!Array.isArray(h.groups) || h.groups.length < 1 || h.groups.length > FORMAT_LIMITS.maxGroups) throw new ModelFormatError('bad groups');
  const groups = h.groups.map((gr: any) => {
    const start = int(gr?.start, 0, ic, 'group');
    const count = int(gr?.count, 0, ic - start, 'group');
    if (start % 3 || count % 3) throw new ModelFormatError('bad group');
    return { start, count, material: int(gr.material, 0, materials.length - 1, 'group material') };
  });
  const r = h.rig ?? {};
  if (!Array.isArray(r.pivots) || r.pivots.length !== PART_COUNT || !Array.isArray(r.hands) || r.hands.length !== 2) throw new ModelFormatError('bad rig');
  const rig: ModelRig = {
    pivots: r.pivots.map((p: any) => vec3(p, 'pivot')),
    hands: r.hands.map((p: any) => vec3(p, 'hand')),
    headCenter: vec3(r.headCenter, 'head'),
    headSize: num(r.headSize, 0.01, 4, 'head size'),
    source: r.source === 'skeleton' ? 'skeleton' : 'geometry',
  };
  return {
    name: cleanText(h.name, FORMAT_LIMITS.maxName) || 'Model',
    credits: cleanText(h.credits, FORMAT_LIMITS.maxCredits),
    positions,
    normals,
    uvs,
    joints,
    weights,
    indices,
    groups,
    materials,
    textures,
    rig,
  };
}

/**
 * Inflates `data`, which must produce exactly `size` bytes; stops as soon as it produces more,
 * so a small file cannot make the decoder run through gigabytes of output.
 */
function boundedInflate(data: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(size);
  let got = 0;
  let over = false;
  const inf = new Inflate((chunk) => {
    if (got + chunk.length > size) {
      over = true;
      return;
    }
    out.set(chunk, got);
    got += chunk.length;
  });
  try {
    const step = 16384;
    for (let i = 0; i < data.length && !over; i += step) inf.push(data.subarray(i, i + step), i + step >= data.length);
  } catch {
    throw new ModelFormatError('bad geometry data');
  }
  if (over || got !== size) throw new ModelFormatError('bad geometry data');
  return out;
}

/** A short content hash (cyrb53-style, two lanes) used to cache models by their bytes. */
export function modelHash(bytes: Uint8Array): string {
  let h1 = 0xdeadbeef ^ bytes.length;
  let h2 = 0x41c6ce57 ^ bytes.length;
  let h3 = 0x9e3779b9;
  let h4 = 0x85ebca6b;
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
    h3 = Math.imul(h3 ^ (c + i), 2246822507);
    h4 = Math.imul(h4 ^ (c * 31 + 7), 3266489909);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  h3 = Math.imul(h3 ^ (h3 >>> 15), 668265263) ^ h1;
  h4 = Math.imul(h4 ^ (h4 >>> 15), 374761393) ^ h2;
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return hex(h1) + hex(h2) + hex(h3) + hex(h4);
}

/**
 * The model turned half a circle about its up axis (for imports whose front and back could not
 * be told apart): x and z change sign, and the left and right arms and legs swap parts.
 */
export function turnAround(m: PlayerModelData): PlayerModelData {
  const positions = m.positions.slice();
  const normals = m.normals.slice();
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = -positions[i];
    positions[i + 2] = -positions[i + 2];
    normals[i] = -normals[i];
    normals[i + 2] = -normals[i + 2];
  }
  const swap = [0, 1, 3, 2, 5, 4];
  const joints = m.joints.map((j) => swap[j] ?? j);
  const turn = (p: readonly number[]): [number, number, number] => [-p[0], p[1], -p[2]];
  const r = m.rig;
  return {
    ...m,
    positions,
    normals,
    joints,
    rig: {
      pivots: swap.map((k) => turn(r.pivots[k])),
      hands: [turn(r.hands[1]), turn(r.hands[0])],
      headCenter: turn(r.headCenter),
      headSize: r.headSize,
      source: r.source,
    },
  };
}
