/**
 * The .glb export of player models (Account Manager "Export .glb"): the file's structure
 * (header, chunks, accessors inside their buffer views, indices and joints in range, weights
 * summing to one, inverse bind matrices matching the joints), a round trip through the
 * project's own glTF reader (same vertices, triangles, UVs, materials, texture bytes, the six
 * joints at the rig's pivots and the same part bindings), a full re-import (rigged from the
 * exported skeleton), wide indices and WebP textures.
 * Run: node scripts/run-node-test.mjs tests/glbexport.test.ts
 * With GLB_EXPORT_DIR=<dir> it also writes the built-in models as <id>.glb there.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { exportFileName, exportGlb, GLB_JOINT_NAMES, withStandardTextures } from '../src/client/model/GlbExport';
import { parseGltf } from '../src/client/model/GltfParser';
import { importModel } from '../src/client/model/ModelImportPipeline';
import { ModelFiles } from '../src/client/model/ModelFiles';
import { decodePlayerModel, PART_COUNT, type PlayerModelData } from '../src/client/model/PlayerModelFormat';
import { classifyName } from '../src/client/model/BoneNames';
import { check, report } from './harness';
import { nodeCodec } from './modelPreview';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

const index = JSON.parse(readFileSync(join(process.cwd(), 'public/models/index.json'), 'utf8')) as { models: { id: string; file: string }[] };
const outDir = process.env.GLB_EXPORT_DIR;

interface Glb {
  json: Json;
  bin: Uint8Array;
}

/** Splits a .glb and checks the container: magic, version, total length, chunk types and padding. */
function readGlb(name: string, bytes: Uint8Array): Glb | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  check(`${name}: magic`, v.getUint32(0, true) === 0x46546c67);
  check(`${name}: version 2`, v.getUint32(4, true) === 2);
  check(`${name}: length field`, v.getUint32(8, true) === bytes.length, `${v.getUint32(8, true)} vs ${bytes.length}`);
  const jsonLen = v.getUint32(12, true);
  check(`${name}: JSON chunk first`, v.getUint32(16, true) === 0x4e4f534a);
  check(`${name}: JSON chunk padded`, jsonLen % 4 === 0);
  let json: Json;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen)));
  } catch {
    check(`${name}: JSON parses`, false);
    return null;
  }
  const o = 20 + jsonLen;
  const binLen = v.getUint32(o, true);
  check(`${name}: BIN chunk second`, v.getUint32(o + 4, true) === 0x004e4942);
  check(`${name}: BIN chunk padded`, binLen % 4 === 0);
  check(`${name}: chunks fill the file`, o + 8 + binLen === bytes.length);
  return { json, bin: bytes.subarray(o + 8, o + 8 + binLen) };
}

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const BYTES: Record<number, number> = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };

/** Typed view of an accessor's data (tightly packed, as the exporter writes them). */
function accessorData(g: Glb, i: number): ArrayLike<number> {
  const a = g.json.accessors[i];
  const bv = g.json.bufferViews[a.bufferView];
  const start = g.bin.byteOffset + bv.byteOffset + (a.byteOffset ?? 0);
  const n = a.count * COMPONENTS[a.type];
  const buf = g.bin.buffer;
  if (a.componentType === 5126) return new Float32Array(buf.slice(start, start + n * 4));
  if (a.componentType === 5125) return new Uint32Array(buf.slice(start, start + n * 4));
  if (a.componentType === 5123) return new Uint16Array(buf.slice(start, start + n * 2));
  return new Uint8Array(buf.slice(start, start + n));
}

const END_JOINTS = ['RightHand', 'LeftHand', 'RightFoot', 'LeftFoot'];

/** The glTF-level checks a validator would make on what the exporter writes. */
function validateStructure(name: string, g: Glb, m: PlayerModelData): void {
  const j = g.json;
  check(`${name}: asset 2.0`, j.asset?.version === '2.0');
  check(`${name}: one buffer the size of BIN`, j.buffers.length === 1 && j.buffers[0].byteLength <= g.bin.length && g.bin.length - j.buffers[0].byteLength < 4);
  for (const [i, bv] of j.bufferViews.entries()) {
    check(`${name}: bufferView ${i} inside the buffer`, bv.byteOffset + bv.byteLength <= j.buffers[0].byteLength);
    check(`${name}: bufferView ${i} aligned`, bv.byteOffset % 4 === 0);
  }
  for (const [i, a] of j.accessors.entries()) {
    const bv = j.bufferViews[a.bufferView];
    const size = a.count * COMPONENTS[a.type] * BYTES[a.componentType];
    check(`${name}: accessor ${i} inside its view`, (a.byteOffset ?? 0) + size <= bv.byteLength, `${a.byteOffset}+${size} > ${bv.byteLength}`);
    check(`${name}: accessor ${i} offset aligned`, ((a.byteOffset ?? 0) + bv.byteOffset) % BYTES[a.componentType] === 0);
    check(`${name}: accessor ${i} not empty`, a.count >= 1);
  }
  const prims = j.meshes[0].primitives as Json[];
  check(`${name}: one primitive per non-empty group`, prims.length === m.groups.filter((gr) => gr.count > 0).length);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let tris = 0;
  let badIndex = 0;
  let badNormal = 0;
  let badSum = 0;
  let badJoint = 0;
  let badMinMax = 0;
  for (const p of prims) {
    const pos = j.accessors[p.attributes.POSITION];
    const vc = pos.count;
    for (const k of ['NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']) check(`${name}: ${k} count`, j.accessors[p.attributes[k]].count === vc);
    const data = accessorData(g, p.attributes.POSITION);
    for (let i = 0; i < data.length; i++) if (data[i] < pos.min[i % 3] - 1e-6 || data[i] > pos.max[i % 3] + 1e-6) badMinMax++;
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], pos.min[k]);
      max[k] = Math.max(max[k], pos.max[k]);
    }
    const idx = accessorData(g, p.indices);
    tris += idx.length / 3;
    const used = new Uint8Array(vc);
    for (let i = 0; i < idx.length; i++) {
      if (idx[i] >= vc) badIndex++;
      else used[idx[i]] = 1;
    }
    check(`${name}: every vertex of a primitive is used`, used.every((u) => u === 1));
    const nrm = accessorData(g, p.attributes.NORMAL);
    for (let i = 0; i < vc; i++) if (Math.abs(Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) - 1) > 1e-3) badNormal++;
    const jw = accessorData(g, p.attributes.JOINTS_0);
    const ww = accessorData(g, p.attributes.WEIGHTS_0);
    check(`${name}: WEIGHTS_0 normalised bytes`, j.accessors[p.attributes.WEIGHTS_0].normalized === true && j.accessors[p.attributes.WEIGHTS_0].componentType === 5121);
    for (let i = 0; i < vc; i++) {
      let s = 0;
      for (let k = 0; k < 4; k++) {
        s += ww[i * 4 + k];
        if (jw[i * 4 + k] >= PART_COUNT) badJoint++;
      }
      if (s !== 255) badSum++;
    }
  }
  check(`${name}: POSITION min/max hold`, badMinMax === 0, `${badMinMax}`);
  check(`${name}: model 1.8 tall, feet on 0`, Math.abs(max[1] - 1.8) < 0.01 && Math.abs(min[1]) < 0.01, JSON.stringify([min, max]));
  check(`${name}: indices in range`, badIndex === 0, `${badIndex}`);
  check(`${name}: triangles`, tris === m.indices.length / 3, `${tris} vs ${m.indices.length / 3}`);
  check(`${name}: unit normals`, badNormal === 0, `${badNormal}`);
  check(`${name}: weights sum to 1`, badSum === 0, `${badSum}`);
  check(`${name}: vertices bound to the six parts only`, badJoint === 0, `${badJoint}`);
  // Skin: six part joints in part order, then the four ends; inverse bind matrices = inverse of
  // the joints' world transforms.
  const skin = j.skins[0];
  check(`${name}: ten joints`, skin.joints.length === PART_COUNT + END_JOINTS.length);
  check(`${name}: joint names`, skin.joints.every((n: number, k: number) => j.nodes[n].name === [...GLB_JOINT_NAMES, ...END_JOINTS][k]));
  const parent = new Map<number, number>();
  j.nodes.forEach((n: Json, i: number) => (n.children ?? []).forEach((c: number) => parent.set(c, i)));
  const world = (n: number): number[] => {
    const t = j.nodes[n].translation ?? [0, 0, 0];
    const p = parent.get(n);
    if (p === undefined) return t;
    const w = world(p);
    return [w[0] + t[0], w[1] + t[1], w[2] + t[2]];
  };
  const ibm = accessorData(g, skin.inverseBindMatrices);
  let worst = 0;
  for (let k = 0; k < skin.joints.length; k++) {
    const w = world(skin.joints[k]);
    for (let a = 0; a < 3; a++) {
      if (k < PART_COUNT) worst = Math.max(worst, Math.abs(w[a] - m.rig.pivots[k][a]));
      else if (k < PART_COUNT + 2) worst = Math.max(worst, Math.abs(w[a] - m.rig.hands[k - PART_COUNT][a]));
      worst = Math.max(worst, Math.abs(ibm[k * 16 + 12 + a] + w[a]));
    }
  }
  check(`${name}: joints at the pivots and palms, inverse binds match`, worst < 1e-5, `${worst}`);
  const feet = skin.joints.slice(PART_COUNT + 2).map(world);
  check(`${name}: feet below the hips`, feet.every((f: number[], s: number) => f[1] < m.rig.pivots[4 + s][1] - 0.3 && f[1] >= -1e-6), JSON.stringify(feet));
  const meshNode = j.nodes.findIndex((n: Json) => n.mesh === 0);
  check(`${name}: skinned mesh node is a scene root`, parent.get(meshNode) === undefined && j.scenes[0].nodes.includes(meshNode));
  for (const p of prims) for (const k of Object.keys(p.attributes)) check(`${name}: ${k} view has a stride`, j.bufferViews[j.accessors[p.attributes[k]].bufferView].byteStride === COMPONENTS[j.accessors[p.attributes[k]].type] * BYTES[j.accessors[p.attributes[k]].componentType]);
  // Materials and textures.
  check(`${name}: materials`, j.materials.length === m.materials.length);
  check(`${name}: textures`, (j.textures?.length ?? 0) === m.textures.length);
  for (const [i, t] of m.textures.entries()) {
    const img = j.images[i];
    const bv = j.bufferViews[img.bufferView];
    const bytes = g.bin.subarray(bv.byteOffset, bv.byteOffset + bv.byteLength);
    check(`${name}: texture ${i} bytes kept`, img.mimeType === t.mime && bytes.length === t.bytes.length && bytes.every((b, k) => b === t.bytes[k]));
  }
  check(`${name}: rig in extras`, Array.isArray(j.scenes[0].extras?.playerModelRig?.hands));
}

/** Round trip through GltfParser: geometry, UVs, materials, textures, bones and bindings. */
function roundTrip(name: string, glb: Uint8Array, m: PlayerModelData): void {
  const scene = parseGltf(glb, new ModelFiles(), `${name}.glb`);
  const groups = m.groups.filter((gr) => gr.count > 0);
  check(`${name} rt: one mesh per group`, scene.meshes.length === groups.length);
  check(`${name} rt: bones`, scene.bones.length === PART_COUNT + END_JOINTS.length);
  const partOfBone = scene.bones.map((b) => GLB_JOINT_NAMES.indexOf(b.name));
  check(`${name} rt: bone names`, scene.bones.every((b, i) => partOfBone[i] >= 0 || END_JOINTS.includes(b.name)));
  let dPivot = 0;
  scene.bones.forEach((b, i) => {
    if (partOfBone[i] < 0) return;
    for (let a = 0; a < 3; a++) dPivot = Math.max(dPivot, Math.abs(b.position[a] - m.rig.pivots[partOfBone[i]][a]));
  });
  check(`${name} rt: bones at the pivots`, dPivot < 1e-5, `${dPivot}`);
  const regions = ['head', 'body', 'arm', 'arm', 'leg', 'leg'];
  const sides = [null, null, 'R', 'L', 'R', 'L'];
  check(`${name} rt: bone names read as the parts`, GLB_JOINT_NAMES.every((n, k) => classifyName(n).region === regions[k] && classifyName(n).side === sides[k]));
  check(`${name} rt: end names read as hands and feet`, END_JOINTS.every((n, k) => classifyName(n).kind === (k < 2 ? 'hand' : 'foot') && classifyName(n).side === (k % 2 ? 'L' : 'R')));
  let dp = 0;
  let duv = 0;
  let badBind = 0;
  let triangles = 0;
  groups.forEach((gr, gi) => {
    const mesh = scene.meshes[gi];
    if (!mesh) return;
    triangles += mesh.indices.length / 3;
    check(`${name} rt: group ${gi} triangles`, mesh.indices.length === gr.count);
    for (let t = 0; t < Math.min(gr.count, mesh.indices.length); t++) {
      const v = m.indices[gr.start + t];
      const l = mesh.indices[t];
      for (let a = 0; a < 3; a++) dp = Math.max(dp, Math.abs(mesh.positions[l * 3 + a] - m.positions[v * 3 + a]));
      for (let a = 0; a < 2; a++) duv = Math.max(duv, Math.abs(mesh.uvs![l * 2 + a] - m.uvs[v * 2 + a]));
      const want = new Map<number, number>();
      const got = new Map<number, number>();
      for (let k = 0; k < 4; k++) {
        const w = m.weights[v * 4 + k];
        if (w > 0) want.set(m.joints[v * 4 + k], (want.get(m.joints[v * 4 + k]) ?? 0) + w / 255);
        const gw = mesh.weights![l * 4 + k];
        if (gw > 0) {
          const part = partOfBone[mesh.joints![l * 4 + k]];
          got.set(part, (got.get(part) ?? 0) + gw);
        }
      }
      let total = 0;
      for (const x of got.values()) total += x;
      for (const [p, w] of want) if (Math.abs((got.get(p) ?? 0) / (total || 1) - w) > 0.01) badBind++;
    }
    const mat = m.materials[gr.material];
    const s = scene.materials[mesh.groups[0].material];
    const col = s.color.map((c) => Math.round(c * 255));
    check(`${name} rt: group ${gi} colour`, col.every((c, k) => c === mat.color[k]), `${col} vs ${mat.color}`);
    check(`${name} rt: group ${gi} alpha`, s.alpha === ['opaque', 'mask', 'blend'][mat.alpha]);
    if (mat.texture >= 0) {
      const t = scene.textures[s.texture]?.bytes;
      const want = m.textures[mat.texture].bytes;
      check(`${name} rt: group ${gi} texture bytes`, !!t && t.length === want.length && t.every((b, k) => b === want[k]));
    } else check(`${name} rt: group ${gi} untextured`, s.texture === -1);
  });
  check(`${name} rt: triangles`, triangles === m.indices.length / 3);
  check(`${name} rt: positions (rest pose)`, dp < 1e-5, `${dp}`);
  check(`${name} rt: uvs`, duv < 1e-6, `${duv}`);
  check(`${name} rt: part bindings`, badBind === 0, `${badBind} corners differ`);
  check(`${name} rt: credits as copyright`, !m.credits || scene.info.includes(m.credits));
}

for (const info of index.models) {
  const bytes = new Uint8Array(readFileSync(join(process.cwd(), 'public/models', info.file)));
  const m = decodePlayerModel(bytes);
  const glb = exportGlb(m);
  const g = readGlb(info.id, glb);
  if (g) validateStructure(info.id, g, m);
  roundTrip(info.id, glb, m);
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${info.id}.glb`), glb);
  }
  console.log(`${info.id}: ${(glb.length / 1024).toFixed(0)} KB .glb, ${m.positions.length / 3} vertices, ${m.indices.length / 3} triangles`);
}

// Importing an exported file again: rigged from its skeleton, same size and joints.
{
  const m = decodePlayerModel(new Uint8Array(readFileSync(join(process.cwd(), 'public/models/roblox_noob/model.mcpm'))));
  const r = await importModel([{ name: 'roblox_noob.glb', bytes: exportGlb(m) }], nodeCodec);
  const back = decodePlayerModel(r.bytes);
  check('re-import: rigged from the skeleton', back.rig.source === 'skeleton', back.rig.source);
  check('re-import: same triangles', back.indices.length === m.indices.length, `${back.indices.length} vs ${m.indices.length}`);
  let dPivot = 0;
  for (let k = 0; k < PART_COUNT; k++) for (let a = 0; a < 3; a++) dPivot = Math.max(dPivot, Math.abs(back.rig.pivots[k][a] - m.rig.pivots[k][a]));
  check('re-import: pivots kept', dPivot < 0.02, `${dPivot}`);
  let dHand = 0;
  for (let h = 0; h < 2; h++) for (let a = 0; a < 3; a++) dHand = Math.max(dHand, Math.abs(back.rig.hands[h][a] - m.rig.hands[h][a]));
  check('re-import: palms close', dHand < 0.1, `${dHand}`);
}

// A synthetic model: wide indices, an untextured material, a WebP texture, an unweighted vertex.
{
  const vc = 70_000;
  const positions = new Float32Array(vc * 3);
  const normals = new Int8Array(vc * 3);
  const uvs = new Float32Array(vc * 2);
  const joints = new Uint8Array(vc * 4);
  const weights = new Uint8Array(vc * 4);
  for (let i = 0; i < vc; i++) {
    positions[i * 3] = ((i % 100) / 100 - 0.5) * 0.6;
    positions[i * 3 + 1] = (Math.floor(i / 100) / (vc / 100)) * 1.8;
    positions[i * 3 + 2] = 0.1;
    normals[i * 3 + 2] = 127;
    joints[i * 4] = i % PART_COUNT;
    weights[i * 4] = i === 5 ? 0 : 200;
    joints[i * 4 + 1] = (i + 1) % PART_COUNT;
    weights[i * 4 + 1] = i === 5 ? 0 : 55;
  }
  const indices = new Uint32Array(3 * (vc - 2));
  for (let i = 0; i < vc - 2; i++) indices.set([i, i + 1, i + 2], i * 3);
  const half = Math.floor((vc - 2) / 2) * 3;
  const m: PlayerModelData = {
    name: 'Synthetic: Wide / WebP',
    credits: '',
    positions,
    normals,
    uvs,
    joints,
    weights,
    indices,
    groups: [
      { start: 0, count: half, material: 0 },
      { start: half, count: 0, material: 1 },
      { start: half, count: indices.length - half, material: 1 },
    ],
    materials: [
      { color: [255, 128, 0, 255], texture: -1, alpha: 0 },
      { color: [255, 255, 255, 128], texture: 0, alpha: 2 },
    ],
    textures: [{ mime: 'image/webp', bytes: new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]) }],
    rig: {
      pivots: [[0, 1.5, 0], [0, 1.5, 0], [-0.3, 1.4, 0], [0.3, 1.4, 0], [-0.1, 0.8, 0], [0.1, 0.8, 0]],
      hands: [[-0.3, 0.8, 0], [0.3, 0.8, 0]],
      headCenter: [0, 1.65, 0],
      headSize: 0.3,
      source: 'geometry',
    },
  };
  const glb = exportGlb(m);
  const g = readGlb('synthetic', glb);
  if (g) {
    validateStructure('synthetic', g, m);
    check('synthetic: WebP through EXT_texture_webp (required)', g.json.extensionsRequired?.includes('EXT_texture_webp') && g.json.textures[0].extensions?.EXT_texture_webp?.source === 0);
    check('synthetic: untextured material has no texture', g.json.materials[0].pbrMetallicRoughness.baseColorTexture === undefined);
    check('synthetic: blend material', g.json.materials[1].alphaMode === 'BLEND' && Math.abs(g.json.materials[1].pbrMetallicRoughness.baseColorFactor[3] - 128 / 255) < 1e-3);
    const ww = accessorData(g, g.json.meshes[0].primitives[0].attributes.WEIGHTS_0);
    const jw = accessorData(g, g.json.meshes[0].primitives[0].attributes.JOINTS_0);
    // Vertex 5 is the sixth vertex the first group uses.
    check('synthetic: an unweighted vertex goes to the body', ww[5 * 4] === 255 && jw[5 * 4] === 1);
  }
  const converted = await withStandardTextures(m, async () => new Uint8Array([137, 80, 78, 71]));
  check('withStandardTextures: WebP becomes PNG', converted.textures[0].mime === 'image/png' && converted.textures[0].bytes[0] === 137);
  const g2 = readGlb('synthetic png', exportGlb(converted));
  check('withStandardTextures: no extension needed', !!g2 && !g2.json.extensionsRequired && g2.json.textures[0].source === 0);
  const kept = await withStandardTextures(m, async () => null);
  check('withStandardTextures: unreadable texture kept', kept.textures[0].mime === 'image/webp');
}

check('file names', exportFileName('John Marston', 'glb') === 'john_marston.glb' && exportFileName('  ', 'mcpm') === 'player_model.mcpm' && exportFileName('Roblox Noob!', 'mcpm') === 'roblox_noob.mcpm');

report();
