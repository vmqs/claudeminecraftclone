import { classifyName, type NameClass } from './BoneNames';
import { decodeKnown, dropAlpha, hasAlpha, isJpeg, isPng, type RgbaImage, shrinkTo, transparentShare } from './ImageCodecs';
import { IMAGE_EXT, type ModelFiles } from './ModelFiles';
import {
  ALPHA_BLEND,
  ALPHA_MASK,
  ALPHA_OPAQUE,
  type ModelMaterial,
  type ModelRig,
  type ModelTexture,
  PART_BODY,
  PART_COUNT,
  PART_HEAD,
  PART_LEFT_ARM,
  PART_LEFT_LEG,
  PART_NAMES,
  PART_RIGHT_ARM,
  PART_RIGHT_LEG,
  type PlayerModelData,
} from './PlayerModelFormat';
import { IMPORT_LIMITS, ModelImportError, type SourceScene, stemOf } from './SourceScene';

/** Height of every model: a player's 1.8 blocks, head included. */
export const MODEL_HEIGHT = 1.8;

/** Decoding and encoding images, which differ between the browser and Node. */
export interface ImageCodec {
  /** Any image the platform can read (the DDS/TGA decoders of ImageCodecs are tried first). */
  decode(bytes: Uint8Array, name: string): Promise<RgbaImage | null>;
  /** Encodes for the model file (`opaque`: no alpha needed). */
  encode(img: RgbaImage, opaque: boolean): Promise<ModelTexture>;
}

export interface BuildOptions {
  name: string;
  credits?: string;
  /** Largest texture side (default 1024). */
  maxTextureSize?: number;
  /** Which way the source faces after its up axis is fixed (skips the detection). */
  forward?: '+x' | '-x' | '+z' | '-z';
  /** Source up axis (skips the detection). */
  up?: '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
  /** Extra turn in degrees about +Y after the facing is known. */
  yaw?: number;
  /** Texture files for meshes or materials whose name starts with the key (lower case). */
  textureOverrides?: Record<string, string>;
  /** Meshes to leave out. */
  dropMeshes?: RegExp;
  /** Ignore the skeleton and rig by geometry. */
  forceGeometryRig?: boolean;
}

export interface BuildReport {
  vertices: number;
  triangles: number;
  rig: 'skeleton' | 'geometry';
  up: string;
  facing: string;
  partVertices: Record<string, number>;
  textures: string[];
  warnings: string[];
}

type V3 = [number, number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Row-major 3x3 rotation. */
type R3 = number[];
const rotApply = (r: R3, v: V3): V3 => [r[0] * v[0] + r[1] * v[1] + r[2] * v[2], r[3] * v[0] + r[4] * v[1] + r[5] * v[2], r[6] * v[0] + r[7] * v[1] + r[8] * v[2]];

/** The rotation taking unit vector a onto unit vector b (shortest arc). */
function rotBetween(a: V3, b: V3): R3 {
  const v = cross(a, b);
  const c = dot(a, b);
  if (c < -0.9999) {
    // Opposite: half turn about any perpendicular axis.
    const axis = norm(Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]));
    return axisAngle(axis, Math.PI);
  }
  const k = 1 / (1 + c);
  return [v[0] * v[0] * k + c, v[0] * v[1] * k - v[2], v[0] * v[2] * k + v[1], v[1] * v[0] * k + v[2], v[1] * v[1] * k + c, v[1] * v[2] * k - v[0], v[2] * v[0] * k - v[1], v[2] * v[1] * k + v[0], v[2] * v[2] * k + c];
}

function axisAngle(axis: V3, angle: number): R3 {
  const [x, y, z] = axis;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}

/** Working copy of the merged geometry. */
interface Work {
  pos: Float64Array;
  nrm: Float32Array;
  uv: Float32Array;
  /** Source bones and weights, 4 per vertex (-1 = none). */
  bone: Int32Array;
  boneW: Float32Array;
  mesh: Int32Array;
  meshNames: string[];
  tris: Uint32Array;
  triMat: Int32Array;
  vc: number;
}

function merge(scene: SourceScene, drop?: RegExp): Work {
  const meshes = scene.meshes.filter((m) => !drop || !drop.test(m.name));
  let vc = 0;
  let tc = 0;
  for (const m of meshes) {
    vc += m.positions.length / 3;
    tc += m.indices.length / 3;
  }
  if (tc === 0) throw new ModelImportError('The model has no triangles.');
  if (tc > IMPORT_LIMITS.maxTriangles) {
    throw new ModelImportError(`The model has ${tc.toLocaleString('en-US')} triangles; the limit is ${IMPORT_LIMITS.maxTriangles.toLocaleString('en-US')}. Reduce it (e.g. Blender's Decimate modifier) and import it again.`);
  }
  const w: Work = {
    pos: new Float64Array(vc * 3),
    nrm: new Float32Array(vc * 3),
    uv: new Float32Array(vc * 2),
    bone: new Int32Array(vc * 4).fill(-1),
    boneW: new Float32Array(vc * 4),
    mesh: new Int32Array(vc),
    meshNames: meshes.map((m) => m.name),
    tris: new Uint32Array(tc * 3),
    triMat: new Int32Array(tc),
    vc,
  };
  let vo = 0;
  let to = 0;
  meshes.forEach((m, mi) => {
    const n = m.positions.length / 3;
    for (let i = 0; i < n * 3; i++) {
      const v = m.positions[i];
      w.pos[vo * 3 + i] = Number.isFinite(v) ? v : 0;
      if (m.normals) w.nrm[vo * 3 + i] = Number.isFinite(m.normals[i]) ? m.normals[i] : 0;
    }
    if (m.uvs) for (let i = 0; i < n * 2; i++) w.uv[vo * 2 + i] = Number.isFinite(m.uvs[i]) ? m.uvs[i] : 0;
    if (m.joints && m.weights) {
      for (let i = 0; i < n * 4; i++) {
        if (m.weights[i] > 0) {
          w.bone[vo * 4 + i] = m.joints[i];
          w.boneW[vo * 4 + i] = m.weights[i];
        }
      }
    }
    w.mesh.fill(mi, vo, vo + n);
    for (const g of m.groups) {
      for (let t = g.start; t < g.start + g.count; t++) {
        w.tris[to * 3] = m.indices[t * 3] + vo;
        w.tris[to * 3 + 1] = m.indices[t * 3 + 1] + vo;
        w.tris[to * 3 + 2] = m.indices[t * 3 + 2] + vo;
        w.triMat[to] = g.material;
        to++;
      }
    }
    vo += n;
  });
  return w;
}

/** Applies a 3x3 rotation (and optional uniform scale and offset) to positions, normals and bone positions. */
function transformAll(w: Work, bones: V3[], r: R3, scale = 1, offset: V3 = [0, 0, 0]): void {
  for (let i = 0; i < w.vc; i++) {
    const p = rotApply(r, [w.pos[i * 3], w.pos[i * 3 + 1], w.pos[i * 3 + 2]]);
    w.pos[i * 3] = p[0] * scale + offset[0];
    w.pos[i * 3 + 1] = p[1] * scale + offset[1];
    w.pos[i * 3 + 2] = p[2] * scale + offset[2];
    const n = rotApply(r, [w.nrm[i * 3], w.nrm[i * 3 + 1], w.nrm[i * 3 + 2]]);
    w.nrm[i * 3] = n[0];
    w.nrm[i * 3 + 1] = n[1];
    w.nrm[i * 3 + 2] = n[2];
  }
  for (let b = 0; b < bones.length; b++) {
    const p = rotApply(r, bones[b]);
    bones[b] = [p[0] * scale + offset[0], p[1] * scale + offset[1], p[2] * scale + offset[2]];
  }
}

function bounds(w: Work): { min: V3; max: V3 } {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < w.vc; i++) {
    for (let k = 0; k < 3; k++) {
      const v = w.pos[i * 3 + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max };
}

const AXES: Record<string, V3> = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] };

function snapAxis(v: V3): string {
  const a = [Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])];
  const k = a[0] >= a[1] && a[0] >= a[2] ? 0 : a[1] >= a[2] ? 1 : 2;
  return (v[k] >= 0 ? '+' : '-') + 'xyz'[k];
}

/**
 * The up axis of a body without a skeleton. The format's axis is kept when the body is tall
 * along it; otherwise, of the long axes (a T-pose is as wide as it is tall), the one along which
 * the surface is least bunched in the middle is the height (arms are thin, the torso is not),
 * and the head is the end whose last tenth is narrower than the other's (feet stand apart).
 */
function detectUp(w: Work, hint: 'x' | 'y' | 'z' | null): string {
  const b = bounds(w);
  const ex = sub(b.max, b.min);
  const max = Math.max(ex[0], ex[1], ex[2]);
  const hintAxis = hint === 'x' ? 0 : hint === 'z' ? 2 : hint === 'y' ? 1 : -1;
  const long = [0, 1, 2].filter((a) => ex[a] >= 0.75 * max);
  if (hintAxis >= 0 && (long.includes(hintAxis) || (ex as number[])[hintAxis] >= 0.6 * max)) return '+' + 'xyz'[hintAxis];
  let axis = long[0];
  if (long.length > 1) {
    let best = Infinity;
    for (const a of long) {
      // Share of the surface (triangle area at the centroid) in the middle 40% along the axis.
      let mid = 0;
      let all = 0;
      for (let t = 0; t < w.tris.length; t += 3) {
        const i = w.tris[t] * 3;
        const j = w.tris[t + 1] * 3;
        const k = w.tris[t + 2] * 3;
        const area = len(cross([w.pos[j] - w.pos[i], w.pos[j + 1] - w.pos[i + 1], w.pos[j + 2] - w.pos[i + 2]], [w.pos[k] - w.pos[i], w.pos[k + 1] - w.pos[i + 1], w.pos[k + 2] - w.pos[i + 2]]));
        const c = (w.pos[i + a] + w.pos[j + a] + w.pos[k + a]) / 3;
        const u = (c - b.min[a]) / (ex[a] || 1);
        all += area;
        if (u > 0.3 && u < 0.7) mid += area;
      }
      const share = all > 0 ? mid / all : 1;
      if (share < best) {
        best = share;
        axis = a;
      }
    }
  }
  // Which end is the head: the narrower last tenth.
  const spread = (lo: number, hi: number): number => {
    const mn = [Infinity, Infinity, Infinity];
    const mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < w.vc; i++) {
      const u = (w.pos[i * 3 + axis] - b.min[axis]) / (ex[axis] || 1);
      if (u < lo || u > hi) continue;
      for (let k = 0; k < 3; k++) {
        mn[k] = Math.min(mn[k], w.pos[i * 3 + k]);
        mx[k] = Math.max(mx[k], w.pos[i * 3 + k]);
      }
    }
    let s = 0;
    for (let k = 0; k < 3; k++) if (k !== axis && mx[k] > mn[k]) s = Math.max(s, mx[k] - mn[k]);
    return s;
  };
  const low = spread(0, 0.1);
  const high = spread(0.9, 1);
  const sign = hintAxis === axis ? '+' : high <= low * 1.05 ? '+' : '-';
  return sign + 'xyz'[axis];
}

/** The centre (x, z) of the surface between heights y0 and y1 (triangles clipped to the band, by area). */
function bandCentroid(w: Work, y0: number, y1: number): V3 | null {
  let sx = 0;
  let sz = 0;
  let sa = 0;
  for (let t = 0; t < w.tris.length; t += 3) {
    let poly: V3[] = [];
    for (let k = 0; k < 3; k++) {
      const i = w.tris[t + k] * 3;
      poly.push([w.pos[i], w.pos[i + 1], w.pos[i + 2]]);
    }
    for (const [limit, above] of [
      [y0, true],
      [y1, false],
    ] as [number, boolean][]) {
      const out: V3[] = [];
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i];
        const q = poly[(i + 1) % poly.length];
        const pin = above ? p[1] >= limit : p[1] <= limit;
        const qin = above ? q[1] >= limit : q[1] <= limit;
        if (pin) out.push(p);
        if (pin !== qin) {
          const k = (limit - p[1]) / (q[1] - p[1]);
          out.push([p[0] + (q[0] - p[0]) * k, limit, p[2] + (q[2] - p[2]) * k]);
        }
      }
      poly = out;
      if (poly.length < 3) break;
    }
    if (poly.length < 3) continue;
    for (let i = 1; i + 1 < poly.length; i++) {
      const a = poly[0];
      const bb = poly[i];
      const c = poly[i + 1];
      const area = len(cross(sub(bb, a), sub(c, a))) / 2;
      sx += ((a[0] + bb[0] + c[0]) / 3) * area;
      sz += ((a[2] + bb[2] + c[2]) / 3) * area;
      sa += area;
    }
  }
  return sa > 0 ? [sx / sa, 0, sz / sa] : null;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = values.slice().sort((a, b) => a - b);
  return s[s.length >> 1];
}

// ------------------------------------------------------------------ slices (geometry rig)

/** The x-range of the part of triangle (a, b, c) between heights y0 and y1, or null. */
function clipXRange(w: Work, t: number, y0: number, y1: number): [number, number] | null {
  const pts: [number, number][] = [];
  for (let k = 0; k < 3; k++) {
    const i = w.tris[t * 3 + k];
    pts.push([w.pos[i * 3], w.pos[i * 3 + 1]]);
  }
  let poly = pts;
  for (const [limit, keepAbove] of [
    [y0, true],
    [y1, false],
  ] as [number, boolean][]) {
    const out: [number, number][] = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const pin = keepAbove ? p[1] >= limit : p[1] <= limit;
      const qin = keepAbove ? q[1] >= limit : q[1] <= limit;
      if (pin) out.push(p);
      if (pin !== qin) {
        const t2 = (limit - p[1]) / (q[1] - p[1]);
        out.push([p[0] + (q[0] - p[0]) * t2, limit]);
      }
    }
    poly = out;
    if (poly.length === 0) return null;
  }
  let mn = Infinity;
  let mx = -Infinity;
  for (const p of poly) {
    mn = Math.min(mn, p[0]);
    mx = Math.max(mx, p[0]);
  }
  return [mn, mx];
}

/** Merged x-intervals of the geometry in each horizontal slice. */
function sliceIntervals(w: Work, slices: number, height: number, triFilter?: (t: number) => boolean): [number, number][][] {
  const per: [number, number][][] = Array.from({ length: slices }, () => []);
  const dy = height / slices;
  const tc = w.tris.length / 3;
  for (let t = 0; t < tc; t++) {
    if (triFilter && !triFilter(t)) continue;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let k = 0; k < 3; k++) {
      const y = w.pos[w.tris[t * 3 + k] * 3 + 1];
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    const s0 = Math.max(0, Math.floor(y0 / dy));
    const s1 = Math.min(slices - 1, Math.floor(y1 / dy));
    for (let s = s0; s <= s1; s++) {
      const r = clipXRange(w, t, s * dy, (s + 1) * dy);
      if (r) per[s].push(r);
    }
  }
  const tol = height * 0.012;
  return per.map((list) => {
    list.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const r of list) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1] + tol) last[1] = Math.max(last[1], r[1]);
      else merged.push([r[0], r[1]]);
    }
    return merged;
  });
}

function centerBlob(list: [number, number][], x = 0): [number, number] | null {
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (const r of list) {
    const d = x < r[0] ? r[0] - x : x > r[1] ? x - r[1] : 0;
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

// ------------------------------------------------------------------ build

/**
 * Turns a parsed scene into a player model: merges the meshes, finds the up axis and the facing,
 * scales to 1.8 blocks with the feet on y = 0, binds every vertex to ModelBiped's parts (from the
 * skeleton's weights when the bone names are recognised, else by segmenting the body), turns
 * raised arms and spread legs down like Steve's, and packs textures and geometry.
 */
export async function buildPlayerModel(scene: SourceScene, files: ModelFiles | null, codec: ImageCodec, opts: BuildOptions): Promise<{ model: PlayerModelData; report: BuildReport }> {
  const report: BuildReport = { vertices: 0, triangles: 0, rig: 'geometry', up: '', facing: '', partVertices: {}, textures: [], warnings: [] };
  const w = merge(scene, opts.dropMeshes);
  fillMissingNormals(w);
  const bonePos: V3[] = scene.bones.map((b) => [...b.position] as V3);
  const boneClass: NameClass[] = scene.bones.map((b) => classifyName(b.name));
  // Bone classes with inheritance from the parents.
  const boneRegion: (NameClass['region'])[] = [];
  const boneSide: ('L' | 'R' | null)[] = [];
  const boneDepth: number[] = [];
  scene.bones.forEach((b, i) => {
    const own = boneClass[i];
    const p = b.parent >= 0 && b.parent < i ? b.parent : -1;
    boneDepth[i] = p >= 0 ? boneDepth[p] + 1 : 0;
    boneRegion[i] = own.region ?? (p >= 0 ? boneRegion[p] : null);
    boneSide[i] = own.region ? own.side ?? (own.region === 'arm' || own.region === 'leg' ? (p >= 0 && (boneRegion[p] === own.region) ? boneSide[p] : null) : null) : p >= 0 ? boneSide[p] : null;
  });
  const usedBones = new Set<number>();
  for (let i = 0; i < w.bone.length; i++) if (w.bone[i] >= 0) usedBones.add(w.bone[i]);
  const hasSkeleton = !opts.forceGeometryRig && usedBones.size >= 4;

  // ---- up axis
  let up: string;
  if (opts.up) up = opts.up;
  else {
    let fromBones: string | null = null;
    if (hasSkeleton) {
      const head = scene.bones.findIndex((_, i) => boneClass[i].region === 'head' && boneClass[i].kind === 'head');
      const feet = scene.bones.map((_, i) => i).filter((i) => boneRegion[i] === 'leg' && (boneClass[i].kind === 'foot' || boneClass[i].kind === 'toe'));
      if (head >= 0 && feet.length) {
        const f: V3 = [0, 0, 0];
        for (const i of feet) for (let k = 0; k < 3; k++) f[k] += bonePos[i][k] / feet.length;
        const d = sub(bonePos[head], f);
        if (len(d) > 0) fromBones = snapAxis(d);
      }
    }
    if (fromBones) up = fromBones;
    else up = detectUp(w, scene.upAxis);
  }
  report.up = up;
  transformAll(w, bonePos, rotBetween(AXES[up], [0, 1, 0]));

  // ---- facing (+Z in model space)
  let forward: V3 | null = null;
  let facingHow = '';
  if (opts.forward) {
    forward = AXES[opts.forward];
    facingHow = 'given';
  }
  if (!forward && hasSkeleton) {
    const meanOf = (side: 'L' | 'R'): V3 | null => {
      const ids = scene.bones.map((_, i) => i).filter((i) => (boneRegion[i] === 'arm' || boneRegion[i] === 'leg') && boneSide[i] === side);
      if (!ids.length) return null;
      const m: V3 = [0, 0, 0];
      for (const i of ids) for (let k = 0; k < 3; k++) m[k] += bonePos[i][k] / ids.length;
      return m;
    };
    const l = meanOf('L');
    const r = meanOf('R');
    if (l && r) {
      const right = sub(r, l);
      right[1] = 0;
      if (len(right) > 1e-6) {
        forward = AXES[snapAxis([right[2], 0, -right[0]])];
        facingHow = 'skeleton sides';
      }
    }
    if (!forward) {
      const toes = scene.bones.map((_, i) => i).filter((i) => boneClass[i].kind === 'toe');
      const ankles = scene.bones.map((_, i) => i).filter((i) => boneClass[i].kind === 'foot' && boneRegion[i] === 'leg');
      if (toes.length && ankles.length) {
        const d = sub(bonePos[toes[0]], bonePos[ankles[0]]);
        d[1] = 0;
        if (len(d) > 1e-6) {
          forward = AXES[snapAxis(d)];
          facingHow = 'skeleton toes';
        }
      }
    }
  }
  // Without a skeleton: a body is wider from shoulder to shoulder than from front to back, so
  // the narrower horizontal axis (at chest height) is the facing axis; its sign comes from the
  // toes or the format, and a per-model yaw can turn it round.
  let facingAxis: 0 | 2 | -1 = -1;
  if (!forward) {
    const b = bounds(w);
    const h = b.max[1] - b.min[1];
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let i = 0; i < w.vc; i++) {
      const y = (w.pos[i * 3 + 1] - b.min[1]) / h;
      if (y < 0.5 || y > 0.8) continue;
      x0 = Math.min(x0, w.pos[i * 3]);
      x1 = Math.max(x1, w.pos[i * 3]);
      z0 = Math.min(z0, w.pos[i * 3 + 2]);
      z1 = Math.max(z1, w.pos[i * 3 + 2]);
    }
    const ex = x1 - x0;
    const ez = z1 - z0;
    if (ex > ez * 1.25) facingAxis = 2;
    else if (ez > ex * 1.25) facingAxis = 0;
  }
  if (!forward) {
    // Toes stick out in front of the ankles: the surface's centre in the lowest band lies
    // ahead of the centre a little higher up.
    const b = bounds(w);
    const h = b.max[1] - b.min[1];
    const low = bandCentroid(w, b.min[1], b.min[1] + h * 0.025);
    const ankle = bandCentroid(w, b.min[1] + h * 0.05, b.min[1] + h * 0.09);
    if (low && ankle) {
      const d: V3 = [low[0] - ankle[0], 0, low[2] - ankle[2]];
      if (facingAxis === 0) d[2] = 0;
      else if (facingAxis === 2) d[0] = 0;
      if (len(d) > h * 0.012) {
        forward = AXES[snapAxis(d)];
        facingHow = 'feet';
      }
    }
  }
  if (!forward) {
    const hint: V3 = scene.frontHint ?? [0, 0, 1];
    if (facingAxis === 0) {
      forward = [hint[0] < 0 ? -1 : 1, 0, 0];
      facingHow = 'body width';
    } else if (facingAxis === 2) {
      forward = [0, 0, hint[2] < 0 ? -1 : 1];
      facingHow = 'body width';
    } else {
      forward = AXES[snapAxis(hint)];
      facingHow = 'format default';
    }
  }
  report.facing = `${snapAxis(forward)} (${facingHow})`;
  const yawFix = rotBetween(forward, [0, 0, 1]);
  const extraYaw = opts.yaw ? axisAngle([0, 1, 0], (opts.yaw * Math.PI) / 180) : null;
  transformAll(w, bonePos, yawFix);
  if (extraYaw) transformAll(w, bonePos, extraYaw);

  // ---- scale and place
  const normalise = (): void => {
    const b = bounds(w);
    const h = b.max[1] - b.min[1];
    if (!(h > 1e-9)) throw new ModelImportError('The model is flat (no height).');
    const s = MODEL_HEIGHT / h;
    // Across: the middle of the chest band (arms and shoulders are symmetric); front to back:
    // the median of the body. (Rigging centres again on the joints.)
    const zs: number[] = [];
    let x0 = Infinity;
    let x1 = -Infinity;
    const step = Math.max(1, Math.floor(w.vc / 20000));
    for (let i = 0; i < w.vc; i++) {
      const y = (w.pos[i * 3 + 1] - b.min[1]) / h;
      if (y > 0.4 && y < 0.75) {
        x0 = Math.min(x0, w.pos[i * 3]);
        x1 = Math.max(x1, w.pos[i * 3]);
      }
      if (i % step === 0 && y > 0.1 && y < 0.85) zs.push(w.pos[i * 3 + 2]);
    }
    const cx = Number.isFinite(x0) ? (x0 + x1) / 2 : (b.min[0] + b.max[0]) / 2;
    const cz = median(zs.length ? zs : [0]);
    transformAll(w, bonePos, [1, 0, 0, 0, 1, 0, 0, 0, 1], s, [-cx * s, -b.min[1] * s, -cz * s]);
  };
  normalise();

  // ---- rig: part weights per vertex (6 per vertex)
  const partW = new Float32Array(w.vc * PART_COUNT);
  const pivots: V3[] = [];
  const hands: V3[] = [];
  const feet: V3[] = [];
  let rigSource: 'skeleton' | 'geometry' = 'geometry';
  if (hasSkeleton) {
    const r = rigFromSkeleton(w, scene, bonePos, boneClass, boneRegion, boneSide, boneDepth, partW);
    if (r) {
      rigSource = 'skeleton';
      pivots.push(...r.pivots);
      hands.push(...r.hands);
      feet.push(...r.feet);
    } else report.warnings.push('The skeleton has no recognisable head, arms and legs; the model was rigged by its shape.');
  }
  if (rigSource === 'geometry') {
    const r = rigFromGeometry(w, partW, report);
    pivots.push(...r.pivots);
    hands.push(...r.hands);
    feet.push(...r.feet);
  }
  report.rig = rigSource;

  // ---- pose the limbs like Steve's: arms hanging down, legs straight
  const posed: R3[] = Array.from({ length: PART_COUNT }, () => [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const TILT = (4 * Math.PI) / 180;
  const limbTargets: [number, V3, V3][] = [
    [PART_RIGHT_ARM, hands[0], norm([-Math.sin(TILT), -Math.cos(TILT), 0])],
    [PART_LEFT_ARM, hands[1], norm([Math.sin(TILT), -Math.cos(TILT), 0])],
    [PART_RIGHT_LEG, feet[0], [0, -1, 0]],
    [PART_LEFT_LEG, feet[1], [0, -1, 0]],
  ];
  for (const [part, end, target] of limbTargets) {
    const d = sub(end, pivots[part]);
    if (len(d) < 1e-6) continue;
    const dir = norm(d);
    // Leave limbs that already hang within a few degrees.
    if (dot(dir, target) > Math.cos((6 * Math.PI) / 180)) continue;
    const r = rotBetween(dir, target);
    // Keep the limb's twist: only bend in the plane of the current and the wanted direction.
    posed[part] = r;
  }
  for (let i = 0; i < w.vc; i++) {
    const p: V3 = [w.pos[i * 3], w.pos[i * 3 + 1], w.pos[i * 3 + 2]];
    const n: V3 = [w.nrm[i * 3], w.nrm[i * 3 + 1], w.nrm[i * 3 + 2]];
    const np: V3 = [0, 0, 0];
    const nn: V3 = [0, 0, 0];
    let any = false;
    for (let k = 0; k < PART_COUNT; k++) {
      const wt = partW[i * PART_COUNT + k];
      if (wt <= 0) continue;
      const r = posed[k];
      if (r[0] === 1 && r[4] === 1 && r[8] === 1) {
        for (let c = 0; c < 3; c++) {
          np[c] += p[c] * wt;
          nn[c] += n[c] * wt;
        }
      } else {
        any = true;
        const q = rotApply(r, sub(p, pivots[k]));
        const rn = rotApply(r, n);
        for (let c = 0; c < 3; c++) {
          np[c] += (q[c] + pivots[k][c]) * wt;
          nn[c] += rn[c] * wt;
        }
      }
    }
    if (!any) continue;
    w.pos[i * 3] = np[0];
    w.pos[i * 3 + 1] = np[1];
    w.pos[i * 3 + 2] = np[2];
    const nl = len(nn) || 1;
    w.nrm[i * 3] = nn[0] / nl;
    w.nrm[i * 3 + 1] = nn[1] / nl;
    w.nrm[i * 3 + 2] = nn[2] / nl;
  }
  for (const [k, list] of [
    [PART_RIGHT_ARM, hands],
    [PART_LEFT_ARM, hands],
  ] as [number, V3[]][]) {
    const idx = k === PART_RIGHT_ARM ? 0 : 1;
    const q = rotApply(posed[k], sub(list[idx], pivots[k]));
    list[idx] = [q[0] + pivots[k][0], q[1] + pivots[k][1], q[2] + pivots[k][2]];
  }
  // Raised arms may have set the height: fit again, moving the rig points along.
  {
    const b = bounds(w);
    const h = b.max[1] - b.min[1];
    const s = MODEL_HEIGHT / h;
    const fix = (p: V3): V3 => [p[0] * s, (p[1] - b.min[1]) * s, p[2] * s];
    if (Math.abs(s - 1) > 1e-4 || Math.abs(b.min[1]) > 1e-4) {
      for (let i = 0; i < w.vc; i++) {
        w.pos[i * 3] *= s;
        w.pos[i * 3 + 1] = (w.pos[i * 3 + 1] - b.min[1]) * s;
        w.pos[i * 3 + 2] *= s;
      }
      for (let k = 0; k < pivots.length; k++) pivots[k] = fix(pivots[k]);
      for (let k = 0; k < hands.length; k++) hands[k] = fix(hands[k]);
    }
  }

  // ---- centre on the joints (props on one side do not move the body off the hitbox)
  {
    const cx = (pivots[PART_RIGHT_ARM][0] + pivots[PART_LEFT_ARM][0] + pivots[PART_RIGHT_LEG][0] + pivots[PART_LEFT_LEG][0]) / 4;
    const cz = (pivots[PART_RIGHT_LEG][2] + pivots[PART_LEFT_LEG][2]) / 2;
    if (Math.abs(cx) < 0.5 && Math.abs(cz) < 0.5) {
      for (let i = 0; i < w.vc; i++) {
        w.pos[i * 3] -= cx;
        w.pos[i * 3 + 2] -= cz;
      }
      for (const p of new Set([...pivots, ...hands])) {
        p[0] -= cx;
        p[2] -= cz;
      }
    }
  }

  // ---- head box
  const headMin: V3 = [Infinity, Infinity, Infinity];
  const headMax: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < w.vc; i++) {
    if (partW[i * PART_COUNT + PART_HEAD] < 0.5) continue;
    for (let k = 0; k < 3; k++) {
      headMin[k] = Math.min(headMin[k], w.pos[i * 3 + k]);
      headMax[k] = Math.max(headMax[k], w.pos[i * 3 + k]);
    }
  }
  if (!Number.isFinite(headMin[0])) {
    headMin.splice(0, 3, -0.15, 1.5, -0.15);
    headMax.splice(0, 3, 0.15, 1.8, 0.15);
  }
  const rig: ModelRig = {
    pivots: pivots as [number, number, number][],
    hands: hands as [number, number, number][],
    headCenter: [(headMin[0] + headMax[0]) / 2, (headMin[1] + headMax[1]) / 2, (headMin[2] + headMax[2]) / 2],
    headSize: Math.max(0.05, headMax[1] - headMin[1]),
    source: rigSource,
  };

  // ---- textures and materials
  const { materials, textures, textureNames } = await packMaterials(scene, w, files, codec, opts, report);
  report.textures = textureNames;

  // ---- vertices: joints and weights
  const joints = new Uint8Array(w.vc * 4);
  const weights = new Uint8Array(w.vc * 4);
  const counts = new Array(PART_COUNT).fill(0);
  for (let i = 0; i < w.vc; i++) {
    const list: [number, number][] = [];
    for (let k = 0; k < PART_COUNT; k++) {
      const v = partW[i * PART_COUNT + k];
      if (v > 0.004) list.push([k, v]);
    }
    if (list.length === 0) list.push([PART_BODY, 1]);
    list.sort((a, b) => b[1] - a[1]);
    const top = list.slice(0, 4);
    const sum = top.reduce((s, e) => s + e[1], 0);
    let left = 255;
    top.forEach(([k, v], j) => {
      const q = j === top.length - 1 ? left : Math.round((v / sum) * 255);
      joints[i * 4 + j] = k;
      weights[i * 4 + j] = Math.max(0, Math.min(left, q));
      left -= weights[i * 4 + j];
    });
    counts[top[0][0]]++;
  }
  PART_NAMES.forEach((n, k) => (report.partVertices[n] = counts[k]));

  // ---- triangles ordered by alpha mode then material
  const tc = w.tris.length / 3;
  const order = [...Array(tc).keys()].filter((t) => {
    const a = w.tris[t * 3];
    const b = w.tris[t * 3 + 1];
    const c = w.tris[t * 3 + 2];
    return a !== b && b !== c && a !== c && w.triMat[t] >= 0;
  });
  const matKey = (m: number) => (materials[m]?.alpha ?? 0) * 1000 + m;
  order.sort((x, y) => matKey(w.triMat[x]) - matKey(w.triMat[y]));
  const wide = w.vc > 65535;
  const indices = wide ? new Uint32Array(order.length * 3) : new Uint16Array(order.length * 3);
  const groups: PlayerModelData['groups'] = [];
  order.forEach((t, j) => {
    indices[j * 3] = w.tris[t * 3];
    indices[j * 3 + 1] = w.tris[t * 3 + 1];
    indices[j * 3 + 2] = w.tris[t * 3 + 2];
    const m = w.triMat[t];
    const last = groups[groups.length - 1];
    if (last && last.material === m) last.count += 3;
    else groups.push({ start: j * 3, count: 3, material: m });
  });
  const positions = new Float32Array(w.vc * 3);
  for (let i = 0; i < w.vc * 3; i++) positions[i] = w.pos[i];
  const normals = new Int8Array(w.vc * 3);
  for (let i = 0; i < w.vc * 3; i++) normals[i] = Math.max(-127, Math.min(127, Math.round(w.nrm[i] * 127)));
  report.vertices = w.vc;
  report.triangles = order.length;
  const model: PlayerModelData = {
    name: opts.name,
    credits: opts.credits ?? scene.info.join('; '),
    positions,
    normals,
    uvs: w.uv,
    joints,
    weights,
    indices,
    groups,
    materials,
    textures,
    rig,
  };
  return { model, report };
}

// ------------------------------------------------------------------ skeleton rig

const REGION_PART = (region: NameClass['region'], side: 'L' | 'R' | null, x: number): number => {
  switch (region) {
    case 'head':
      return PART_HEAD;
    case 'arm':
      return (side ?? (x < 0 ? 'R' : 'L')) === 'R' ? PART_RIGHT_ARM : PART_LEFT_ARM;
    case 'leg':
      return (side ?? (x < 0 ? 'R' : 'L')) === 'R' ? PART_RIGHT_LEG : PART_LEFT_LEG;
    default:
      return PART_BODY;
  }
};

function rigFromSkeleton(
  w: Work,
  scene: SourceScene,
  bonePos: V3[],
  boneClass: NameClass[],
  boneRegion: NameClass['region'][],
  boneSide: ('L' | 'R' | null)[],
  boneDepth: number[],
  partW: Float32Array,
): { pivots: V3[]; hands: V3[]; feet: V3[] } | null {
  const nb = scene.bones.length;
  const bonePart = new Int32Array(nb);
  for (let b = 0; b < nb; b++) bonePart[b] = REGION_PART(boneRegion[b], boneSide[b], bonePos[b][0]);
  // Shallowest bone of each part = its root joint.
  const rootOf = (part: number, pick?: (b: number) => boolean): number => {
    let best = -1;
    for (let b = 0; b < nb; b++) {
      if (bonePart[b] !== part || (pick && !pick(b))) continue;
      if (best < 0 || boneDepth[b] < boneDepth[best] || (boneDepth[b] === boneDepth[best] && boneClass[b].kind === 'head')) best = b;
    }
    return best;
  };
  const head = rootOf(PART_HEAD, (b) => boneClass[b].region === 'head');
  const arms = [rootOf(PART_RIGHT_ARM), rootOf(PART_LEFT_ARM)];
  const legs = [rootOf(PART_RIGHT_LEG), rootOf(PART_LEFT_LEG)];
  if (head < 0 || arms.some((b) => b < 0) || legs.some((b) => b < 0)) return null;
  // Vertex weights summed per part.
  const unassigned: number[] = [];
  for (let i = 0; i < w.vc; i++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      const b = w.bone[i * 4 + k];
      const wt = w.boneW[i * 4 + k];
      if (b < 0 || b >= nb || !(wt > 0)) continue;
      partW[i * PART_COUNT + bonePart[b]] += wt;
      sum += wt;
    }
    if (sum > 0) for (let k = 0; k < PART_COUNT; k++) partW[i * PART_COUNT + k] /= sum;
    else unassigned.push(i);
  }
  // Unskinned parts (hats, props): the part of the nearest bone.
  const used = [...Array(nb).keys()].filter((b) => boneRegion[b] !== null);
  for (const i of unassigned) {
    const p: V3 = [w.pos[i * 3], w.pos[i * 3 + 1], w.pos[i * 3 + 2]];
    let best = -1;
    let bestD = Infinity;
    for (const b of used) {
      const d = len(sub(p, bonePos[b]));
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    partW[i * PART_COUNT + (best >= 0 ? bonePart[best] : PART_BODY)] = 1;
  }
  const neck = rootOf(PART_BODY, (b) => boneClass[b].kind === 'neck');
  const headPivot = bonePos[head];
  const bodyPivot: V3 = neck >= 0 ? [...bonePos[neck]] as V3 : [...headPivot] as V3;
  // Hands and feet: the first hand/foot joint of each side (wrist, ankle), else the farthest bone.
  const endOf = (part: number, root: number, kinds: string[]): V3 => {
    let best = -1;
    for (let b = 0; b < nb; b++) {
      if (bonePart[b] !== part || !kinds.includes(boneClass[b].kind)) continue;
      if (best < 0 || boneDepth[b] < boneDepth[best]) best = b;
    }
    if (best >= 0) return bonePos[best];
    let far = root;
    for (let b = 0; b < nb; b++) if (bonePart[b] === part && len(sub(bonePos[b], bonePos[root])) > len(sub(bonePos[far], bonePos[root]))) far = b;
    return bonePos[far];
  };
  const wrists = [endOf(PART_RIGHT_ARM, arms[0], ['hand']), endOf(PART_LEFT_ARM, arms[1], ['hand'])];
  const ankles = [endOf(PART_RIGHT_LEG, legs[0], ['foot', 'toe']), endOf(PART_LEFT_LEG, legs[1], ['foot', 'toe'])];
  // Palms: a little past the wrist, towards the arm's far vertices.
  const palms = wrists.map((wr, s) => palmFrom(w, partW, s === 0 ? PART_RIGHT_ARM : PART_LEFT_ARM, bonePos[arms[s]], wr));
  const pivots: V3[] = [[...headPivot] as V3, bodyPivot, [...bonePos[arms[0]]] as V3, [...bonePos[arms[1]]] as V3, [...bonePos[legs[0]]] as V3, [...bonePos[legs[1]]] as V3];
  return { pivots, hands: palms, feet: ankles };
}

/** The palm: halfway from the wrist to the arm's farthest vertices (the finger tips). */
function palmFrom(w: Work, partW: Float32Array, part: number, shoulder: V3, wrist: V3): V3 {
  const dir = norm(sub(wrist, shoulder));
  const armLen = len(sub(wrist, shoulder));
  let far = 0;
  const tip: V3 = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < w.vc; i++) {
    if (partW[i * PART_COUNT + part] < 0.5) continue;
    const d = dot(sub([w.pos[i * 3], w.pos[i * 3 + 1], w.pos[i * 3 + 2]], shoulder), dir);
    if (d > far) far = d;
  }
  for (let i = 0; i < w.vc; i++) {
    if (partW[i * PART_COUNT + part] < 0.5) continue;
    const p: V3 = [w.pos[i * 3], w.pos[i * 3 + 1], w.pos[i * 3 + 2]];
    if (dot(sub(p, shoulder), dir) > far - armLen * 0.12) {
      for (let k = 0; k < 3; k++) tip[k] += p[k];
      n++;
    }
  }
  if (!n) return wrist;
  const t: V3 = [tip[0] / n, tip[1] / n, tip[2] / n];
  return [(wrist[0] + t[0]) / 2, (wrist[1] + t[1]) / 2, (wrist[2] + t[2]) / 2];
}

// ------------------------------------------------------------------ geometry rig

function rigFromGeometry(w: Work, partW: Float32Array, report: BuildReport): { pivots: V3[]; hands: V3[]; feet: V3[] } {
  const H = MODEL_HEIGHT;
  const SL = 120;
  const dy = H / SL;
  const slices = sliceIntervals(w, SL, H);
  const blobAt = (y: number): [number, number] | null => centerBlob(slices[Math.max(0, Math.min(SL - 1, Math.floor(y / dy)))] ?? []);
  const widthAt = (s: number): number => {
    const b = centerBlob(slices[s]);
    return b ? b[1] - b[0] : 0;
  };
  // Neck: the narrowest centre slice between 70% and 92% of the height.
  let neckS = Math.floor(0.86 * SL);
  {
    let min = Infinity;
    for (let s = Math.floor(0.7 * SL); s <= Math.floor(0.92 * SL); s++) {
      const wd = widthAt(s);
      if (wd > 0 && wd < min * 0.97) {
        min = wd;
        neckS = s;
      }
    }
  }
  const neckY = neckS * dy;
  // Crotch: the first slice from the knees up where the middle is filled.
  let crotchY = -1;
  const filledAt = (s: number) => (slices[s] ?? []).some((r) => r[0] <= 0 && r[1] >= 0);
  if (!filledAt(Math.floor(0.12 * SL))) {
    for (let s = Math.floor(0.25 * SL); s < Math.floor(0.62 * SL); s++) {
      if (filledAt(s)) {
        crotchY = s * dy;
        break;
      }
    }
  }
  if (crotchY < 0) {
    // Legs touch (blocky bodies, robes): the hips are where the total width jumps.
    let best = 0;
    for (let s = Math.floor(0.3 * SL); s < Math.floor(0.62 * SL); s++) {
      const total = (i: number) => {
        const l = slices[i] ?? [];
        return l.length ? l[l.length - 1][1] - l[0][0] : 0;
      };
      const jump = total(s) - total(s - 3);
      if (jump > best) {
        best = jump;
        crotchY = s * dy;
      }
    }
    if (best < 0.05 * H) crotchY = 0.47 * H;
    report.warnings.push('The legs could not be told apart by a gap; the hips were placed by the body shape.');
  }
  // Torso half-widths per slice (the centre blob), capped where arms merge into it.
  const torsoHalf = new Float32Array(SL);
  for (let s = 0; s < SL; s++) {
    const b = centerBlob(slices[s]);
    torsoHalf[s] = b ? Math.max(Math.abs(b[0]), Math.abs(b[1])) : 0;
  }
  // Components by welded positions.
  const comp = components(w);
  const compCount = comp.count;
  const cb = Array.from({ length: compCount }, () => ({ min: [Infinity, Infinity, Infinity] as V3, max: [-Infinity, -Infinity, -Infinity] as V3, n: 0 }));
  for (let i = 0; i < w.vc; i++) {
    const c = cb[comp.of[i]];
    c.n++;
    for (let k = 0; k < 3; k++) {
      c.min[k] = Math.min(c.min[k], w.pos[i * 3 + k]);
      c.max[k] = Math.max(c.max[k], w.pos[i * 3 + k]);
    }
  }
  // The torso: the component crossing the centre at chest height.
  const chestY = crotchY + (neckY - crotchY) * 0.6;
  const chestBlob = blobAt(chestY);
  let torsoHalfChest = chestBlob ? Math.max(Math.abs(chestBlob[0]), Math.abs(chestBlob[1])) : 0.2;
  const tol = H * 0.02;
  // A torso that is a piece of its own (blocky bodies) gives the torso's width exactly.
  let torsoComp = -1;
  for (let c = 0; c < compCount; c++) {
    const b = cb[c];
    if (b.min[0] > 0 || b.max[0] < 0 || b.min[1] > chestY || b.max[1] < chestY) continue;
    if (b.min[1] < crotchY - tol * 3 || b.max[1] > neckY + tol * 3) continue;
    if (torsoComp < 0 || b.n > cb[torsoComp].n) torsoComp = c;
  }
  if (torsoComp >= 0) torsoHalfChest = Math.max(Math.abs(cb[torsoComp].min[0]), Math.abs(cb[torsoComp].max[0]));
  else {
    // Arms that touch the torso widen the chest slice; the hips (just below the crotch) are
    // about as wide as the torso.
    const hip = blobAt(crotchY - H * 0.04);
    const hipHalf = hip ? Math.max(Math.abs(hip[0]), Math.abs(hip[1])) : 0;
    if (hipHalf > 0 && torsoHalfChest > hipHalf * 1.35) torsoHalfChest = hipHalf * 1.05;
  }
  const compPart = new Int32Array(compCount).fill(-1);
  for (let c = 0; c < compCount; c++) {
    const b = cb[c];
    const cx = (b.min[0] + b.max[0]) / 2;
    if (b.min[1] >= neckY - tol || (b.min[1] > crotchY && b.max[1] - neckY > 0.7 * (b.max[1] - b.min[1]))) compPart[c] = PART_HEAD;
    else if (b.max[1] <= crotchY + tol && (b.max[0] <= tol || b.min[0] >= -tol)) compPart[c] = cx < 0 ? PART_RIGHT_LEG : PART_LEFT_LEG;
    else if (c !== torsoComp && b.min[1] >= crotchY - tol * 4 && b.max[1] <= neckY + tol * 2 && (b.max[0] <= -torsoHalfChest + tol || b.min[0] >= torsoHalfChest - tol)) compPart[c] = cx < 0 ? PART_RIGHT_ARM : PART_LEFT_ARM;
    else if (c === torsoComp) compPart[c] = PART_BODY;
  }
  // Mesh names (Rockstar components, "Left Arm"...).
  const meshPart = w.meshNames.map((n) => {
    const c = classifyName(n);
    return c;
  });
  for (let i = 0; i < w.vc; i++) {
    const x = w.pos[i * 3];
    const y = w.pos[i * 3 + 1];
    const s = Math.max(0, Math.min(SL - 1, Math.floor(y / dy)));
    let part = compPart[comp.of[i]];
    const named = meshPart[w.mesh[i]];
    if (part < 0 && named.region) {
      if (named.region === 'head') part = PART_HEAD;
      else if (named.region === 'arm' && named.side) part = named.side === 'R' ? PART_RIGHT_ARM : PART_LEFT_ARM;
      else if (named.region === 'leg' && named.side) part = named.side === 'R' ? PART_RIGHT_LEG : PART_LEFT_LEG;
      else if (named.region === 'arm' && named.kind === 'hand') part = x < 0 ? PART_RIGHT_ARM : PART_LEFT_ARM;
      else if (named.region === 'leg' && (named.kind === 'foot' || named.kind === 'toe')) part = x < 0 ? PART_RIGHT_LEG : PART_LEFT_LEG;
      else if (named.region === 'leg') part = y < crotchY ? (x < 0 ? PART_RIGHT_LEG : PART_LEFT_LEG) : PART_BODY;
    }
    if (part < 0) {
      if (y >= neckY) part = PART_HEAD;
      else if (y < crotchY) part = x < 0 ? PART_RIGHT_LEG : PART_LEFT_LEG;
      else {
        const half = torsoComp >= 0 ? torsoHalfChest : Math.min(torsoHalf[s] || torsoHalfChest, torsoHalfChest * 1.1);
        if (Math.abs(x) > half + H * 0.004) part = x < 0 ? PART_RIGHT_ARM : PART_LEFT_ARM;
        else part = PART_BODY;
      }
    }
    partW[i * PART_COUNT + part] = 1;
  }
  smoothJointWeights(w, partW, comp.of);
  // Pivots.
  const box = (part: number) => {
    const min: V3 = [Infinity, Infinity, Infinity];
    const max: V3 = [-Infinity, -Infinity, -Infinity];
    let n = 0;
    for (let i = 0; i < w.vc; i++) {
      if (partW[i * PART_COUNT + part] < 0.5) continue;
      n++;
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], w.pos[i * 3 + k]);
        max[k] = Math.max(max[k], w.pos[i * 3 + k]);
      }
    }
    return n ? { min, max } : null;
  };
  const headBox = box(PART_HEAD);
  const neckBlob = blobAt(neckY);
  const neckCx = neckBlob ? (neckBlob[0] + neckBlob[1]) / 2 : 0;
  const headZ = headBox ? (headBox.min[2] + headBox.max[2]) / 2 : 0;
  const headPivot: V3 = [neckCx, neckY, headZ];
  const pivots: V3[] = [headPivot, [...headPivot] as V3];
  const hands: V3[] = [];
  const feet: V3[] = [];
  for (const [part, sign] of [
    [PART_RIGHT_ARM, -1],
    [PART_LEFT_ARM, 1],
  ] as [number, number][]) {
    const r = limbEnds(w, partW, part, 'arm');
    if (r) {
      pivots[part] = r.root;
      hands.push(r.end);
    } else {
      const sh: V3 = [sign * torsoHalfChest, neckY - H * 0.06, headZ];
      pivots[part] = sh;
      hands.push([sh[0], crotchY, sh[2]]);
      report.warnings.push(`No ${sign < 0 ? 'right' : 'left'} arm was found.`);
    }
  }
  for (const [part, sign] of [
    [PART_RIGHT_LEG, -1],
    [PART_LEFT_LEG, 1],
  ] as [number, number][]) {
    const r = limbEnds(w, partW, part, 'leg');
    if (r) {
      pivots[part] = r.root;
      feet.push(r.end);
    } else {
      pivots[part] = [sign * H * 0.06, crotchY, headZ];
      feet.push([sign * H * 0.06, 0, headZ]);
      report.warnings.push(`No ${sign < 0 ? 'right' : 'left'} leg was found.`);
    }
  }
  return { pivots, hands, feet };
}

/** Shoulder/hip joint and hand/foot of a limb from its vertices (principal axis, inner end). */
function limbEnds(w: Work, partW: Float32Array, part: number, kind: 'arm' | 'leg'): { root: V3; end: V3 } | null {
  const pts: V3[] = [];
  for (let i = 0; i < w.vc; i++) if (partW[i * PART_COUNT + part] >= 0.5) pts.push([w.pos[i * 3], w.pos[i * 3 + 1], w.pos[i * 3 + 2]]);
  if (pts.length < 3) return null;
  const c: V3 = [0, 0, 0];
  for (const p of pts) for (let k = 0; k < 3; k++) c[k] += p[k] / pts.length;
  // Principal axis by power iteration on the covariance.
  const cov = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of pts) {
    const d = sub(p, c);
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) cov[a * 3 + b] += d[a] * d[b];
  }
  // Start from the farthest point (a start orthogonal to the long axis would never leave it).
  let far: V3 = [0, -1, 0];
  let farD = -1;
  for (const p of pts) {
    const d = len(sub(p, c));
    if (d > farD) {
      farD = d;
      far = sub(p, c);
    }
  }
  let axis: V3 = norm(far);
  for (let it = 0; it < 32; it++) axis = norm(rotApply(cov, axis));
  // The root end is the one nearer the body's centre line and higher up.
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of pts) {
    const t = dot(sub(p, c), axis);
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
  }
  const endPoint = (t: number): V3 => [c[0] + axis[0] * t, c[1] + axis[1] * t, c[2] + axis[2] * t];
  const a = endPoint(lo);
  const b = endPoint(hi);
  const score = (p: V3) => p[1] * 2 - Math.abs(p[0]);
  const rootT = score(a) > score(b) ? lo : hi;
  const endT = rootT === lo ? hi : lo;
  const span = hi - lo;
  const near = (t0: number, frac: number): V3 => {
    const m: V3 = [0, 0, 0];
    let n = 0;
    for (const p of pts) {
      if (Math.abs(dot(sub(p, c), axis) - t0) <= span * frac) {
        for (let k = 0; k < 3; k++) m[k] += p[k];
        n++;
      }
    }
    return n ? [m[0] / n, m[1] / n, m[2] / n] : endPoint(t0);
  };
  const rootCentre = near(rootT, 0.1);
  const endCentre = near(endT, kind === 'arm' ? 0.12 : 0.08);
  if (kind === 'arm') {
    // The shoulder joint sits a little inside the arm's top end.
    const dirIn = norm(sub(endCentre, rootCentre));
    const inset = span * 0.08;
    return { root: [rootCentre[0] + dirIn[0] * inset, rootCentre[1] + dirIn[1] * inset, rootCentre[2] + dirIn[2] * inset], end: endCentre };
  }
  const top = Math.max(...pts.map((p) => p[1]));
  return { root: [rootCentre[0], top, rootCentre[2]], end: endCentre };
}

/**
 * Weld ids: vertices at the same place with about the same normal are one surface point (UV
 * seams split vertices, but the surface goes on); boxes that only touch (a blocky arm against
 * the torso) have opposite normals there and stay apart.
 */
function weldIds(w: Work): { id: Int32Array; count: number } {
  const q = 1e-4 * MODEL_HEIGHT;
  const map = new Map<string, number>();
  const id = new Int32Array(w.vc);
  for (let i = 0; i < w.vc; i++) {
    const key = `${Math.round(w.pos[i * 3] / q)},${Math.round(w.pos[i * 3 + 1] / q)},${Math.round(w.pos[i * 3 + 2] / q)}|${Math.round(w.nrm[i * 3] * 3)},${Math.round(w.nrm[i * 3 + 1] * 3)},${Math.round(w.nrm[i * 3 + 2] * 3)}`;
    let v = map.get(key);
    if (v === undefined) {
      v = map.size;
      map.set(key, v);
    }
    id[i] = v;
  }
  return { id, count: map.size };
}

/**
 * Connected pieces of the mesh (shared vertices or welded points). Small flat pieces (the end
 * caps of a box) join the piece whose bounds contain them.
 */
function components(w: Work): { of: Int32Array; count: number } {
  const parent = new Int32Array(w.vc);
  for (let i = 0; i < w.vc; i++) parent[i] = i;
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const weld = weldIds(w);
  const firstOf = new Int32Array(weld.count).fill(-1);
  for (let i = 0; i < w.vc; i++) {
    const o = firstOf[weld.id[i]];
    if (o < 0) firstOf[weld.id[i]] = i;
    else union(i, o);
  }
  for (let t = 0; t < w.tris.length; t += 3) {
    union(w.tris[t], w.tris[t + 1]);
    union(w.tris[t], w.tris[t + 2]);
  }
  // Bounds per root.
  const boxes = new Map<number, { min: V3; max: V3; n: number }>();
  for (let i = 0; i < w.vc; i++) {
    const r = find(i);
    let b = boxes.get(r);
    if (!b) {
      b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], n: 0 };
      boxes.set(r, b);
    }
    b.n++;
    for (let k = 0; k < 3; k++) {
      b.min[k] = Math.min(b.min[k], w.pos[i * 3 + k]);
      b.max[k] = Math.max(b.max[k], w.pos[i * 3 + k]);
    }
  }
  const tol = MODEL_HEIGHT * 0.004;
  const roots = [...boxes.keys()];
  for (const r of roots) {
    const b = boxes.get(r)!;
    const ext = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
    const flat = Math.min(...ext) < MODEL_HEIGHT * 0.006;
    if (!flat || b.n > 64) continue;
    let best = -1;
    let bestVol = Infinity;
    for (const o of roots) {
      if (o === r) continue;
      const c = boxes.get(o)!;
      if (c.n <= b.n) continue;
      let inside = true;
      for (let k = 0; k < 3; k++) if (b.min[k] < c.min[k] - tol || b.max[k] > c.max[k] + tol) inside = false;
      if (!inside) continue;
      const vol = (c.max[0] - c.min[0]) * (c.max[1] - c.min[1]) * (c.max[2] - c.min[2]);
      if (vol < bestVol) {
        bestVol = vol;
        best = o;
      }
    }
    if (best >= 0) union(r, best);
  }
  const ids = new Map<number, number>();
  const of = new Int32Array(w.vc);
  for (let i = 0; i < w.vc; i++) {
    const r = find(i);
    let id = ids.get(r);
    if (id === undefined) {
      id = ids.size;
      ids.set(r, id);
    }
    of[i] = id;
  }
  return { of, count: ids.size };
}

/**
 * Softens hard part borders inside one connected surface: a few rounds of averaging each
 * vertex's weights with its neighbours, only near borders, so shoulders and hips bend instead
 * of tearing.
 */
function smoothJointWeights(w: Work, partW: Float32Array, compOf: Int32Array): void {
  // Welded vertex ids so seams in UVs do not cut the smoothing.
  const welded = weldIds(w);
  const weldId = welded.id;
  const n = welded.count;
  const acc = new Float32Array(n * PART_COUNT);
  const cnt = new Float32Array(n);
  const adj: Set<number>[] = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < w.tris.length; t += 3) {
    const a = weldId[w.tris[t]];
    const b = weldId[w.tris[t + 1]];
    const c = weldId[w.tris[t + 2]];
    adj[a].add(b).add(c);
    adj[b].add(a).add(c);
    adj[c].add(a).add(b);
  }
  let cur = new Float32Array(n * PART_COUNT);
  for (let i = 0; i < w.vc; i++) {
    const id = weldId[i];
    for (let k = 0; k < PART_COUNT; k++) acc[id * PART_COUNT + k] += partW[i * PART_COUNT + k];
    cnt[id]++;
  }
  for (let id = 0; id < n; id++) for (let k = 0; k < PART_COUNT; k++) cur[id * PART_COUNT + k] = acc[id * PART_COUNT + k] / cnt[id];
  // Only the head stays rigid (it turns on its own and has a clear neck line).
  for (let round = 0; round < 3; round++) {
    const next = cur.slice();
    for (let id = 0; id < n; id++) {
      const nb = adj[id];
      if (nb.size === 0) continue;
      let border = false;
      const own = argmax(cur, id);
      for (const o of nb) if (argmax(cur, o) !== own) border = true;
      if (!border && round === 0) continue;
      if (own === PART_HEAD) continue;
      for (let k = 0; k < PART_COUNT; k++) {
        if (k === PART_HEAD) continue;
        let s = cur[id * PART_COUNT + k];
        for (const o of nb) s += argmax(cur, o) === PART_HEAD ? 0 : cur[o * PART_COUNT + k];
        next[id * PART_COUNT + k] = s / (nb.size + 1);
      }
      let sum = 0;
      for (let k = 0; k < PART_COUNT; k++) sum += next[id * PART_COUNT + k];
      if (sum > 0) for (let k = 0; k < PART_COUNT; k++) next[id * PART_COUNT + k] /= sum;
    }
    cur = next;
  }
  void compOf;
  for (let i = 0; i < w.vc; i++) {
    const id = weldId[i];
    for (let k = 0; k < PART_COUNT; k++) partW[i * PART_COUNT + k] = cur[id * PART_COUNT + k];
  }
}

function argmax(a: Float32Array, id: number): number {
  let best = 0;
  for (let k = 1; k < PART_COUNT; k++) if (a[id * PART_COUNT + k] > a[id * PART_COUNT + best]) best = k;
  return best;
}

function fillMissingNormals(w: Work): void {
  const acc = new Float32Array(w.vc * 3);
  let missing = false;
  for (let i = 0; i < w.vc; i++) if (Math.hypot(w.nrm[i * 3], w.nrm[i * 3 + 1], w.nrm[i * 3 + 2]) < 0.5) missing = true;
  if (!missing) return;
  for (let t = 0; t < w.tris.length; t += 3) {
    const a = w.tris[t];
    const b = w.tris[t + 1];
    const c = w.tris[t + 2];
    const pa: V3 = [w.pos[a * 3], w.pos[a * 3 + 1], w.pos[a * 3 + 2]];
    const n = cross(sub([w.pos[b * 3], w.pos[b * 3 + 1], w.pos[b * 3 + 2]], pa), sub([w.pos[c * 3], w.pos[c * 3 + 1], w.pos[c * 3 + 2]], pa));
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) acc[v * 3 + k] += n[k];
  }
  for (let i = 0; i < w.vc; i++) {
    if (Math.hypot(w.nrm[i * 3], w.nrm[i * 3 + 1], w.nrm[i * 3 + 2]) >= 0.5) continue;
    const n = norm([acc[i * 3], acc[i * 3 + 1], acc[i * 3 + 2]]);
    w.nrm[i * 3] = n[0];
    w.nrm[i * 3 + 1] = n[1];
    w.nrm[i * 3 + 2] = n[2];
  }
}

// ------------------------------------------------------------------ materials

function isWebp(b: Uint8Array): boolean {
  return b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
}

/** Finds image files for a texture name: the same file, the same stem with any image type. */
function findImage(files: ModelFiles | null, name: string): string | null {
  if (!files || !name) return null;
  const direct = files.findPath(name);
  const stem = stemOf(name);
  const images = files.images();
  const rank = (p: string) => (/\.(png|jpe?g|webp)$/i.test(p) ? 0 : /\.(tga|bmp|gif)$/i.test(p) ? 1 : 2);
  const sameStem = images.filter((i) => i.stem === stem).sort((a, b) => rank(a.path) - rank(b.path));
  if (sameStem.length && (!direct || rank(sameStem[0].path) < rank(direct))) return sameStem[0].path;
  if (direct && IMAGE_EXT.test(direct)) return direct;
  return null;
}

/** For materials without a texture: a diffuse image named like the material or its mesh. */
function guessImage(files: ModelFiles | null, names: string[]): string | null {
  if (!files) return null;
  const rank = (p: string) => (/\.(png|jpe?g|webp)$/i.test(p) ? 0 : /\.(tga|bmp|gif)$/i.test(p) ? 1 : 2);
  const images = files
    .images()
    .filter((i) => !/(_n|_nrm|_normal|_norm|_spec|_s|_bump|_rough|_metal|_ao|_orm|_emissive|_height|_disp|_gloss)(\b|_|$)/.test(i.stem))
    .sort((a, b) => rank(a.path) - rank(b.path));
  for (const raw of names) {
    const n = raw.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!n) continue;
    const exact = images.find((i) => i.stem === n);
    if (exact) return exact.path;
    const first = n.split('_')[0];
    if (first.length >= 3) {
      const diff = images.find((i) => i.stem.startsWith(`${first}_diff`) || i.stem.startsWith(`${first}_d_`) || i.stem === `${first}_d`);
      if (diff) return diff.path;
      const pre = images.find((i) => i.stem.startsWith(first + '_') || i.stem === first);
      if (pre) return pre.path;
    }
  }
  return null;
}

async function packMaterials(
  scene: SourceScene,
  w: Work,
  files: ModelFiles | null,
  codec: ImageCodec,
  opts: BuildOptions,
  report: BuildReport,
): Promise<{ materials: ModelMaterial[]; textures: ModelTexture[]; textureNames: string[] }> {
  const max = opts.maxTextureSize ?? 1024;
  // Meshes using each material (name hints for missing textures).
  const meshesOf = new Map<number, Set<string>>();
  for (let t = 0; t < w.triMat.length; t++) {
    const m = w.triMat[t];
    const name = w.meshNames[w.mesh[w.tris[t * 3]]] ?? '';
    if (!meshesOf.has(m)) meshesOf.set(m, new Set());
    meshesOf.get(m)!.add(name);
  }
  const overrides = Object.entries(opts.textureOverrides ?? {});
  const textures: ModelTexture[] = [];
  const textureNames: string[] = [];
  const byKey = new Map<string, number>();
  const alphaOf = new Map<number, { alpha: boolean; cutout: boolean }>();
  const loadTexture = async (key: string, bytes: Uint8Array | null, name: string): Promise<number> => {
    const known = byKey.get(key);
    if (known !== undefined) return known;
    byKey.set(key, -1);
    if (!bytes) return -1;
    let img = decodeKnown(bytes, name);
    if (!img) img = await codec.decode(bytes, name);
    if (!img) {
      report.warnings.push(`Could not read the texture ${name}.`);
      return -1;
    }
    img = shrinkTo(img, max);
    const alpha = hasAlpha(img);
    const cutout = alpha && transparentShare(img) > 0.002;
    const tex = await codec.encode(cutout ? img : dropAlpha(img), !cutout);
    const idx = textures.push(tex) - 1;
    textureNames.push(`${name} ${img.width}x${img.height}`);
    alphaOf.set(idx, { alpha, cutout });
    byKey.set(key, idx);
    return idx;
  };
  const materials: ModelMaterial[] = [];
  for (let mi = 0; mi < scene.materials.length; mi++) {
    const m = scene.materials[mi];
    const names = [m.name, ...(meshesOf.get(mi) ?? [])];
    let path: string | null = null;
    for (const [prefix, file] of overrides) {
      if (names.some((n) => n.toLowerCase().startsWith(prefix))) {
        path = files?.findPath(file) ?? null;
        if (path) break;
      }
    }
    let tex = -1;
    if (path) tex = await loadTexture(path, files!.get(path), path);
    if (tex < 0 && m.texture >= 0) {
      const st = scene.textures[m.texture];
      // The picture the model refers to; but a DDS/TGA (embedded in FBX files, or named by an
      // OBJ) gives way to a PNG or JPEG of the same name next to the model.
      const native = st.bytes && (isPng(st.bytes) || isJpeg(st.bytes) || isWebp(st.bytes));
      if (native) tex = await loadTexture(`embedded:${m.texture}`, st.bytes, st.name);
      if (tex < 0) {
        const file = findImage(files, st.name);
        if (file) tex = await loadTexture(file, files!.get(file), file);
      }
      if (tex < 0 && st.bytes && !native) tex = await loadTexture(`embedded:${m.texture}`, st.bytes, st.name);
    }
    if (tex < 0) {
      const guess = guessImage(files, names);
      if (guess) tex = await loadTexture(guess, files!.get(guess), guess);
    }
    if (tex < 0 && m.texture >= 0) report.warnings.push(`The texture of material ${m.name} (${scene.textures[m.texture].name}) is missing.`);
    const a = tex >= 0 ? alphaOf.get(tex) : undefined;
    let alpha = m.alpha === 'blend' ? ALPHA_BLEND : m.alpha === 'mask' ? ALPHA_MASK : ALPHA_OPAQUE;
    // Formats without alpha modes (FBX, OBJ): a texture with transparent pixels is a cut-out.
    if (alpha === ALPHA_OPAQUE && a?.cutout && !scene.explicitAlpha) alpha = ALPHA_MASK;
    const col = m.color.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255)) as [number, number, number, number];
    if (alpha !== ALPHA_BLEND) col[3] = 255;
    materials.push({ color: col, texture: tex, alpha });
  }
  if (materials.length === 0) materials.push({ color: [200, 200, 200, 255], texture: -1, alpha: ALPHA_OPAQUE });
  // Triangles whose material index is missing use the first material.
  for (let t = 0; t < w.triMat.length; t++) if (w.triMat[t] < 0 || w.triMat[t] >= materials.length) w.triMat[t] = 0;
  return { materials, textures, textureNames };
}
