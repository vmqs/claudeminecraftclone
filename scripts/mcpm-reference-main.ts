/** Body of scripts/mcpm-reference.mjs (bundled with rolldown). */
import { deflateSync, inflateSync } from 'fflate';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { constants as zlibConstants, deflateRawSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { decodePlayerModel, encodePlayerModel, ModelFormatError, type PlayerModelData } from '../src/client/model/PlayerModelFormat';

/* eslint-disable @typescript-eslint/no-explicit-any */
const out = process.argv[2];

/** FNV-1a (32 bit) over bytes. */
function fnv(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
const f32 = (a: Float32Array) => fnv(new Uint8Array(Float32Array.from(a).buffer));
const u32 = (a: ArrayLike<number>) => fnv(new Uint8Array(Uint32Array.from(a).buffer));
const i8 = (a: Int8Array) => fnv(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));

function summary(m: PlayerModelData) {
  return {
    name: m.name,
    credits: m.credits,
    vertexCount: m.positions.length / 3,
    indexCount: m.indices.length,
    positions: f32(m.positions),
    uvs: f32(m.uvs),
    normals: i8(m.normals),
    joints: fnv(m.joints),
    weights: fnv(m.weights),
    indices: u32(m.indices),
    firstPositions: Array.from(m.positions.subarray(0, 9)),
    groups: m.groups,
    materials: m.materials,
    textures: m.textures.map((t) => ({ mime: t.mime, length: t.bytes.length, hash: fnv(t.bytes) })),
    rig: m.rig,
  };
}

const index = JSON.parse(readFileSync('public/models/index.json', 'utf8')) as { models: { id: string; file: string }[] };
const models = index.models.map((info) => ({ id: info.id, ...summary(decodePlayerModel(new Uint8Array(readFileSync(join('public/models', info.file))))) }));

// ---- damaged and unusual files, from a tiny model (a quad with the Noob's rig)
const rig = decodePlayerModel(new Uint8Array(readFileSync('public/models/roblox_noob/model.mcpm'))).rig;
const noob: PlayerModelData = {
  name: 'Tiny',
  credits: 'test',
  positions: Float32Array.from([-0.3, 0, 0, 0.3, 0, 0, 0.3, 1.8, 0, -0.3, 1.8, 0.1]),
  normals: Int8Array.from([0, 0, 127, 0, 0, 127, 0, 0, 127, 0, 0, 127]),
  uvs: Float32Array.from([0, 1, 1, 1, 1, 0, 0, 0]),
  joints: Uint8Array.from([4, 0, 0, 0, 5, 0, 0, 0, 0, 1, 0, 0, 2, 3, 1, 0]),
  weights: Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 200, 55, 0, 0, 100, 100, 55, 0]),
  indices: Uint16Array.from([0, 1, 2, 0, 2, 3]),
  groups: [{ start: 0, count: 6, material: 0 }],
  materials: [{ color: [255, 200, 100, 255], texture: 0, alpha: 1 }],
  textures: [{ mime: 'image/png', bytes: Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]) }],
  rig,
};
const base = encodePlayerModel(noob);
const dv = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const headerLen = dv(base).getUint32(8, true);
const header = JSON.parse(new TextDecoder().decode(base.subarray(12, 12 + headerLen)));
const payload = base.subarray(12 + headerLen);
/** The file with another header text (and optionally another payload). */
function pack(text: string, body: Uint8Array = payload, version = 1): Uint8Array {
  const json = new TextEncoder().encode(text);
  const o = new Uint8Array(12 + json.length + body.length);
  const v = dv(o);
  v.setUint32(0, 0x4d50434d, true);
  v.setUint32(4, version, true);
  v.setUint32(8, json.length, true);
  o.set(json, 12);
  o.set(body, 12 + json.length);
  return o;
}
const edit = (f: (h: any) => void) => {
  const h = structuredClone(header);
  f(h);
  return pack(JSON.stringify(h));
};
/** The model's geometry replaced by deflated zeros of another size (same texture offsets). */
function geometryOf(size: number): Uint8Array {
  const g = deflateSync(new Uint8Array(size), { level: 9 });
  const h = structuredClone(header);
  const shift = g.length - h.geometry.length;
  h.geometry.length = g.length;
  for (const t of h.textures) t.offset += shift;
  const body = new Uint8Array(g.length + payload.length - header.geometry.length);
  body.set(g, 0);
  body.set(payload.subarray(header.geometry.length), g.length);
  return pack(JSON.stringify(h), body);
}
const tweak = (f: (m: PlayerModelData) => void) => {
  const m: PlayerModelData = { ...noob, joints: noob.joints.slice(), indices: noob.indices.slice(), weights: noob.weights.slice() };
  f(m);
  return encodePlayerModel(m);
};
// A valid model with more than 65536 vertices (32-bit indices; regular data, so it deflates small).
const wideVc = 65540;
const wide: PlayerModelData = {
  ...noob,
  positions: new Float32Array(wideVc * 3).map((_, i) => (i % 3 === 1 ? (Math.floor(i / 3) % 100) / 55 : 0.1)),
  normals: new Int8Array(wideVc * 3),
  uvs: new Float32Array(wideVc * 2),
  joints: new Uint8Array(wideVc * 4),
  weights: new Uint8Array(wideVc * 4).map((_, i) => (i % 4 === 0 ? 255 : 0)),
  indices: Uint32Array.from({ length: 30 }, (_, i) => (i * 2269) % wideVc),
  groups: [{ start: 0, count: 30, material: 0 }],
};
/** The model's geometry block replaced by other DEFLATE bytes (same texture offsets shifted). */
function withGeometry(g: Uint8Array): Uint8Array {
  const h = structuredClone(header);
  const shift = g.length - h.geometry.length;
  h.geometry.length = g.length;
  for (const t of h.textures) t.offset += shift;
  const body = new Uint8Array(g.length + payload.length - header.geometry.length);
  body.set(g, 0);
  body.set(payload.subarray(header.geometry.length), g.length);
  return pack(JSON.stringify(h), body);
}
const rawGeometry = inflateSync(payload.subarray(header.geometry.offset, header.geometry.offset + header.geometry.length));
/** A header with an extra field holding `depth` nested arrays (within the 256 KB header limit). */
function deepHeader(depth: number): Uint8Array {
  const h = JSON.stringify(header);
  return pack(h.slice(0, -1) + ',"deep":' + '['.repeat(depth) + ']'.repeat(depth) + '}');
}
const text = new TextDecoder().decode(base.subarray(12, 12 + headerLen));
const cases: [string, Uint8Array][] = [
  ['the tiny model as it is', base],
  ['not a model file', new TextEncoder().encode('hello, world! this is not a model')],
  ['version 2', pack(text, payload, 2)],
  ['header length past the end', (() => { const b = base.slice(); dv(b).setUint32(8, b.length, true); return b; })()],
  ['header length over 256 KB', (() => { const b = base.slice(); dv(b).setUint32(8, 0xfffffff0, true); return b; })()],
  ['header not JSON', pack('{nope')],
  ['header with single quotes', pack("{'vertexCount': 3}")],
  ['header with text after the JSON', pack(text + ' x')],
  ['header not UTF-8', pack('{"name": "\udcff"}'.replace('\udcff', 'ÿ')).map((b, i, a) => (i === 22 && a[i] === 0xc3 ? 0xff : b))],
  ['header is an array', pack('[1, 2, 3]')],
  ['header is a number', pack('42')],
  ['an integer written as 4.0', pack(text.replace(`"vertexCount":${header.vertexCount}`, `"vertexCount":${header.vertexCount}.0`))],
  ['unknown header fields', edit((h) => { h.future = { a: [1, 2] }; })],
  ['vertex count over the limit', edit((h) => { h.vertexCount = 400_001; })],
  ['vertex count as text', edit((h) => { h.vertexCount = String(h.vertexCount); })],
  ['fractional vertex count', edit((h) => { h.vertexCount += 0.5; })],
  ['index count not a multiple of 3', edit((h) => { h.indexCount -= 1; })],
  ['16-bit indices with 65537 vertices', edit((h) => { h.vertexCount = 65537; })],
  ['five bounds', edit((h) => { h.bounds = h.bounds.slice(0, 5); })],
  ['bounds out of range', edit((h) => { h.bounds[0] = -9; })],
  ['geometry size off by 4', edit((h) => { h.geometry.size += 4; })],
  ['geometry offset past the payload', edit((h) => { h.geometry.offset = payload.length + 1; })],
  ['geometry length past the payload', edit((h) => { h.geometry.length = payload.length + 1; })],
  ['geometry inflates short', geometryOf(header.geometry.size - 10)],
  ['geometry inflates long (bomb guard)', geometryOf(header.geometry.size + 4096)],
  ['geometry not deflate data', (() => { const h = structuredClone(header); const body = payload.slice(); body.fill(0xff, 0, 16); return pack(JSON.stringify(h), body); })()],
  ['joint 6', tweak((m) => { m.joints[5] = 6; })],
  ['index past the vertices', tweak((m) => { m.indices[4] = m.positions.length / 3; })],
  ['no materials', edit((h) => { h.materials = []; })],
  ['17 textures', edit((h) => { h.textures = Array(17).fill(h.textures[0]); })],
  ['GIF texture', edit((h) => { h.textures[0].mime = 'image/gif'; })],
  ['texture past the payload', edit((h) => { h.textures[0].length = payload.length; })],
  ['empty texture', edit((h) => { h.textures[0].length = 0; })],
  ['material texture out of range', edit((h) => { h.materials[0].texture = h.textures.length; })],
  ['colour 256', edit((h) => { h.materials[0].color[1] = 256; })],
  ['alpha mode 3', edit((h) => { h.materials[0].alpha = 3; })],
  ['no groups', edit((h) => { h.groups = []; })],
  ['group starting mid-triangle', edit((h) => { h.groups[0].start = 1; h.groups[0].count -= 3; })],
  ['group past the indices', edit((h) => { h.groups[0].count += 3; })],
  ['group material out of range', edit((h) => { h.groups[0].material = h.materials.length; })],
  ['five pivots', edit((h) => { h.rig.pivots = h.rig.pivots.slice(0, 5); })],
  ['pivot out of range', edit((h) => { h.rig.pivots[2][0] = 5; })],
  ['one hand', edit((h) => { h.rig.hands = [h.rig.hands[0]]; })],
  ['head size 0', edit((h) => { h.rig.headSize = 0; })],
  ['no rig', edit((h) => { delete h.rig; })],
  ['name with control characters and a section sign', edit((h) => { h.name = 'Bad\u0001 §cName\u007f that is far too long for the forty-eight character limit'; })],
  ['32-bit indices', encodePlayerModel(wide)],
  // Review round: a header nested deeper than a recursive parser's stack, a flushed but unfinished
  // geometry stream, names and credits that are not strings (String() in the web game).
  ['header nested 120,000 levels deep', deepHeader(120_000)],
  ['geometry flushed but not finished (Z_SYNC_FLUSH)', withGeometry(new Uint8Array(deflateRawSync(rawGeometry, { finishFlush: zlibConstants.Z_SYNC_FLUSH })))],
  ['geometry as a finished stream from another deflater', withGeometry(new Uint8Array(deflateRawSync(rawGeometry)))],
  ['name is an array', edit((h) => { h.name = ['Arr', 'Name']; })],
  ['name is an object', edit((h) => { h.name = { a: 1 }; })],
  ['name is true', edit((h) => { h.name = true; })],
  ['name is null', edit((h) => { h.name = null; })],
  ['name is 1e21', pack(text.replace('"name":"Tiny"', '"name":1e21'))],
  ['name is 12.50', pack(text.replace('"name":"Tiny"', '"name":12.50'))],
  ['name is 0.0000001', pack(text.replace('"name":"Tiny"', '"name":0.0000001'))],
  ['name is -0.000123', pack(text.replace('"name":"Tiny"', '"name":-0.000123'))],
  ['name is 123456789012345680000', pack(text.replace('"name":"Tiny"', '"name":123456789012345680000'))],
  ['credits are nested arrays with null', edit((h) => { h.credits = [[1, [2, null]], 'x', { b: 2 }, false]; })],
];
if (!text.includes('"name":"Tiny"')) throw new Error('header text changed: update the name cases');
/** The case's file as base64; big ones (the deep header) are stored raw-deflated. */
function file(bytes: Uint8Array): { base64: string; deflated?: true } {
  if (bytes.length <= 65536) return { base64: Buffer.from(bytes).toString('base64') };
  return { base64: Buffer.from(deflateSync(bytes, { level: 9 })).toString('base64'), deflated: true };
}
const out2 = cases.map(([name, bytes]) => {
  try {
    const m = decodePlayerModel(bytes);
    return { name, ...file(bytes), error: null, vertexCount: m.positions.length / 3, indices: u32(m.indices), positions: f32(m.positions), modelName: m.name, credits: m.credits };
  } catch (e) {
    if (!(e instanceof ModelFormatError)) throw e;
    return { name, ...file(bytes), error: e.message };
  }
});
// Numbers as String() prints them (a name or credits that is a number): random doubles of every
// magnitude by their bits, from a fixed seed.
let seed = 0x2545f491;
const rnd32 = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return seed >>> 0;
};
const numbers: [string, string][] = [];
const nv = new DataView(new ArrayBuffer(8));
while (numbers.length < 600) {
  nv.setUint32(0, rnd32());
  nv.setUint32(4, rnd32());
  // Every third one with few significant digits (short decimals, integers).
  if (numbers.length % 3 === 0) nv.setFloat64(0, ((rnd32() % 2_000_001) - 1_000_000) / 10 ** (rnd32() % 8));
  const x = nv.getFloat64(0);
  if (!Number.isFinite(x)) continue;
  numbers.push([nv.getBigUint64(0).toString(16).padStart(16, '0'), String(x)]);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ generator: 'scripts/mcpm-reference.mjs (the web game\'s decodePlayerModel)', models, cases: out2, numbers }, null, 1) + '\n');
console.log(`${out}: ${models.length} models, ${out2.length} cases (${out2.filter((c) => c.error).length} refused)`);
for (const c of out2) console.log(`  ${c.error ? 'refused: ' + c.error.padEnd(24) : 'ok'.padEnd(33)} ${c.name}`);
