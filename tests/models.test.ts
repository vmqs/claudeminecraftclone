/**
 * Custom player models without a browser: the three built-in models (normalised to 1.8 blocks,
 * all six ModelBiped parts present, the skinned one rigged from its skeleton), the import
 * pipeline on synthetic models (an untextured OBJ in Z-up facing -X with T-pose arms, a skinned
 * glTF with Mixamo bone names, a tiny ASCII FBX), bone-name recognition, posing, and the model
 * file decoder against damaged and hostile data.
 * Run: node scripts/run-node-test.mjs tests/models.test.ts
 * With MODEL_PREVIEW_DIR=<dir> it also writes PNG previews of the built-in models posed by
 * ModelBiped (front, side, walking, sneaking, swinging).
 */
import { deflateSync, zipSync, zlibSync } from 'fflate';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyName } from '../src/client/model/BoneNames';
import { parseFbx } from '../src/client/model/FbxParser';
import { parseGltf } from '../src/client/model/GltfParser';
import { buildPlayerModel } from '../src/client/model/ModelBuilder';
import { ModelFiles } from '../src/client/model/ModelFiles';
import { encodePng } from '../src/client/model/ImageCodecs';
import { importModel } from '../src/client/model/ModelImportPipeline';
import { partMatrices, bipedPivots, restPose } from '../src/client/model/ModelPose';
import { parseObj } from '../src/client/model/ObjParser';
import {
  decodePlayerModel,
  encodePlayerModel,
  ModelFormatError,
  modelHash,
  PART_COUNT,
  PART_HEAD,
  PART_LEFT_ARM,
  PART_LEFT_LEG,
  PART_NAMES,
  PART_RIGHT_ARM,
  PART_RIGHT_LEG,
  type PlayerModelData,
  turnAround,
} from '../src/client/model/PlayerModelFormat';
import { MAX_NET_MODEL_BYTES, PlayerModelRegistry } from '../src/client/model/PlayerModels';
import { ModelBiped } from '../src/render/entity/ModelBiped';
import { check, report } from './harness';
import { nodeCodec, renderViews, type View } from './modelPreview';

// ------------------------------------------------------------------ helpers

function boundsOf(m: PlayerModelData): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], m.positions[i + k]);
      max[k] = Math.max(max[k], m.positions[i + k]);
    }
  }
  return { min, max };
}

/** Vertices whose strongest part is each of the six. */
function partCounts(m: PlayerModelData): number[] {
  const n = new Array(PART_COUNT).fill(0);
  for (let i = 0; i < m.joints.length; i += 4) n[m.joints[i]]++;
  return n;
}

function checkRig(label: string, m: PlayerModelData): void {
  const b = boundsOf(m);
  const h = b.max[1] - b.min[1];
  check(`${label}: 1.8 blocks tall`, Math.abs(h - 1.8) < 0.005, `${h}`);
  check(`${label}: feet on y = 0`, Math.abs(b.min[1]) < 0.002, `${b.min[1]}`);
  const counts = partCounts(m);
  PART_NAMES.forEach((name, k) => check(`${label}: has a ${name}`, counts[k] >= 8, `${counts[k]}`));
  const p = m.rig.pivots;
  check(`${label}: head above the shoulders`, p[PART_HEAD][1] > p[PART_RIGHT_ARM][1] && p[PART_HEAD][1] > p[PART_LEFT_ARM][1], JSON.stringify(p));
  check(`${label}: shoulders above the hips`, p[PART_RIGHT_ARM][1] > p[PART_RIGHT_LEG][1] + 0.2 && p[PART_LEFT_ARM][1] > p[PART_LEFT_LEG][1] + 0.2, JSON.stringify(p));
  check(`${label}: right side on -x`, p[PART_RIGHT_ARM][0] < 0 && p[PART_LEFT_ARM][0] > 0 && p[PART_RIGHT_LEG][0] < 0 && p[PART_LEFT_LEG][0] > 0, JSON.stringify(p));
  check(`${label}: centred`, Math.abs(p[PART_RIGHT_LEG][0] + p[PART_LEFT_LEG][0]) < 0.05 && Math.abs(p[PART_RIGHT_ARM][0] + p[PART_LEFT_ARM][0]) < 0.08, JSON.stringify(p));
  check(`${label}: hands hang below the shoulders`, m.rig.hands[0][1] < p[PART_RIGHT_ARM][1] - 0.3 && m.rig.hands[1][1] < p[PART_LEFT_ARM][1] - 0.3, JSON.stringify(m.rig.hands));
  check(`${label}: head near the top`, m.rig.headCenter[1] > 1.4 && m.rig.headSize > 0.1, JSON.stringify(m.rig.headCenter));
}

function poses(fn: (b: ModelBiped) => void): ReturnType<typeof restPose>[] {
  const b = new ModelBiped(0);
  b.isChild = false;
  fn(b);
  return [b.bipedHead, b.bipedBody, b.bipedRightArm, b.bipedLeftArm, b.bipedRightLeg, b.bipedLeftLeg].map((r) => ({
    rotationPointX: r.rotationPointX,
    rotationPointY: r.rotationPointY,
    rotationPointZ: r.rotationPointZ,
    rotateAngleX: r.rotateAngleX,
    rotateAngleY: r.rotateAngleY,
    rotateAngleZ: r.rotateAngleZ,
  }));
}

// ------------------------------------------------------------------ built-in models

const root = join(import.meta.dirname ?? '.', '..');
const modelsDir = existsSync(join(root, 'public/models')) ? join(root, 'public/models') : join(process.cwd(), 'public/models');
const index = JSON.parse(readFileSync(join(modelsDir, 'index.json'), 'utf8')) as { models: { id: string; name: string; file: string; bytes: number; hash: string }[] };
check('three built-in models', index.models.length === 3, JSON.stringify(index.models.map((m) => m.id)));
const previewDir = process.env.MODEL_PREVIEW_DIR;
for (const info of index.models) {
  const bytes = new Uint8Array(readFileSync(join(modelsDir, info.file)));
  check(`${info.id}: index size and hash`, bytes.length === info.bytes && modelHash(bytes) === info.hash);
  check(`${info.id}: small enough to share (<= 3 MiB)`, bytes.length <= MAX_NET_MODEL_BYTES, `${bytes.length}`);
  const m = decodePlayerModel(bytes);
  check(`${info.id}: name`, m.name === info.name, m.name);
  check(`${info.id}: textured`, m.textures.length >= 1 && m.materials.some((x) => x.texture >= 0));
  checkRig(info.id, m);
  if (previewDir) {
    const rest = poses((b) => b.setRotationAngles(0, 0, 0, 0, 0, 0.0625, null));
    const walk = poses((b) => b.setRotationAngles(1.2, 0.8, 0, 25, -10, 0.0625, null));
    const sneak = poses((b) => {
      b.isSneak = true;
      b.setRotationAngles(0, 0, 0, 0, 0, 0.0625, null);
    });
    const swing = poses((b) => {
      b.onGround = 0.35;
      b.heldItemRight = 1;
      b.setRotationAngles(0, 0, 0, 0, 0, 0.0625, null);
    });
    const views: View[] = [
      { yaw: 0, parts: rest },
      { yaw: 90, parts: rest },
      { yaw: 30, parts: walk },
      { yaw: 90, parts: sneak },
      { yaw: 40, parts: swing },
    ];
    writeFileSync(join(previewDir, `${info.id}.png`), renderViews(m, views, 300));
  }
}
const john = decodePlayerModel(new Uint8Array(readFileSync(join(modelsDir, 'john_marston/model.mcpm'))));
check('john_marston: rigged from its skeleton', john.rig.source === 'skeleton');
const noob = decodePlayerModel(new Uint8Array(readFileSync(join(modelsDir, 'roblox_noob/model.mcpm'))));
check('roblox_noob: rigged by its shape', noob.rig.source === 'geometry');

// ------------------------------------------------------------------ posing

{
  // At rest every part matrix is the identity.
  const bones = new Float32Array(6 * 16);
  partMatrices(bipedPivots(noob.rig), [0, 1, 2, 3, 4, 5].map(restPose), bones);
  let maxDiff = 0;
  for (let k = 0; k < 6; k++) for (let i = 0; i < 16; i++) maxDiff = Math.max(maxDiff, Math.abs(bones[k * 16 + i] - (i % 5 === 0 ? 1 : 0)));
  check('rest pose: identity bones', maxDiff < 1e-6, `${maxDiff}`);
  // Walking swings the right leg forward or back about its hip: the hip stays put.
  const walk = poses((b) => b.setRotationAngles(1, 1, 0, 0, 0, 0.0625, null));
  partMatrices(bipedPivots(noob.rig), walk, bones);
  const hip = bipedPivots(noob.rig)[PART_RIGHT_LEG];
  const o = PART_RIGHT_LEG * 16;
  const moved = [bones[o] * hip[0] + bones[o + 4] * hip[1] + bones[o + 8] * hip[2] + bones[o + 12] - hip[0], bones[o + 1] * hip[0] + bones[o + 5] * hip[1] + bones[o + 9] * hip[2] + bones[o + 13] - hip[1]];
  check('walking: the hip joint stays', Math.hypot(moved[0], moved[1]) < 1e-5, JSON.stringify(moved));
  check('walking: the leg turns', Math.abs(bones[o + 5] - 1) > 0.01);
}

// ------------------------------------------------------------------ synthetic OBJ (no skeleton)

/** Boxes of a person 180 units tall, Y up, facing +Z, arms out in a T-pose, toes forward. */
function personBoxes(): { name: string; min: number[]; max: number[] }[] {
  return [
    { name: 'Box01', min: [-22, 0, -7], max: [-3, 88, 7] }, // right leg
    { name: 'Box02', min: [3, 0, -7], max: [22, 88, 7] }, // left leg
    { name: 'Box03', min: [-22, 0, 7], max: [-3, 8, 26] }, // right toes
    { name: 'Box04', min: [3, 0, 7], max: [22, 8, 26] }, // left toes
    { name: 'Box05', min: [-22, 88, -11], max: [22, 148, 11] }, // torso
    { name: 'Box06', min: [-6, 148, -6], max: [6, 154, 6] }, // neck
    { name: 'Box07', min: [-11, 154, -12], max: [11, 180, 12] }, // head
    { name: 'Box08', min: [-90, 136, -6], max: [-24, 148, 6] }, // right arm (T-pose, gap from the torso)
    { name: 'Box09', min: [24, 136, -6], max: [90, 148, 6] }, // left arm
  ];
}

function objFrom(boxes: { name: string; min: number[]; max: number[] }[], transform: (p: number[]) => number[]): string {
  const lines: string[] = [];
  let base = 1;
  for (const b of boxes) {
    lines.push(`g ${b.name}`);
    const c: number[][] = [];
    for (let i = 0; i < 8; i++) c.push(transform([i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]]));
    for (const p of c) lines.push(`v ${p[0]} ${p[1]} ${p[2]}`);
    const faces = [
      [0, 2, 3, 1],
      [4, 5, 7, 6],
      [0, 1, 5, 4],
      [2, 6, 7, 3],
      [0, 4, 6, 2],
      [1, 3, 7, 5],
    ];
    for (const f of faces) lines.push(`f ${f.map((i) => i + base).join(' ')}`);
    base += 8;
  }
  return lines.join('\n');
}

{
  // Z up, facing -X: turn about Y so +Z faces -X ((x, y, z) -> (-z, y, x)), then tip Y up onto
  // Z ((x, y, z) -> (x, -z, y)): a rotation, no mirroring.
  const toSource = (p: number[]) => {
    const [x, y, z] = p;
    return [-z, -x, y];
  };
  const text = objFrom(personBoxes(), toSource);
  const files = new ModelFiles();
  files.add('person.obj', new TextEncoder().encode(text));
  const scene = parseObj(files.get('person.obj')!, files, 'person.obj');
  check('obj: nine boxes', scene.meshes.length === 9, `${scene.meshes.length}`);
  const { model, report: r } = await buildPlayerModel(scene, files, nodeCodec, { name: 'Person' });
  check('obj: Z up found', r.up === '+z', r.up);
  check('obj: facing found from the toes', r.facing.startsWith('-x'), r.facing);
  check('obj: rigged by shape', r.rig === 'geometry');
  checkRig('obj person', model);
  // The T-pose arms now hang: the hand is far below the shoulder, close to the body.
  const p = model.rig.pivots;
  check('obj: arms turned down', model.rig.hands[0][1] < p[PART_RIGHT_ARM][1] - 0.5 && Math.abs(model.rig.hands[0][0] - p[PART_RIGHT_ARM][0]) < 0.12, JSON.stringify(model.rig.hands));
  // The toes point forward (+Z) after normalising.
  const b = boundsOf(model);
  check('obj: toes forward', b.max[2] > -b.min[2] + 0.05, JSON.stringify(b));
  const bytes = encodePlayerModel(model);
  const again = decodePlayerModel(bytes);
  check('obj: format round trip', again.indices.length === model.indices.length && again.positions.length === model.positions.length);
  if (previewDir) writeFileSync(join(previewDir, 'synthetic-obj.png'), renderViews(again, [{ yaw: 0, parts: poses((x) => x.setRotationAngles(0, 0, 0, 0, 0, 0.0625, null)) }, { yaw: 30, parts: poses((x) => x.setRotationAngles(1.2, 0.8, 0, 0, 0, 0.0625, null)) }], 240));
}

// ------------------------------------------------------------------ synthetic glTF with a skeleton

{
  const boxes = personBoxes();
  // Joint per box (Mixamo names) and the joint positions.
  const joints = [
    ['mixamorig:Hips', [0, 92, 0], -1],
    ['mixamorig:Spine', [0, 110, 0], 0],
    ['mixamorig:Neck', [0, 148, 0], 1],
    ['mixamorig:Head', [0, 154, 0], 2],
    ['mixamorig:RightArm', [-26, 142, 0], 1],
    ['mixamorig:RightHand', [-80, 142, 0], 4],
    ['mixamorig:LeftArm', [26, 142, 0], 1],
    ['mixamorig:LeftHand', [80, 142, 0], 6],
    ['mixamorig:RightUpLeg', [-12, 88, 0], 0],
    ['mixamorig:RightFoot', [-12, 8, 0], 8],
    ['mixamorig:LeftUpLeg', [12, 88, 0], 0],
    ['mixamorig:LeftFoot', [12, 8, 0], 10],
  ] as [string, number[], number][];
  const boxJoint = [8, 10, 9, 11, 1, 2, 3, 4, 6];
  const pos: number[] = [];
  const jnt: number[] = [];
  const wts: number[] = [];
  const idx: number[] = [];
  boxes.forEach((b, bi) => {
    const base = pos.length / 3;
    for (let i = 0; i < 8; i++) {
      pos.push(i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]);
      jnt.push(boxJoint[bi], 0, 0, 0);
      wts.push(1, 0, 0, 0);
    }
    for (const f of [
      [0, 2, 3, 1],
      [4, 5, 7, 6],
      [0, 1, 5, 4],
      [2, 6, 7, 3],
      [0, 4, 6, 2],
      [1, 3, 7, 5],
    ])
      idx.push(base + f[0], base + f[1], base + f[2], base + f[0], base + f[2], base + f[3]);
  });
  const ibm: number[] = [];
  for (const [, p] of joints) ibm.push(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -p[0], -p[1], -p[2], 1);
  const parts = [new Float32Array(pos), new Uint16Array(jnt), new Float32Array(wts), new Uint16Array(idx), new Float32Array(ibm)];
  const offsets: number[] = [];
  let total = 0;
  for (const a of parts) {
    offsets.push(total);
    total += (a.byteLength + 3) & ~3;
  }
  const bin = new Uint8Array(total);
  parts.forEach((a, i) => bin.set(new Uint8Array(a.buffer), offsets[i]));
  const vc = pos.length / 3;
  // Joint world positions come from parents: translations relative to the parent.
  const nodes = joints.map(([name, p, parent]) => {
    const pp = parent >= 0 ? joints[parent][1] : [0, 0, 0];
    return { name, translation: [p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]], children: [] as number[] };
  });
  joints.forEach(([, , parent], i) => {
    if (parent >= 0) nodes[parent].children.push(i);
  });
  const meshNode = nodes.length;
  const gltf = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0, meshNode] }],
    nodes: [...nodes, { name: 'Body', mesh: 0, skin: 0 }],
    skins: [{ joints: joints.map((_, i) => i), inverseBindMatrices: 4 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 }, indices: 3 }] }],
    buffers: [{ byteLength: total, uri: `data:application/octet-stream;base64,${Buffer.from(bin).toString('base64')}` }],
    bufferViews: parts.map((a, i) => ({ buffer: 0, byteOffset: offsets[i], byteLength: a.byteLength })),
    accessors: [
      { bufferView: 0, componentType: 5126, count: vc, type: 'VEC3' },
      { bufferView: 1, componentType: 5123, count: vc, type: 'VEC4' },
      { bufferView: 2, componentType: 5126, count: vc, type: 'VEC4' },
      { bufferView: 3, componentType: 5123, count: idx.length, type: 'SCALAR' },
      { bufferView: 4, componentType: 5126, count: joints.length, type: 'MAT4' },
    ],
  };
  const files = new ModelFiles();
  const scene = parseGltf(new TextEncoder().encode(JSON.stringify(gltf)), files, 'person.gltf');
  check('gltf: skeleton read', scene.bones.length === joints.length && scene.meshes[0].joints !== null);
  const { model, report: r } = await buildPlayerModel(scene, files, nodeCodec, { name: 'Rigged' });
  check('gltf: rigged from the Mixamo skeleton', r.rig === 'skeleton', JSON.stringify(r));
  check('gltf: facing from the skeleton', r.facing.includes('skeleton'), r.facing);
  checkRig('gltf person', model);
  // The shoulder pivot comes from the RightArm joint (x = -26 of 180 -> about -0.26 blocks).
  check('gltf: shoulder pivot from the joint', Math.abs(model.rig.pivots[PART_RIGHT_ARM][0] + 0.26) < 0.03, JSON.stringify(model.rig.pivots[PART_RIGHT_ARM]));
  // The same as a .glb (JSON chunk + BIN chunk).
  const glbJson = { ...gltf, buffers: [{ byteLength: total }] };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(glbJson));
  const jsonPad = (jsonBytes.length + 3) & ~3;
  const glb = new Uint8Array(12 + 8 + jsonPad + 8 + bin.length);
  const gv = new DataView(glb.buffer);
  gv.setUint32(0, 0x46546c67, true);
  gv.setUint32(4, 2, true);
  gv.setUint32(8, glb.length, true);
  gv.setUint32(12, jsonPad, true);
  gv.setUint32(16, 0x4e4f534a, true);
  glb.fill(0x20, 20, 20 + jsonPad);
  glb.set(jsonBytes, 20);
  gv.setUint32(20 + jsonPad, bin.length, true);
  gv.setUint32(24 + jsonPad, 0x004e4942, true);
  glb.set(bin, 28 + jsonPad);
  const glbScene = parseGltf(glb, new ModelFiles(), 'person.glb');
  const fromGlb = await buildPlayerModel(glbScene, null, nodeCodec, { name: 'Rigged GLB' });
  check('glb: same rig as the .gltf', fromGlb.report.rig === 'skeleton' && Math.abs(fromGlb.model.rig.pivots[PART_RIGHT_ARM][0] - model.rig.pivots[PART_RIGHT_ARM][0]) < 1e-4);
}

// ------------------------------------------------------------------ binary FBX

{
  // A small binary FBX 7.4 writer: node records, typed properties, zlib-compressed arrays.
  type Prop = ['L', bigint] | ['S', string] | ['D', number] | ['I', number] | ['d', number[]] | ['i', number[]] | ['R', Uint8Array];
  interface Node {
    name: string;
    props: Prop[];
    children?: Node[];
  }
  const parts: Uint8Array[] = [];
  let size = 0;
  const push = (b: Uint8Array) => {
    parts.push(b);
    size += b.length;
  };
  const u32 = (v: number) => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v, true);
    return b;
  };
  const propBytes = (p: Prop): Uint8Array => {
    const [t, v] = p;
    if (t === 'L') {
      const b = new Uint8Array(9);
      b[0] = 76;
      new DataView(b.buffer).setBigInt64(1, v as bigint, true);
      return b;
    }
    if (t === 'S' || t === 'R') {
      const d = t === 'S' ? new TextEncoder().encode(v as string) : (v as Uint8Array);
      const b = new Uint8Array(5 + d.length);
      b[0] = t.charCodeAt(0);
      new DataView(b.buffer).setUint32(1, d.length, true);
      b.set(d, 5);
      return b;
    }
    if (t === 'D') {
      const b = new Uint8Array(9);
      b[0] = 68;
      new DataView(b.buffer).setFloat64(1, v as number, true);
      return b;
    }
    if (t === 'I') {
      const b = new Uint8Array(5);
      b[0] = 73;
      new DataView(b.buffer).setInt32(1, v as number, true);
      return b;
    }
    const arr = v as number[];
    const raw = new Uint8Array(arr.length * (t === 'd' ? 8 : 4));
    const dv = new DataView(raw.buffer);
    arr.forEach((x, i) => (t === 'd' ? dv.setFloat64(i * 8, x, true) : dv.setInt32(i * 4, x, true)));
    const z = zlibSync(raw);
    const b = new Uint8Array(13 + z.length);
    b[0] = t.charCodeAt(0);
    const bv = new DataView(b.buffer);
    bv.setUint32(1, arr.length, true);
    bv.setUint32(5, 1, true);
    bv.setUint32(9, z.length, true);
    b.set(z, 13);
    return b;
  };
  const writeNode = (n: Node, offset: number): Uint8Array => {
    const name = new TextEncoder().encode(n.name);
    const props = n.props.map(propBytes);
    const propLen = props.reduce((a, b) => a + b.length, 0);
    const headLen = 13 + name.length + propLen;
    const kids: Uint8Array[] = [];
    let at = offset + headLen;
    for (const c of n.children ?? []) {
      const k = writeNode(c, at);
      kids.push(k);
      at += k.length;
    }
    if (n.children) {
      kids.push(new Uint8Array(13));
      at += 13;
    }
    const out = new Uint8Array(at - offset);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, at, true);
    dv.setUint32(4, props.length, true);
    dv.setUint32(8, propLen, true);
    out[12] = name.length;
    out.set(name, 13);
    let o = 13 + name.length;
    for (const p of props) {
      out.set(p, o);
      o += p.length;
    }
    for (const k of kids) {
      out.set(k, o);
      o += k.length;
    }
    return out;
  };
  const pngTex = encodePng({ width: 2, height: 2, rgba: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]) });
  const P = (name: string, ...vals: number[]): Node => ({ name: 'P', props: [['S', name], ['S', name], ['S', ''], ['S', 'A'], ...vals.map((x) => ['D', x] as Prop)] });
  const roots: Node[] = [
    { name: 'GlobalSettings', props: [], children: [{ name: 'Properties70', props: [], children: [{ name: 'P', props: [['S', 'UpAxis'], ['S', 'int'], ['S', 'Integer'], ['S', ''], ['I', 2]] }] }] },
    {
      name: 'Objects',
      props: [],
      children: [
        {
          name: 'Geometry',
          props: [['L', 10n], ['S', 'Quad\u0000\u0001Geometry'], ['S', 'Mesh']],
          children: [
            { name: 'Vertices', props: [['d', [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]]] },
            { name: 'PolygonVertexIndex', props: [['i', [0, 1, 2, -4]]] },
            {
              name: 'LayerElementUV',
              props: [['I', 0]],
              children: [
                { name: 'MappingInformationType', props: [['S', 'ByPolygonVertex']] },
                { name: 'ReferenceInformationType', props: [['S', 'IndexToDirect']] },
                { name: 'UV', props: [['d', [0, 0, 1, 0, 1, 1, 0, 1]]] },
                { name: 'UVIndex', props: [['i', [0, 1, 2, 3]]] },
              ],
            },
          ],
        },
        { name: 'Model', props: [['L', 20n], ['S', 'Quad\u0000\u0001Model'], ['S', 'Mesh']], children: [{ name: 'Properties70', props: [], children: [P('Lcl Translation', 0, 0, 3), P('Lcl Rotation', 90, 0, 0)] }] },
        { name: 'Material', props: [['L', 30n], ['S', 'Skin\u0000\u0001Material'], ['S', '']], children: [] },
        { name: 'Texture', props: [['L', 40n], ['S', 'skin\u0000\u0001Texture'], ['S', '']], children: [{ name: 'RelativeFilename', props: [['S', 'textures\\skin.png']] }] },
        { name: 'Video', props: [['L', 50n], ['S', 'skin\u0000\u0001Video'], ['S', 'Clip']], children: [{ name: 'Content', props: [['R', pngTex]] }] },
      ],
    },
    {
      name: 'Connections',
      props: [],
      children: [
        { name: 'C', props: [['S', 'OO'], ['L', 10n], ['L', 20n]] },
        { name: 'C', props: [['S', 'OO'], ['L', 20n], ['L', 0n]] },
        { name: 'C', props: [['S', 'OO'], ['L', 30n], ['L', 20n]] },
        { name: 'C', props: [['S', 'OP'], ['L', 40n], ['L', 30n], ['S', 'DiffuseColor']] },
        { name: 'C', props: [['S', 'OO'], ['L', 50n], ['L', 40n]] },
      ],
    },
  ];
  const header = new Uint8Array(27);
  header.set(new TextEncoder().encode('Kaydara FBX Binary  '), 0);
  header[20] = 0;
  header[21] = 0x1a;
  header[22] = 0;
  new DataView(header.buffer).setUint32(23, 7400, true);
  push(header);
  for (const n of roots) push(writeNode(n, size));
  push(new Uint8Array(13));
  push(u32(0));
  const fbx = new Uint8Array(size);
  let o = 0;
  for (const b of parts) {
    fbx.set(b, o);
    o += b.length;
  }
  const scene = parseFbx(fbx);
  check('fbx binary: one quad as two triangles', scene.meshes.length === 1 && scene.meshes[0].indices.length === 6, `${scene.meshes[0]?.indices.length}`);
  check('fbx binary: Z up from the settings', scene.upAxis === 'z');
  // Rotated 90 degrees about X, then moved 3 up along Z: the quad stands in the XZ plane at z 3..4.
  const pz = [...scene.meshes[0].positions].filter((_, i) => i % 3 === 2);
  check('fbx binary: node transform (rotation then translation)', Math.abs(Math.min(...pz) - 3) < 1e-6 && Math.abs(Math.max(...pz) - 4) < 1e-6, JSON.stringify(pz));
  check('fbx binary: UVs read and flipped to image rows', scene.meshes[0].uvs !== null && [...scene.meshes[0].uvs!].includes(1) && [...scene.meshes[0].uvs!].includes(0));
  check('fbx binary: embedded texture found', scene.textures.length === 1 && scene.textures[0].name === 'skin.png' && scene.textures[0].bytes?.length === pngTex.length, JSON.stringify(scene.textures.map((t) => [t.name, t.bytes?.length])));
}

// ------------------------------------------------------------------ Import Model... on a .zip

{
  const toSource = (p: number[]) => [p[0], p[1], p[2]];
  const obj = 'mtllib person.mtl\nusemtl cloth\n' + objFrom(personBoxes(), toSource);
  const tex = encodePng({ width: 4, height: 4, rgba: new Uint8Array(64).fill(200) });
  const zip = zipSync({ 'person/person.obj': new TextEncoder().encode(obj), 'person/person.mtl': new TextEncoder().encode('newmtl cloth\nmap_Kd C:\\Users\\me\\tex\\cloth.png\n'), 'person/tex/cloth.png': tex });
  const r = await importModel([{ name: 'person.zip', bytes: zip }], nodeCodec);
  const m = decodePlayerModel(r.bytes);
  check('zip import: model found inside the archive', r.report !== null && r.report.rig === 'geometry' && m.textures.length === 1 && m.materials[0].texture === 0, JSON.stringify(r.report));
  check('zip import: named after the file', r.name === 'Person', r.name);
  let refused = '';
  try {
    await importModel([{ name: 'notes.txt', bytes: new TextEncoder().encode('hello') }], nodeCodec);
  } catch (e) {
    refused = e instanceof Error ? e.message : String(e);
  }
  check('zip import: no model is a clear message', /No model found/.test(refused), refused);
}

// ------------------------------------------------------------------ ASCII FBX

{
  const fbx = `; FBX 7.4.0 project file
FBXHeaderExtension:  {
}
GlobalSettings:  {
\tProperties70:  {
\t\tP: "UpAxis", "int", "Integer", "",1
\t}
}
Objects:  {
\tGeometry: 100, "Geometry::Cube", "Mesh" {
\t\tVertices: *24 {
\t\t\ta: -1,0,-1,1,0,-1,1,0,1,-1,0,1,-1,2,-1,1,2,-1,1,2,1,-1,2,1
\t\t}
\t\tPolygonVertexIndex: *24 {
\t\t\ta: 0,1,2,-4,4,7,6,-6,0,4,5,-2,1,5,6,-3,2,6,7,-4,3,7,4,-1
\t\t}
\t}
\tModel: 200, "Model::Cube", "Mesh" {
\t\tProperties70:  {
\t\t\tP: "Lcl Translation", "Lcl Translation", "", "A",0,5,0
\t\t}
\t}
\tMaterial: 300, "Material::Red", "" {
\t\tProperties70:  {
\t\t\tP: "DiffuseColor", "Color", "", "A",0.8,0.1,0.1
\t\t}
\t}
}
Connections:  {
\tC: "OO",100,200
\tC: "OO",300,200
\tC: "OO",200,0
}
`;
  const scene = parseFbx(new TextEncoder().encode(fbx));
  check('fbx ascii: one mesh', scene.meshes.length === 1 && scene.meshes[0].indices.length === 36, `${scene.meshes.length}`);
  const ys = [...scene.meshes[0].positions].filter((_, i) => i % 3 === 1);
  check('fbx ascii: model transform applied', Math.min(...ys) === 5 && Math.max(...ys) === 7, JSON.stringify(ys));
  check('fbx ascii: material colour', scene.materials.length === 1 && Math.abs(scene.materials[0].color[0] - 0.8) < 1e-6);
}

// ------------------------------------------------------------------ bone names

const names: [string, string, string | null][] = [
  ['mixamorig:LeftUpLeg', 'leg', 'L'],
  ['mixamorig:RightArm', 'arm', 'R'],
  ['mixamorig:Head', 'head', null],
  ['mixamorig:Neck', 'neck', null],
  ['mixamorig:Hips', 'body', null],
  ['SKEL_L_UpperArm', 'arm', 'L'],
  ['SKEL_R_Thigh', 'leg', 'R'],
  ['SKEL_Head', 'head', null],
  ['SKEL_Spine3', 'body', null],
  ['Bip01 L Thigh', 'leg', 'L'],
  ['Bip01 R Forearm', 'arm', 'R'],
  ['upperarm_l', 'arm', 'L'],
  ['calf_r', 'leg', 'R'],
  ['thigh.L', 'leg', 'L'],
  ['DEF-forearm.R', 'arm', 'R'],
  ['Left Arm', 'arm', 'L'],
  ['RightUpperLeg', 'leg', 'R'],
  ['LeftHand', 'arm', 'L'],
  ['clavicle_l', 'body', 'L'],
  ['hip_r', 'leg', 'R'],
  ['hand_000_r_0_0_0', 'arm', null],
  ['uppr_000_u_0_0_0', 'body', null],
  ['teef_000_u_0_0_1', 'head', null],
  ['lowr_000_u_0_0_0', 'leg', null],
];
for (const [n, region, side] of names) {
  const c = classifyName(n);
  check(`bone name ${n}`, c.region === region && c.side === side, JSON.stringify(c));
}

// ------------------------------------------------------------------ hostile model files

{
  const good = encodePlayerModel(noob);
  const throwsFormat = (label: string, bytes: Uint8Array) => {
    try {
      decodePlayerModel(bytes);
      check(label, false, 'accepted');
    } catch (e) {
      check(label, e instanceof ModelFormatError, String(e));
    }
  };
  throwsFormat('format: empty', new Uint8Array(0));
  throwsFormat('format: truncated', good.subarray(0, good.length >> 1));
  throwsFormat('format: random bytes', Uint8Array.from({ length: 5000 }, (_, i) => (i * 7919) & 255));
  // Header edits: counts, indices, joints, ranges.
  const edit = (fn: (h: Record<string, unknown>) => void): Uint8Array => {
    const view = new DataView(good.buffer, good.byteOffset);
    const len = view.getUint32(8, true);
    const h = JSON.parse(new TextDecoder().decode(good.subarray(12, 12 + len)));
    fn(h);
    const json = new TextEncoder().encode(JSON.stringify(h));
    const out = new Uint8Array(12 + json.length + (good.length - 12 - len));
    out.set(good.subarray(0, 12));
    new DataView(out.buffer).setUint32(8, json.length, true);
    out.set(json, 12);
    out.set(good.subarray(12 + len), 12 + json.length);
    return out;
  };
  throwsFormat('format: vertex count too large', edit((h) => (h.vertexCount = 10_000_000)));
  throwsFormat('format: vertex count mismatched', edit((h) => (h.vertexCount = (h.vertexCount as number) - 1)));
  throwsFormat('format: geometry range outside the file', edit((h) => ((h.geometry as { length: number }).length = 1e9)));
  throwsFormat('format: texture outside the file', edit((h) => ((h.textures as { offset: number }[])[0].offset = 1e8)));
  throwsFormat('format: bad mime', edit((h) => ((h.textures as { mime: string }[])[0].mime = 'text/html')));
  throwsFormat('format: group outside the indices', edit((h) => ((h.groups as { count: number }[])[0].count = 1e7)));
  throwsFormat('format: material texture out of range', edit((h) => ((h.materials as { texture: number }[])[0].texture = 99)));
  throwsFormat('format: pivot far away', edit((h) => ((h.rig as { pivots: number[][] }).pivots[0] = [1e9, 0, 0])));
  throwsFormat('format: header not JSON', (() => {
    const b = good.slice();
    b[12] = 0x7b;
    b[13] = 0x7b;
    return b;
  })());
  // A geometry block that inflates to far more than it claims stops early.
  {
    const t0 = performance.now();
    const view = new DataView(good.buffer, good.byteOffset);
    const len = view.getUint32(8, true);
    const h = JSON.parse(new TextDecoder().decode(good.subarray(12, 12 + len)));
    const bomb = deflateSync(new Uint8Array(64 * 1024 * 1024));
    h.geometry.length = bomb.length;
    h.textures = [];
    h.materials = [{ color: [255, 255, 255, 255], texture: -1, alpha: 0 }];
    h.groups = [{ start: 0, count: 3, material: 0 }];
    const json = new TextEncoder().encode(JSON.stringify(h));
    const out = new Uint8Array(12 + json.length + bomb.length);
    out.set(good.subarray(0, 12));
    new DataView(out.buffer).setUint32(8, json.length, true);
    out.set(json, 12);
    out.set(bomb, 12 + json.length);
    throwsFormat('format: deflate bomb refused', out);
    check('format: deflate bomb is cheap', performance.now() - t0 < 3000, `${performance.now() - t0} ms`);
  }
  // Bit flips anywhere never escape as anything but a format error.
  let odd = 0;
  for (let i = 0; i < 300; i++) {
    const b = good.slice();
    const at = 12 + ((i * 2654435761) >>> 0) % (b.length - 12);
    b[at] ^= 1 << (i % 8);
    try {
      decodePlayerModel(b);
    } catch (e) {
      if (!(e instanceof ModelFormatError)) odd++;
    }
  }
  check('format: bit flips fail cleanly', odd === 0, `${odd}`);
}

// ------------------------------------------------------------------ Turn Around

{
  const t = turnAround(noob);
  checkRig('noob turned around', t);
  const back = turnAround(t);
  let same = back.positions.every((v, i) => Math.abs(v - noob.positions[i]) < 1e-6) && back.joints.every((j, i) => j === noob.joints[i]);
  same &&= JSON.stringify(back.rig.pivots) === JSON.stringify(noob.rig.pivots.map((p) => p.map((v) => (v === 0 ? 0 : v))));
  check('turn around twice: the same model', same);
  // The noob's face (front) is on -Z after turning: the head's front vertices moved behind.
  const zMax = (m: PlayerModelData) => {
    let z = -Infinity;
    for (let i = 0; i < m.positions.length; i += 3) if (m.positions[i + 1] > 1.5) z = Math.max(z, m.positions[i + 2]);
    return z;
  };
  check('turn around: front and back swap', Math.abs(zMax(t) - -Math.min(...[...noob.positions].filter((_, i) => i % 3 === 2 && noob.positions[i - 1] > 1.5))) < 1e-5);
  const bytes = encodePlayerModel(t);
  check('turn around: still a valid file', decodePlayerModel(bytes).indices.length === noob.indices.length);
}

// ------------------------------------------------------------------ registry

{
  const reg = new PlayerModelRegistry();
  const bytes = new Uint8Array(readFileSync(join(modelsDir, 'roblox_noob/model.mcpm')));
  const key = reg.putData(bytes);
  check('registry: data key by hash', key === `data:${modelHash(bytes)}` && reg.has(key));
  const player = { username: 'Bob' };
  reg.setRemote('Bob', key);
  check('registry: remote model', reg.keyFor(player) === key && reg.dataFor(key) !== null);
  let released = '';
  reg.releaseListeners.push((k) => (released = k));
  reg.setRemote('Bob', 'steve');
  check('registry: unused data released', released === key && !reg.has(key));
  let threw = false;
  try {
    reg.putData(bytes.subarray(0, 100));
  } catch {
    threw = true;
  }
  check('registry: bad data refused', threw);
}

void PART_LEFT_ARM;
report();
