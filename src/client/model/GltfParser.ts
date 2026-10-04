import type { ModelFiles } from './ModelFiles';
import {
  baseName,
  IMPORT_LIMITS,
  type M4,
  m4FromQuat,
  m4Identity,
  m4Mirrors,
  m4Mul,
  m4Scale,
  m4Translate,
  ModelImportError,
  type SourceMaterial,
  type SourceMesh,
  type SourceScene,
} from './SourceScene';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

export function isGlb(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true) === GLB_MAGIC;
}

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const COMPONENT_BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

function decodeDataUri(uri: string): Uint8Array | null {
  const m = /^data:[^;,]*(;base64)?,(.*)$/s.exec(uri);
  if (!m) return null;
  if (!m[1]) return new TextEncoder().encode(decodeURIComponent(m[2]));
  const bin = atob(m[2]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Reads glTF 2.0 (.gltf with its .bin and images, or .glb) into a SourceScene. Meshes are placed
 * by their node transforms; skinned meshes are posed by their joints (the scene's rest pose),
 * so they line up with unskinned parts. Draco and meshopt compression are refused.
 */
export function parseGltf(bytes: Uint8Array, files: ModelFiles, path: string): SourceScene {
  let json: Json;
  let glbBin: Uint8Array | null = null;
  if (isGlb(bytes)) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const length = Math.min(view.getUint32(8, true), bytes.length);
    let off = 12;
    while (off + 8 <= length) {
      const len = view.getUint32(off, true);
      const type = view.getUint32(off + 4, true);
      const start = off + 8;
      if (start + len > length) throw new ModelImportError('The .glb file is truncated.');
      const chunk = bytes.subarray(start, start + len);
      if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(chunk));
      else if (type === CHUNK_BIN && !glbBin) glbBin = chunk;
      off = start + ((len + 3) & ~3);
    }
    if (!json) throw new ModelImportError('The .glb file has no scene description.');
  } else {
    try {
      json = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new ModelImportError('The .gltf file is not valid JSON.');
    }
  }
  if (typeof json !== 'object' || json === null) throw new ModelImportError('The glTF file is damaged.');
  if (!String(json.asset?.version ?? '2').startsWith('2')) throw new ModelImportError('Only glTF 2.0 files are supported.');
  for (const ext of (json.extensionsRequired ?? []) as string[]) {
    if (ext === 'KHR_draco_mesh_compression' || ext === 'EXT_meshopt_compression' || ext === 'KHR_mesh_quantization') {
      throw new ModelImportError(`This glTF uses ${ext}; export it again without mesh compression.`);
    }
  }
  const arr = (v: unknown): Json[] => (Array.isArray(v) ? v : []);
  const buffersJson = arr(json.buffers);
  const bufferViews = arr(json.bufferViews);
  const accessors = arr(json.accessors);
  const nodes = arr(json.nodes);
  const meshes = arr(json.meshes);
  const skins = arr(json.skins);
  if (nodes.length > IMPORT_LIMITS.maxNodes) throw new ModelImportError('The glTF has too many nodes.');

  const buffers: (Uint8Array | null)[] = buffersJson.map((b, i) => {
    if (b.uri === undefined) return i === 0 ? glbBin : null;
    if (typeof b.uri !== 'string') return null;
    if (b.uri.startsWith('data:')) return decodeDataUri(b.uri);
    return files.get(b.uri, path);
  });
  const viewBytes = (vi: number): Uint8Array => {
    const v = bufferViews[vi];
    const buf = v ? buffers[v.buffer] : null;
    if (!v || !buf) throw new ModelImportError('The glTF refers to a missing .bin file (put the .gltf, .bin and textures in one .zip).');
    const off = v.byteOffset ?? 0;
    if (off < 0 || off + v.byteLength > buf.length) throw new ModelImportError('The glTF has a buffer view outside its buffer.');
    return buf.subarray(off, off + v.byteLength);
  };

  const accessorCache = new Map<number, Float32Array>();
  /** Reads an accessor into floats (normalised integers are scaled to 0-1 / -1-1). */
  const read = (ai: number): Float32Array => {
    const cached = accessorCache.get(ai);
    if (cached) return cached;
    const a = accessors[ai];
    if (!a) throw new ModelImportError('The glTF refers to a missing accessor.');
    const comps = COMPONENTS[a.type];
    const cbytes = COMPONENT_BYTES[a.componentType];
    const count = a.count | 0;
    if (!comps || !cbytes || count < 0 || count > IMPORT_LIMITS.maxVertices * 3) throw new ModelImportError('The glTF has an invalid accessor.');
    const out = new Float32Array(count * comps);
    if (a.bufferView !== undefined) {
      const bytesOf = viewBytes(a.bufferView);
      const stride = bufferViews[a.bufferView].byteStride || comps * cbytes;
      const base = a.byteOffset ?? 0;
      const view = new DataView(bytesOf.buffer, bytesOf.byteOffset, bytesOf.byteLength);
      if (count > 0 && base + (count - 1) * stride + comps * cbytes > bytesOf.length) throw new ModelImportError('The glTF has an accessor outside its buffer.');
      const norm = !!a.normalized;
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < comps; c++) {
          const o = base + i * stride + c * cbytes;
          let v: number;
          switch (a.componentType) {
            case 5126:
              v = view.getFloat32(o, true);
              break;
            case 5125:
              v = view.getUint32(o, true);
              break;
            case 5123:
              v = view.getUint16(o, true);
              if (norm) v /= 65535;
              break;
            case 5122:
              v = view.getInt16(o, true);
              if (norm) v = Math.max(v / 32767, -1);
              break;
            case 5121:
              v = view.getUint8(o);
              if (norm) v /= 255;
              break;
            default:
              v = view.getInt8(o);
              if (norm) v = Math.max(v / 127, -1);
          }
          out[i * comps + c] = v;
        }
      }
    }
    if (a.sparse) {
      const s = a.sparse;
      const n = s.count | 0;
      const idxBytes = viewBytes(s.indices.bufferView);
      const idxView = new DataView(idxBytes.buffer, idxBytes.byteOffset, idxBytes.byteLength);
      const valBytes = viewBytes(s.values.bufferView);
      const valView = new DataView(valBytes.buffer, valBytes.byteOffset, valBytes.byteLength);
      const it = s.indices.componentType;
      const ib = COMPONENT_BYTES[it] ?? 4;
      for (let i = 0; i < n; i++) {
        const io = (s.indices.byteOffset ?? 0) + i * ib;
        if (io + ib > idxBytes.length) break;
        const target = it === 5121 ? idxView.getUint8(io) : it === 5123 ? idxView.getUint16(io, true) : idxView.getUint32(io, true);
        if (target >= count) continue;
        for (let c = 0; c < comps; c++) {
          const vo = (s.values.byteOffset ?? 0) + (i * comps + c) * cbytes;
          if (vo + cbytes > valBytes.length) break;
          out[target * comps + c] = a.componentType === 5126 ? valView.getFloat32(vo, true) : valView.getUint16(vo, true);
        }
      }
    }
    accessorCache.set(ai, out);
    return out;
  };

  // Node world matrices.
  const parentOf = new Int32Array(nodes.length).fill(-1);
  nodes.forEach((n, i) => {
    for (const c of arr(n.children)) if (c >= 0 && c < nodes.length && c !== i) parentOf[c] = i;
  });
  const localOf = (n: Json): M4 => {
    if (Array.isArray(n.matrix) && n.matrix.length === 16) return Float64Array.from(n.matrix.map(Number));
    let m = m4Identity();
    const t = n.translation;
    const r = n.rotation;
    const s = n.scale;
    if (Array.isArray(t)) m = m4Translate(+t[0] || 0, +t[1] || 0, +t[2] || 0);
    if (Array.isArray(r)) m = m4Mul(m, m4FromQuat(+r[0] || 0, +r[1] || 0, +r[2] || 0, r[3] === undefined ? 1 : +r[3]));
    if (Array.isArray(s)) m = m4Mul(m, m4Scale(s[0] ?? 1, s[1] ?? 1, s[2] ?? 1));
    return m;
  };
  const worlds: (M4 | null)[] = new Array(nodes.length).fill(null);
  const worldOf = (i: number, depth = 0): M4 => {
    const cached = worlds[i];
    if (cached) return cached;
    if (depth > 512) throw new ModelImportError('The glTF node tree loops.');
    const local = localOf(nodes[i]);
    const w = parentOf[i] >= 0 ? m4Mul(worldOf(parentOf[i], depth + 1), local) : local;
    worlds[i] = w;
    return w;
  };

  const scene: SourceScene = { meshes: [], materials: [], textures: [], bones: [], upAxis: 'y', frontHint: [0, 0, 1], info: [], explicitAlpha: true };
  const extras = json.asset?.extras;
  if (extras && typeof extras === 'object') {
    for (const k of ['title', 'author', 'license', 'source']) if (typeof extras[k] === 'string') scene.info.push(`${k}: ${extras[k]}`);
  }
  if (typeof json.asset?.copyright === 'string') scene.info.push(json.asset.copyright);

  // Textures (by glTF texture index -> SourceTexture index).
  const images = arr(json.images);
  const textureMap = new Map<number, number>();
  const textureIndex = (ti: number | undefined): number => {
    if (ti === undefined || ti === null) return -1;
    const known = textureMap.get(ti);
    if (known !== undefined) return known;
    const t = arr(json.textures)[ti];
    if (!t) return -1;
    const src = t.source ?? t.extensions?.EXT_texture_webp?.source ?? t.extensions?.KHR_texture_basisu?.source;
    const img = images[src];
    let name = `texture${ti}`;
    let data: Uint8Array | null = null;
    if (img) {
      if (typeof img.uri === 'string') {
        if (img.uri.startsWith('data:')) data = decodeDataUri(img.uri);
        else {
          name = baseName(img.uri);
          data = files.get(img.uri, path);
        }
      } else if (img.bufferView !== undefined) {
        data = viewBytes(img.bufferView);
        if (typeof img.name === 'string') name = img.name;
      }
    }
    const idx = scene.textures.push({ name, bytes: data }) - 1;
    textureMap.set(ti, idx);
    return idx;
  };
  const materialMap = new Map<number, number>();
  const materialIndex = (mi: number | undefined): number => {
    const key = mi ?? -1;
    const known = materialMap.get(key);
    if (known !== undefined) return known;
    const m = mi === undefined ? null : arr(json.materials)[mi];
    const pbr = m?.pbrMetallicRoughness;
    const sg = m?.extensions?.KHR_materials_pbrSpecularGlossiness;
    const factor = (pbr?.baseColorFactor ?? sg?.diffuseFactor ?? [1, 1, 1, 1]) as number[];
    const tex = textureIndex(pbr?.baseColorTexture?.index ?? sg?.diffuseTexture?.index);
    const mat: SourceMaterial = {
      name: typeof m?.name === 'string' ? m.name : `material${key}`,
      color: [+factor[0] || 0, +factor[1] || 0, +factor[2] || 0, factor[3] === undefined ? 1 : +factor[3]],
      texture: tex,
      alpha: m?.alphaMode === 'MASK' ? 'mask' : m?.alphaMode === 'BLEND' ? 'blend' : 'opaque',
    };
    const idx = scene.materials.push(mat) - 1;
    materialMap.set(key, idx);
    return idx;
  };

  // Bones: every joint of every skin.
  const boneOfNode = new Map<number, number>();
  const addBone = (ni: number): number => {
    const known = boneOfNode.get(ni);
    if (known !== undefined) return known;
    const parent = parentOf[ni] >= 0 && isJoint(parentOf[ni]) ? addBone(parentOf[ni]) : -1;
    const w = worldOf(ni);
    const idx = scene.bones.push({ name: String(nodes[ni].name ?? `joint${ni}`), parent, position: [w[12], w[13], w[14]] }) - 1;
    boneOfNode.set(ni, idx);
    return idx;
  };
  const jointSet = new Set<number>();
  for (const s of skins) for (const j of arr(s.joints)) jointSet.add(j);
  const isJoint = (ni: number) => jointSet.has(ni);

  // Nodes reachable from the scene.
  const sceneRoots: number[] = arr(arr(json.scenes)[json.scene ?? 0]?.nodes);
  const visit: number[] = sceneRoots.length ? [...sceneRoots] : nodes.map((_, i) => i).filter((i) => parentOf[i] < 0);
  const seen = new Set<number>();
  let totalVerts = 0;
  while (visit.length) {
    const ni = visit.pop()!;
    if (seen.has(ni) || ni < 0 || ni >= nodes.length) continue;
    seen.add(ni);
    const node = nodes[ni];
    for (const c of arr(node.children)) visit.push(c);
    if (node.mesh === undefined) continue;
    const mesh = meshes[node.mesh];
    if (!mesh) continue;
    const skin = node.skin !== undefined ? skins[node.skin] : null;
    let jointMats: M4[] | null = null;
    let jointBones: number[] = [];
    if (skin) {
      const joints = arr(skin.joints) as number[];
      const ibm = skin.inverseBindMatrices !== undefined ? read(skin.inverseBindMatrices) : null;
      jointMats = joints.map((j, k) => {
        const inv = ibm ? Float64Array.from(ibm.subarray(k * 16, k * 16 + 16)) : m4Identity();
        return m4Mul(worldOf(j), inv);
      });
      jointBones = joints.map((j) => addBone(j));
    }
    const world = worldOf(ni);
    for (const prim of arr(mesh.primitives)) {
      if (prim.extensions?.KHR_draco_mesh_compression) throw new ModelImportError('This glTF uses Draco compression; export it again without it.');
      const mode = prim.mode ?? 4;
      if (mode !== 4 && mode !== 5 && mode !== 6) continue;
      const attrs = prim.attributes ?? {};
      if (attrs.POSITION === undefined) continue;
      const pos = read(attrs.POSITION);
      const vc = pos.length / 3;
      totalVerts += vc;
      if (totalVerts > IMPORT_LIMITS.maxVertices) throw new ModelImportError('The model has too many vertices.');
      const nrm = attrs.NORMAL !== undefined ? read(attrs.NORMAL) : null;
      const matJson = prim.material !== undefined ? arr(json.materials)[prim.material] : null;
      const texCoordSet = matJson?.pbrMetallicRoughness?.baseColorTexture?.texCoord ?? 0;
      const uvAcc = attrs[`TEXCOORD_${texCoordSet}`] ?? attrs.TEXCOORD_0;
      const uv = uvAcc !== undefined ? read(uvAcc) : null;
      let idx: Uint32Array;
      if (prim.indices !== undefined) {
        const raw = read(prim.indices);
        idx = new Uint32Array(raw.length);
        for (let i = 0; i < raw.length; i++) idx[i] = raw[i];
      } else {
        idx = new Uint32Array(vc);
        for (let i = 0; i < vc; i++) idx[i] = i;
      }
      for (let i = 0; i < idx.length; i++) if (idx[i] >= vc) throw new ModelImportError('The glTF has an index outside its vertices.');
      if (mode !== 4) {
        const tris: number[] = [];
        for (let i = 2; i < idx.length; i++) {
          if (mode === 5) {
            if (i % 2 === 0) tris.push(idx[i - 2], idx[i - 1], idx[i]);
            else tris.push(idx[i - 1], idx[i - 2], idx[i]);
          } else tris.push(idx[0], idx[i - 1], idx[i]);
        }
        idx = Uint32Array.from(tris);
      }
      // Positions and normals in world space: skinned by the joints' current pose, else by the node.
      const outPos = new Float32Array(vc * 3);
      const outNrm = nrm ? new Float32Array(vc * 3) : null;
      let joints: Uint16Array | null = null;
      let weights: Float32Array | null = null;
      let mirrored = m4Mirrors(world);
      if (skin && jointMats && attrs.JOINTS_0 !== undefined && attrs.WEIGHTS_0 !== undefined) {
        const j0 = read(attrs.JOINTS_0);
        const w0 = read(attrs.WEIGHTS_0);
        joints = new Uint16Array(vc * 4);
        weights = new Float32Array(vc * 4);
        mirrored = false;
        for (let v = 0; v < vc; v++) {
          const m = new Float64Array(16);
          let sum = 0;
          for (let k = 0; k < 4; k++) {
            const w = w0[v * 4 + k];
            const j = j0[v * 4 + k];
            if (!(w > 0) || j >= jointMats.length) continue;
            const jm = jointMats[j];
            for (let e = 0; e < 16; e++) m[e] += jm[e] * w;
            sum += w;
            joints[v * 4 + k] = jointBones[j];
            weights[v * 4 + k] = w;
          }
          const mm = sum > 0 ? m : world;
          if (sum > 0 && sum !== 1) for (let e = 0; e < 16; e++) m[e] /= sum;
          if (v === 0) mirrored = m4Mirrors(mm);
          writePoint(mm, pos, v, outPos);
          if (outNrm && nrm) writeNormal(mm, nrm, v, outNrm);
        }
      } else {
        for (let v = 0; v < vc; v++) {
          writePoint(world, pos, v, outPos);
          if (outNrm && nrm) writeNormal(world, nrm, v, outNrm);
        }
      }
      if (mirrored) {
        for (let i = 0; i < idx.length; i += 3) {
          const t = idx[i + 1];
          idx[i + 1] = idx[i + 2];
          idx[i + 2] = t;
        }
      }
      const sm: SourceMesh = {
        name: String(node.name ?? mesh.name ?? ''),
        positions: outPos,
        normals: outNrm,
        uvs: uv ? Float32Array.from(uv.subarray(0, vc * 2)) : null,
        indices: idx,
        groups: [{ start: 0, count: idx.length / 3, material: materialIndex(prim.material) }],
        joints,
        weights,
      };
      scene.meshes.push(sm);
    }
  }
  if (scene.meshes.length === 0) throw new ModelImportError('This glTF file has no triangle meshes.');
  // Joints that are not used by any vertex still name the skeleton (head, hands...).
  for (const j of jointSet) addBone(j);
  return scene;
}

function writePoint(m: M4, src: Float32Array, v: number, out: Float32Array): void {
  const x = src[v * 3];
  const y = src[v * 3 + 1];
  const z = src[v * 3 + 2];
  out[v * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
  out[v * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
  out[v * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
}

/** Normals by the matrix's linear part (fine for the rotations and uniform scales of rigs). */
function writeNormal(m: M4, src: Float32Array, v: number, out: Float32Array): void {
  const x = src[v * 3];
  const y = src[v * 3 + 1];
  const z = src[v * 3 + 2];
  let nx = m[0] * x + m[4] * y + m[8] * z;
  let ny = m[1] * x + m[5] * y + m[9] * z;
  let nz = m[2] * x + m[6] * y + m[10] * z;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l;
  ny /= l;
  nz /= l;
  out[v * 3] = nx;
  out[v * 3 + 1] = ny;
  out[v * 3 + 2] = nz;
}
