import { ALPHA_BLEND, ALPHA_MASK, PART_COUNT, PART_LEFT_ARM, PART_LEFT_LEG, PART_RIGHT_ARM, PART_RIGHT_LEG, type ModelTexture, type PlayerModelData } from './PlayerModelFormat';

/**
 * Writes a player model as binary glTF 2.0 (.glb) for Blender and other glTF tools: the
 * normalised mesh (model space is already glTF's: metres = blocks, +Y up, facing +Z, the right
 * hand on -X), one primitive per material group, the materials with their embedded PNG / JPEG
 * textures, and a skin of six joints named after ModelBiped's parts, placed at the rig's pivots
 * (Body is the root; Head, the arms and the legs hang from it; unweighted RightHand / LeftHand /
 * RightFoot / LeftFoot ends at the palms and soles), with the model's own part bindings (up to
 * four joints per vertex) as JOINTS_0 / WEIGHTS_0. The rest of the rig (palms,
 * head box) goes into the scene's extras. Importing the file again (Import Model...) rigs it
 * from this skeleton.
 *
 * WebP textures are not core glTF: they are written with EXT_texture_webp (listed as required)
 * unless the caller converts them first (`withStandardTextures`, which the game does with the
 * browser's own image codecs).
 */

/** Joint node names, in part order (the importer's bone-name rules read them back). */
export const GLB_JOINT_NAMES = ['Head', 'Body', 'RightArm', 'LeftArm', 'RightLeg', 'LeftLeg'];

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
const FLOAT = 5126;
const UNSIGNED_BYTE = 5121;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
/** ModelBiped's body part is the root of the exported skeleton. */
const ROOT_PART = 1;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

const align4 = (n: number) => (n + 3) & ~3;

/** Builds the .glb bytes. `generator` names the program in asset.generator. */
export function exportGlb(m: PlayerModelData, generator = 'Minecraft 1.5.2 HTML player model export'): Uint8Array {
  const chunks: Uint8Array[] = [];
  const bufferViews: Json[] = [];
  let binLength = 0;
  /** Appends bytes (4-byte aligned) as a new buffer view and returns its index. */
  const addView = (bytes: Uint8Array, target?: number, byteStride?: number): number => {
    const offset = binLength;
    chunks.push(bytes);
    const pad = align4(bytes.length) - bytes.length;
    if (pad) chunks.push(new Uint8Array(pad));
    binLength += bytes.length + pad;
    const view: Json = { buffer: 0, byteOffset: offset, byteLength: bytes.length };
    if (target) view.target = target;
    // Required when several accessors (one per primitive) share a vertex buffer view.
    if (byteStride) view.byteStride = byteStride;
    return bufferViews.push(view) - 1;
  };
  const accessors: Json[] = [];
  const addAccessor = (a: Json): number => accessors.push(a) - 1;
  const asBytes = (a: ArrayBufferView) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

  // Each primitive (material group) gets its own vertices, in first-use order: every glTF reader
  // handles that, and none has to sort out vertices other groups use.
  const prims = m.groups
    .filter((g) => g.count > 0)
    .map((g) => {
      const local = new Map<number, number>();
      const verts: number[] = [];
      const tri = new Uint32Array(g.count);
      for (let i = 0; i < g.count; i++) {
        const v = m.indices[g.start + i];
        let l = local.get(v);
        if (l === undefined) {
          l = verts.push(v) - 1;
          local.set(v, l);
        }
        tri[i] = l;
      }
      return { material: g.material, verts, tri };
    });
  const total = prims.reduce((s, p) => s + p.verts.length, 0);
  const wide = prims.some((p) => p.verts.length > 65535);
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const uvs = new Float32Array(total * 2);
  const joints = new Uint8Array(total * 4);
  const weights = new Uint8Array(total * 4);
  const indexData = wide ? new Uint32Array(prims.reduce((s, p) => s + p.tri.length, 0)) : new Uint16Array(prims.reduce((s, p) => s + p.tri.length, 0));
  let o = 0;
  let io = 0;
  const ranges = prims.map((p) => {
    const first = o;
    const firstIndex = io;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const v of p.verts) {
      for (let k = 0; k < 3; k++) {
        const x = m.positions[v * 3 + k];
        positions[o * 3 + k] = x;
        if (positions[o * 3 + k] < min[k]) min[k] = positions[o * 3 + k];
        if (positions[o * 3 + k] > max[k]) max[k] = positions[o * 3 + k];
      }
      const nx = m.normals[v * 3];
      const ny = m.normals[v * 3 + 1];
      const nz = m.normals[v * 3 + 2];
      const len = Math.hypot(nx, ny, nz);
      if (len > 0) {
        normals[o * 3] = nx / len;
        normals[o * 3 + 1] = ny / len;
        normals[o * 3 + 2] = nz / len;
      } else normals[o * 3 + 1] = 1;
      uvs[o * 2] = m.uvs[v * 2];
      uvs[o * 2 + 1] = m.uvs[v * 2 + 1];
      // Weights sum to 255 per vertex (normalised: 1); unused slots point at joint 0 with weight 0.
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        const w = m.weights[v * 4 + k];
        joints[o * 4 + k] = w > 0 ? m.joints[v * 4 + k] : 0;
        weights[o * 4 + k] = w;
        sum += w;
      }
      if (sum === 0) {
        // A vertex without weights (not written by this game's encoder) goes to the body.
        joints[o * 4] = ROOT_PART;
        weights[o * 4] = 255;
      } else if (sum !== 255) {
        // Keep the sum exact so glTF validators accept the weights.
        let best = 0;
        for (let k = 1; k < 4; k++) if (weights[o * 4 + k] > weights[o * 4 + best]) best = k;
        weights[o * 4 + best] = Math.max(0, Math.min(255, weights[o * 4 + best] + 255 - sum));
      }
      o++;
    }
    indexData.set(p.tri, io);
    io += p.tri.length;
    return { first, count: p.verts.length, firstIndex, indexCount: p.tri.length, min, max };
  });
  const views = {
    POSITION: addView(asBytes(positions), ARRAY_BUFFER, 12),
    NORMAL: addView(asBytes(normals), ARRAY_BUFFER, 12),
    TEXCOORD_0: addView(asBytes(uvs), ARRAY_BUFFER, 8),
    JOINTS_0: addView(joints, ARRAY_BUFFER, 4),
    WEIGHTS_0: addView(weights, ARRAY_BUFFER, 4),
    indices: addView(asBytes(indexData), ELEMENT_ARRAY_BUFFER),
  };
  const bytesPer = wide ? 4 : 2;
  const primitives = prims.map((p, i) => {
    const r = ranges[i];
    const at = (view: number, size: number, componentType: number, type: string, extra: Json = {}) =>
      addAccessor({ bufferView: view, byteOffset: r.first * size, componentType, count: r.count, type, ...extra });
    return {
      attributes: {
        POSITION: at(views.POSITION, 12, FLOAT, 'VEC3', { min: r.min, max: r.max }),
        NORMAL: at(views.NORMAL, 12, FLOAT, 'VEC3'),
        TEXCOORD_0: at(views.TEXCOORD_0, 8, FLOAT, 'VEC2'),
        JOINTS_0: at(views.JOINTS_0, 4, UNSIGNED_BYTE, 'VEC4'),
        WEIGHTS_0: at(views.WEIGHTS_0, 4, UNSIGNED_BYTE, 'VEC4', { normalized: true }),
      },
      indices: addAccessor({ bufferView: views.indices, byteOffset: r.firstIndex * bytesPer, componentType: wide ? UNSIGNED_INT : UNSIGNED_SHORT, count: r.indexCount, type: 'SCALAR' }),
      material: p.material,
      mode: 4,
    };
  });

  // Textures and materials.
  const extensionsUsed = new Set<string>();
  const images: Json[] = [];
  const textures: Json[] = [];
  m.textures.forEach((t, i) => {
    images.push({ name: `texture${i}`, mimeType: t.mime, bufferView: addView(t.bytes) });
    if (t.mime === 'image/webp') {
      extensionsUsed.add('EXT_texture_webp');
      textures.push({ sampler: 0, extensions: { EXT_texture_webp: { source: i } } });
    } else textures.push({ sampler: 0, source: i });
  });
  const materials = m.materials.map((mat, i) => {
    const out: Json = {
      name: `material${i}`,
      pbrMetallicRoughness: {
        baseColorFactor: mat.color.map((c) => Math.round((c / 255) * 1e4) / 1e4),
        metallicFactor: 0,
        roughnessFactor: 1,
      },
      // Minecraft draws entities without back-face culling.
      doubleSided: true,
    };
    if (mat.texture >= 0) out.pbrMetallicRoughness.baseColorTexture = { index: mat.texture };
    if (mat.alpha === ALPHA_MASK) {
      out.alphaMode = 'MASK';
      out.alphaCutoff = 0.1;
    } else if (mat.alpha === ALPHA_BLEND) out.alphaMode = 'BLEND';
    return out;
  });

  // Skeleton. Six part joints (JOINTS_0 values are part indices), Body the root at its pivot, the
  // others relative to it; then four unweighted end joints (hands at the palms, feet at the
  // soles) so editors draw the limb bones with their length and importers find the palms.
  // Bind pose = rest pose, no rotations.
  const pivots = m.rig.pivots;
  const soles = [PART_RIGHT_LEG, PART_LEFT_LEG].map((part) => soleOf(m, part));
  const ends: { name: string; parent: number; at: readonly number[] }[] = [
    { name: 'RightHand', parent: PART_RIGHT_ARM, at: m.rig.hands[0] },
    { name: 'LeftHand', parent: PART_LEFT_ARM, at: m.rig.hands[1] },
    { name: 'RightFoot', parent: PART_RIGHT_LEG, at: soles[0] },
    { name: 'LeftFoot', parent: PART_LEFT_LEG, at: soles[1] },
  ];
  const meshNode = 0;
  const rootNode = 1;
  const jointNode = (j: number) => 2 + j;
  const jointCount = PART_COUNT + ends.length;
  const worldPos: number[][] = [];
  const nodes: Json[] = [];
  const rnd = (v: number) => Math.round(v * 1e6) / 1e6;
  nodes[meshNode] = { name: `${m.name || 'Model'} mesh`, mesh: 0, skin: 0 };
  // The skinned mesh is a scene root (its own transform is ignored); the joints hang from an
  // armature node named after the model.
  nodes[rootNode] = { name: m.name || 'Model', children: [jointNode(ROOT_PART)] };
  const place = (j: number, name: string, at: readonly number[], parent: number | null) => {
    const base = parent === null ? [0, 0, 0] : worldPos[parent];
    const t = [0, 1, 2].map((a) => rnd(at[a] - base[a]));
    worldPos[j] = t.map((v, a) => v + base[a]);
    nodes[jointNode(j)] = { name, translation: t };
    if (parent !== null) (nodes[jointNode(parent)].children ??= []).push(jointNode(j));
  };
  place(ROOT_PART, GLB_JOINT_NAMES[ROOT_PART], pivots[ROOT_PART], null);
  for (let k = 0; k < PART_COUNT; k++) if (k !== ROOT_PART) place(k, GLB_JOINT_NAMES[k], pivots[k], ROOT_PART);
  ends.forEach((e, i) => place(PART_COUNT + i, e.name, e.at, e.parent));
  // Inverse bind matrices: a translation by minus each joint's world position.
  const ibm = new Float32Array(jointCount * 16);
  for (let j = 0; j < jointCount; j++) {
    const b = j * 16;
    ibm[b] = ibm[b + 5] = ibm[b + 10] = ibm[b + 15] = 1;
    ibm[b + 12] = -worldPos[j][0];
    ibm[b + 13] = -worldPos[j][1];
    ibm[b + 14] = -worldPos[j][2];
  }
  const ibmAccessor = addAccessor({ bufferView: addView(asBytes(ibm)), componentType: FLOAT, count: jointCount, type: 'MAT4' });
  const r3 = (v: readonly number[]) => v.map((x) => Math.round(x * 1e5) / 1e5);

  const json: Json = {
    asset: { version: '2.0', generator, ...(m.credits ? { copyright: m.credits } : {}), extras: { title: m.name } },
    scene: 0,
    scenes: [
      {
        name: m.name || 'Model',
        nodes: [rootNode, meshNode],
        extras: {
          // What a .mcpm keeps besides the mesh: ModelBiped's part pivots, the palms (held items)
          // and the head box (head items), in this file's coordinates.
          playerModelRig: {
            parts: GLB_JOINT_NAMES,
            pivots: pivots.map(r3),
            hands: m.rig.hands.map(r3),
            headCenter: r3(m.rig.headCenter),
            headSize: Math.round(m.rig.headSize * 1e5) / 1e5,
            source: m.rig.source,
          },
        },
      },
    ],
    nodes,
    meshes: [{ name: m.name || 'Model', primitives }],
    skins: [{ name: 'ModelBiped', joints: Array.from({ length: jointCount }, (_, j) => jointNode(j)), skeleton: jointNode(ROOT_PART), inverseBindMatrices: ibmAccessor }],
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binLength }],
  };
  if (textures.length) {
    json.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
    json.images = images;
    json.textures = textures;
  }
  if (extensionsUsed.size) {
    json.extensionsUsed = [...extensionsUsed];
    json.extensionsRequired = [...extensionsUsed];
  }

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = align4(jsonBytes.length);
  const size = 12 + 8 + jsonLen + 8 + binLength;
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, GLB_MAGIC, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, size, true);
  dv.setUint32(12, jsonLen, true);
  dv.setUint32(16, CHUNK_JSON, true);
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.length, 20 + jsonLen);
  let at = 20 + jsonLen;
  dv.setUint32(at, binLength, true);
  dv.setUint32(at + 4, CHUNK_BIN, true);
  at += 8;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Below a leg's pivot at the height of its lowest vertex (the sole), for the foot joint. */
function soleOf(m: PlayerModelData, part: number): [number, number, number] {
  const p = m.rig.pivots[part];
  let minY = Infinity;
  for (let i = 0; i < m.positions.length / 3; i++) {
    // The vertex's strongest part.
    let best = 0;
    for (let k = 1; k < 4; k++) if (m.weights[i * 4 + k] > m.weights[i * 4 + best]) best = k;
    if (m.joints[i * 4 + best] === part && m.positions[i * 3 + 1] < minY) minY = m.positions[i * 3 + 1];
  }
  return [p[0], Number.isFinite(minY) ? Math.min(minY, p[1]) : 0, p[2]];
}

/**
 * The model with WebP textures re-encoded by `toPng` (PNG / JPEG ones are kept as they are), so
 * the exported files only hold images every glTF viewer and Java's ImageIO read. A texture the
 * converter cannot read is kept as it is.
 */
export async function withStandardTextures(m: PlayerModelData, toPng: (t: ModelTexture) => Promise<Uint8Array | null>): Promise<PlayerModelData> {
  if (!m.textures.some((t) => t.mime === 'image/webp')) return m;
  const textures = await Promise.all(
    m.textures.map(async (t) => {
      if (t.mime !== 'image/webp') return t;
      const png = await toPng(t).catch(() => null);
      return png ? { mime: 'image/png', bytes: png } : t;
    }),
  );
  return { ...m, textures };
}

/** A file name for the model: letters, digits, '-' and '_' only. */
export function exportFileName(name: string, ext: string): string {
  const base = name.trim().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'player_model';
  return `${base.slice(0, 48)}.${ext}`;
}
