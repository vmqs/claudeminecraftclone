/**
 * The common shape every model parser (FBX, glTF/GLB, OBJ) produces: triangle meshes in one
 * world space (the file's own units and axes, bind pose), their materials and undecoded
 * textures, and an optional skeleton with per-vertex weights. The model builder normalises,
 * rigs and packs this into the runtime format. No DOM here: the conversion script runs it in Node.
 */

export interface SourceMesh {
  /** Node or group name (used to recognise body parts when there is no skeleton). */
  name: string;
  /** xyz per vertex, world space of the file. */
  positions: Float32Array;
  /** xyz per vertex, or null to compute flat-ish normals later. */
  normals: Float32Array | null;
  /** uv per vertex (v down, like images: 0 = top row), or null. */
  uvs: Float32Array | null;
  /** Triangle vertex indices. */
  indices: Uint32Array;
  /** Triangle ranges [start triangle, count] and their material (index into SourceScene.materials). */
  groups: { start: number; count: number; material: number }[];
  /** Four bone indices (into SourceScene.bones) and weights per vertex, when skinned. */
  joints: Uint16Array | null;
  weights: Float32Array | null;
}

export interface SourceBone {
  name: string;
  parent: number;
  /** Bind-pose position in the world space of the file. */
  position: [number, number, number];
}

export interface SourceMaterial {
  name: string;
  /** Base colour (linear 0-1, multiplied with the texture). */
  color: [number, number, number, number];
  /** Index into SourceScene.textures, or -1. */
  texture: number;
  /** Cut-out or blended alpha (hair cards, eyelashes). */
  alpha: 'opaque' | 'mask' | 'blend';
}

export interface SourceTexture {
  /** File name or texture name (matching textures to materials by name). */
  name: string;
  /** Encoded image bytes, or null when the file was not found (resolved later by name). */
  bytes: Uint8Array | null;
}

export interface SourceScene {
  meshes: SourceMesh[];
  materials: SourceMaterial[];
  textures: SourceTexture[];
  bones: SourceBone[];
  /** Which way is up in the file, when the format says so ('y' for glTF, the FBX UpAxis). */
  upAxis: 'x' | 'y' | 'z' | null;
  /** The format's forward convention, used when nothing better is found. */
  frontHint: [number, number, number] | null;
  /** Free text found in the file (author, title) for the model's credits. */
  info: string[];
  /** Whether materials state their alpha mode (glTF); otherwise textures with holes are cut-outs. */
  explicitAlpha?: boolean;
}

export class ModelImportError extends Error {}

/** Column-major 4x4 matrices (like glTF and the GL facade). */
export type M4 = Float64Array;

export function m4Identity(): M4 {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function m4Mul(a: M4, b: M4): M4 {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  }
  return o;
}

export function m4Translate(x: number, y: number, z: number): M4 {
  const m = m4Identity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

export function m4Scale(x: number, y: number, z: number): M4 {
  const m = m4Identity();
  m[0] = x;
  m[5] = y;
  m[10] = z;
  return m;
}

/** Rotation from a unit quaternion (x, y, z, w). */
export function m4FromQuat(x: number, y: number, z: number, w: number): M4 {
  const m = m4Identity();
  m[0] = 1 - 2 * (y * y + z * z);
  m[1] = 2 * (x * y + z * w);
  m[2] = 2 * (x * z - y * w);
  m[4] = 2 * (x * y - z * w);
  m[5] = 1 - 2 * (x * x + z * z);
  m[6] = 2 * (y * z + x * w);
  m[8] = 2 * (x * z + y * w);
  m[9] = 2 * (y * z - x * w);
  m[10] = 1 - 2 * (x * x + y * y);
  return m;
}

/** Rotation about one axis (0 x, 1 y, 2 z) by `deg` degrees. */
export function m4RotAxis(axis: number, deg: number): M4 {
  const m = m4Identity();
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  if (axis === 0) {
    m[5] = c;
    m[6] = s;
    m[9] = -s;
    m[10] = c;
  } else if (axis === 1) {
    m[0] = c;
    m[2] = -s;
    m[8] = s;
    m[10] = c;
  } else {
    m[0] = c;
    m[1] = s;
    m[4] = -s;
    m[5] = c;
  }
  return m;
}

export function m4Invert(m: M4): M4 | null {
  const inv = new Float64Array(16);
  inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
  inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
  inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
  inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
  inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
  inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
  inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
  inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
  inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
  inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
  inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
  inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
  inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
  inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
  inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
  inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
  const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  if (!det || !Number.isFinite(det)) return null;
  for (let i = 0; i < 16; i++) inv[i] /= det;
  return inv;
}

/** Transforms the xyz triples of `src` by `m` (points, w = 1) into a new array. */
export function transformPoints(m: M4, src: ArrayLike<number>): Float32Array {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i];
    const y = src[i + 1];
    const z = src[i + 2];
    out[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
  return out;
}

/** Transforms directions by the inverse transpose of `m` (normals), normalising them. */
export function transformNormals(m: M4, src: ArrayLike<number>): Float32Array {
  const inv = m4Invert(m) ?? m4Identity();
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i];
    const y = src[i + 1];
    const z = src[i + 2];
    // Inverse transpose: rows of the inverse.
    let nx = inv[0] * x + inv[1] * y + inv[2] * z;
    let ny = inv[4] * x + inv[5] * y + inv[6] * z;
    let nz = inv[8] * x + inv[9] * y + inv[10] * z;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    out[i] = nx;
    out[i + 1] = ny;
    out[i + 2] = nz;
  }
  return out;
}

/** Whether the matrix flips handedness (triangle winding must be reversed). */
export function m4Mirrors(m: M4): boolean {
  const det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
  return det < 0;
}

/** The file name part of a path (either slash), without query strings. */
export function baseName(path: string): string {
  const p = path.replace(/\\/g, '/');
  return p.slice(p.lastIndexOf('/') + 1);
}

/** Lower-cased file name without extension, for name matching. */
export function stemOf(path: string): string {
  const b = baseName(path).toLowerCase();
  const dot = b.lastIndexOf('.');
  return dot > 0 ? b.slice(0, dot) : b;
}

/** Limits every parser checks. */
export const IMPORT_LIMITS = {
  /** Largest file accepted by Import Model... */
  maxFileBytes: 30 * 1024 * 1024,
  /** Largest total size of the files inside a .zip. */
  maxUnpackedBytes: 120 * 1024 * 1024,
  /** Triangles after import (more are decimated). */
  maxTriangles: 200_000,
  /** Vertices read from one file before giving up. */
  maxVertices: 2_000_000,
  /** Nodes in one FBX / glTF file. */
  maxNodes: 200_000,
};
