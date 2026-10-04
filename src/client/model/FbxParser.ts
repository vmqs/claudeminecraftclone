import { unzlibSync } from 'fflate';
import {
  IMPORT_LIMITS,
  type M4,
  m4Identity,
  m4Invert,
  m4Mirrors,
  m4Mul,
  m4RotAxis,
  m4Scale,
  m4Translate,
  ModelImportError,
  type SourceBone,
  type SourceMaterial,
  type SourceMesh,
  type SourceScene,
  type SourceTexture,
  transformNormals,
  transformPoints,
  baseName,
} from './SourceScene';

/** A property value of an FBX node. Ids (int64) are kept as decimal strings. */
export type FbxProp = number | string | Uint8Array | ArrayLike<number>;

export interface FbxNode {
  name: string;
  props: FbxProp[];
  children: FbxNode[];
}

const BINARY_MAGIC = 'Kaydara FBX Binary  \0';

/** Whether the bytes look like an FBX file (binary or ASCII). */
export function isFbx(bytes: Uint8Array): boolean {
  if (bytes.length >= 23 && new TextDecoder('latin1').decode(bytes.subarray(0, 21)) === BINARY_MAGIC) return true;
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 4096)));
  return /FBXHeaderExtension\s*:/.test(head) || /^\s*;\s*FBX/m.test(head);
}

// ------------------------------------------------------------------ binary reader

class BinaryReader {
  private readonly view: DataView;
  pos = 0;
  nodes = 0;
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  need(n: number): void {
    if (n < 0 || this.pos + n > this.bytes.length) throw new ModelImportError('The FBX file is truncated or damaged.');
  }
  u8(): number {
    this.need(1);
    return this.bytes[this.pos++];
  }
  u32(): number {
    this.need(4);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  u64(): number {
    this.need(8);
    const v = this.view.getBigUint64(this.pos, true);
    this.pos += 8;
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new ModelImportError('The FBX file is damaged.');
    return Number(v);
  }
  i64String(): string {
    this.need(8);
    const v = this.view.getBigInt64(this.pos, true);
    this.pos += 8;
    return v.toString();
  }
  slice(n: number): Uint8Array {
    this.need(n);
    const s = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return s;
  }
  getView(): DataView {
    return this.view;
  }
}

function readArray(r: BinaryReader, type: string): ArrayLike<number> {
  const count = r.u32();
  const encoding = r.u32();
  const compressed = r.u32();
  const size = type === 'd' || type === 'l' ? 8 : type === 'b' ? 1 : 4;
  if (count * size > 512 * 1024 * 1024) throw new ModelImportError('The FBX file has an array that is too large.');
  let data = r.slice(compressed);
  if (encoding === 1) {
    try {
      data = unzlibSync(data, { out: new Uint8Array(count * size) });
    } catch {
      throw new ModelImportError('The FBX file has damaged compressed data.');
    }
  } else if (encoding !== 0) {
    throw new ModelImportError('The FBX file uses an unknown array encoding.');
  }
  if (data.length < count * size) throw new ModelImportError('The FBX file is damaged (short array).');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  switch (type) {
    case 'f': {
      const out = new Float32Array(count);
      for (let i = 0; i < count; i++) out[i] = view.getFloat32(i * 4, true);
      return out;
    }
    case 'd': {
      const out = new Float64Array(count);
      for (let i = 0; i < count; i++) out[i] = view.getFloat64(i * 8, true);
      return out;
    }
    case 'i': {
      const out = new Int32Array(count);
      for (let i = 0; i < count; i++) out[i] = view.getInt32(i * 4, true);
      return out;
    }
    case 'l': {
      const out = new Float64Array(count);
      for (let i = 0; i < count; i++) out[i] = Number(view.getBigInt64(i * 8, true));
      return out;
    }
    default: {
      const out = new Uint8Array(count);
      out.set(data.subarray(0, count));
      return out;
    }
  }
}

function readProp(r: BinaryReader): FbxProp {
  const type = String.fromCharCode(r.u8());
  const view = r.getView();
  switch (type) {
    case 'Y': {
      r.need(2);
      const v = view.getInt16(r.pos, true);
      r.pos += 2;
      return v;
    }
    case 'C':
      return r.u8();
    case 'I': {
      r.need(4);
      const v = view.getInt32(r.pos, true);
      r.pos += 4;
      return v;
    }
    case 'F': {
      r.need(4);
      const v = view.getFloat32(r.pos, true);
      r.pos += 4;
      return v;
    }
    case 'D': {
      r.need(8);
      const v = view.getFloat64(r.pos, true);
      r.pos += 8;
      return v;
    }
    case 'L':
      return r.i64String();
    case 'S':
      return new TextDecoder('utf-8').decode(r.slice(r.u32()));
    case 'R':
      return r.slice(r.u32());
    case 'f':
    case 'd':
    case 'i':
    case 'l':
    case 'b':
      return readArray(r, type);
    default:
      throw new ModelImportError(`The FBX file has an unknown property type "${type}".`);
  }
}

function readBinaryNode(r: BinaryReader, wide: boolean, depth: number): FbxNode | null {
  const end = wide ? r.u64() : r.u32();
  const numProps = wide ? r.u64() : r.u32();
  if (wide) r.u64();
  else r.u32();
  const nameLen = r.u8();
  if (end === 0) return null;
  if (end > r.bytes.length || end < r.pos) throw new ModelImportError('The FBX file is damaged (node size).');
  if (depth > 64) throw new ModelImportError('The FBX file nests too deeply.');
  if (++r.nodes > IMPORT_LIMITS.maxNodes * 8) throw new ModelImportError('The FBX file has too many nodes.');
  const name = new TextDecoder('latin1').decode(r.slice(nameLen));
  const props: FbxProp[] = [];
  for (let i = 0; i < numProps; i++) props.push(readProp(r));
  const children: FbxNode[] = [];
  while (r.pos < end) {
    const child = readBinaryNode(r, wide, depth + 1);
    if (!child) break;
    children.push(child);
  }
  r.pos = end;
  return { name, props, children };
}

function parseBinary(bytes: Uint8Array): FbxNode[] {
  const r = new BinaryReader(bytes);
  r.pos = 23;
  const version = r.u32();
  const wide = version >= 7500;
  const nodes: FbxNode[] = [];
  while (r.pos < bytes.length - 13) {
    const n = readBinaryNode(r, wide, 0);
    if (!n) break;
    nodes.push(n);
  }
  return nodes;
}

// ------------------------------------------------------------------ ASCII reader

interface Tok {
  t: 'name' | 'str' | 'num' | 'word' | '{' | '}' | ',';
  v: string;
}

function tokenizeAscii(text: string): Tok[] {
  const toks: Tok[] = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text.charCodeAt(i);
    if (c <= 32) {
      i++;
    } else if (c === 59) {
      // ; comment
      while (i < n && text.charCodeAt(i) !== 10) i++;
    } else if (c === 34) {
      const end = text.indexOf('"', i + 1);
      if (end < 0) throw new ModelImportError('The FBX file has an unterminated string.');
      toks.push({ t: 'str', v: text.slice(i + 1, end) });
      i = end + 1;
    } else if (c === 123 || c === 125 || c === 44) {
      toks.push({ t: text[i] as '{' | '}' | ',', v: text[i] });
      i++;
    } else {
      let j = i;
      while (j < n) {
        const d = text.charCodeAt(j);
        if (d <= 32 || d === 44 || d === 123 || d === 125 || d === 34 || d === 59) break;
        if (d === 58) break; // ':'
        j++;
      }
      const word = text.slice(i, j);
      if (j < n && text.charCodeAt(j) === 58) {
        toks.push({ t: 'name', v: word });
        j++;
      } else if (/^[-+]?(\d|\.\d)/.test(word) || /^[-+]?(nan|inf)/i.test(word)) {
        toks.push({ t: 'num', v: word });
      } else {
        toks.push({ t: 'word', v: word });
      }
      if (j === i) j++;
      i = j;
    }
    if (toks.length > 80_000_000) throw new ModelImportError('The FBX file is too large.');
  }
  return toks;
}

function parseAscii(bytes: Uint8Array): FbxNode[] {
  const toks = tokenizeAscii(new TextDecoder('utf-8').decode(bytes));
  let p = 0;
  let count = 0;
  const parseNode = (depth: number): FbxNode => {
    if (depth > 64) throw new ModelImportError('The FBX file nests too deeply.');
    if (++count > IMPORT_LIMITS.maxNodes * 8) throw new ModelImportError('The FBX file has too many nodes.');
    const name = toks[p++].v;
    const props: FbxProp[] = [];
    let arrayMarker = false;
    while (p < toks.length) {
      const t = toks[p];
      if (t.t === 'str') props.push(t.v);
      else if (t.t === 'num') props.push(Number(t.v));
      else if (t.t === 'word') {
        if (t.v.startsWith('*')) arrayMarker = true;
        props.push(t.v);
      } else break;
      p++;
      if (p < toks.length && toks[p].t === ',') p++;
      else break;
    }
    const children: FbxNode[] = [];
    if (p < toks.length && toks[p].t === '{') {
      p++;
      while (p < toks.length && toks[p].t !== '}') {
        if (toks[p].t === 'name') children.push(parseNode(depth + 1));
        else p++;
      }
      p++;
    }
    if (arrayMarker) {
      const a = children.find((ch) => ch.name === 'a');
      const nums = a ? a.props.map((v) => (typeof v === 'number' ? v : Number(v))) : [];
      return { name, props: [Float64Array.from(nums)], children: [] };
    }
    return { name, props, children };
  };
  const nodes: FbxNode[] = [];
  while (p < toks.length) {
    if (toks[p].t === 'name') nodes.push(parseNode(0));
    else p++;
  }
  return nodes;
}

/** Parses an FBX file into its node tree. */
export function parseFbxTree(bytes: Uint8Array): FbxNode[] {
  if (bytes.length >= 27 && new TextDecoder('latin1').decode(bytes.subarray(0, 21)) === BINARY_MAGIC) return parseBinary(bytes);
  return parseAscii(bytes);
}

// ------------------------------------------------------------------ scene

function child(n: FbxNode | undefined, name: string): FbxNode | undefined {
  return n?.children.find((c) => c.name === name);
}

function numArray(n: FbxNode | undefined): ArrayLike<number> {
  if (!n || n.props.length === 0) return [];
  const p = n.props[0];
  if (typeof p === 'object' && p !== null && 'length' in p && typeof p !== 'string') return p as ArrayLike<number>;
  return n.props.map((v) => Number(v));
}

function str(n: FbxNode | undefined, i = 0): string {
  const v = n?.props[i];
  return typeof v === 'string' ? v : v === undefined ? '' : String(v);
}

/** "Name\0\1Class" (binary) or "Class::Name" (ASCII) -> Name. */
function objectName(raw: string): string {
  const bin = raw.indexOf('\u0000\u0001');
  if (bin >= 0) return raw.slice(0, bin);
  const colon = raw.indexOf('::');
  return colon >= 0 ? raw.slice(colon + 2) : raw;
}

interface FbxObject {
  id: string;
  kind: string;
  name: string;
  sub: string;
  node: FbxNode;
}

/** The Properties70 (or Properties60) values by name. */
function properties(n: FbxNode): Map<string, FbxProp[]> {
  const out = new Map<string, FbxProp[]>();
  const p = child(n, 'Properties70') ?? child(n, 'Properties60');
  if (!p) return out;
  for (const c of p.children) {
    if (c.name !== 'P' && c.name !== 'Property') continue;
    const key = str(c, 0);
    // P: name, type, label, flags, values... (Properties60: name, type, flags, values...)
    out.set(key, c.props.slice(c.name === 'P' ? 4 : 3));
  }
  return out;
}

function vec3(props: Map<string, FbxProp[]>, key: string, def: number): [number, number, number] {
  const v = props.get(key);
  if (!v || v.length < 3) return [def, def, def];
  return [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0];
}

/** Euler rotation in degrees for the FBX rotation order (0 XYZ ... 5 ZYX), X applied first for XYZ. */
function eulerMatrix(r: [number, number, number], order: number): M4 {
  const rx = m4RotAxis(0, r[0]);
  const ry = m4RotAxis(1, r[1]);
  const rz = m4RotAxis(2, r[2]);
  switch (order) {
    case 1: // XZY
      return m4Mul(ry, m4Mul(rz, rx));
    case 2: // YZX
      return m4Mul(rx, m4Mul(rz, ry));
    case 3: // YXZ
      return m4Mul(rz, m4Mul(rx, ry));
    case 4: // ZXY
      return m4Mul(ry, m4Mul(rx, rz));
    case 5: // ZYX
      return m4Mul(rx, m4Mul(ry, rz));
    default: // XYZ
      return m4Mul(rz, m4Mul(ry, rx));
  }
}

function isZero(v: [number, number, number], d = 0): boolean {
  return v[0] === d && v[1] === d && v[2] === d;
}

/** The local matrix of a Model: T * Roff * Rp * Rpre * R * Rpost^-1 * Rp^-1 * Soff * Sp * S * Sp^-1. */
function localMatrix(props: Map<string, FbxProp[]>): M4 {
  const t = vec3(props, 'Lcl Translation', 0);
  const r = vec3(props, 'Lcl Rotation', 0);
  const s = vec3(props, 'Lcl Scaling', 1);
  const order = Number(props.get('RotationOrder')?.[0] ?? 0) || 0;
  const pre = vec3(props, 'PreRotation', 0);
  const post = vec3(props, 'PostRotation', 0);
  const roff = vec3(props, 'RotationOffset', 0);
  const rp = vec3(props, 'RotationPivot', 0);
  const soff = vec3(props, 'ScalingOffset', 0);
  const sp = vec3(props, 'ScalingPivot', 0);
  let m = m4Translate(t[0], t[1], t[2]);
  if (!isZero(roff)) m = m4Mul(m, m4Translate(roff[0], roff[1], roff[2]));
  if (!isZero(rp)) m = m4Mul(m, m4Translate(rp[0], rp[1], rp[2]));
  if (!isZero(pre)) m = m4Mul(m, eulerMatrix(pre, 0));
  if (!isZero(r)) m = m4Mul(m, eulerMatrix(r, order));
  if (!isZero(post)) m = m4Mul(m, m4Invert(eulerMatrix(post, 0)) ?? m4Identity());
  if (!isZero(rp)) m = m4Mul(m, m4Translate(-rp[0], -rp[1], -rp[2]));
  if (!isZero(soff)) m = m4Mul(m, m4Translate(soff[0], soff[1], soff[2]));
  if (!isZero(sp)) m = m4Mul(m, m4Translate(sp[0], sp[1], sp[2]));
  if (!isZero(s, 1)) m = m4Mul(m, m4Scale(s[0], s[1], s[2]));
  if (!isZero(sp)) m = m4Mul(m, m4Translate(-sp[0], -sp[1], -sp[2]));
  return m;
}

function geometricMatrix(props: Map<string, FbxProp[]>): M4 {
  const t = vec3(props, 'GeometricTranslation', 0);
  const r = vec3(props, 'GeometricRotation', 0);
  const s = vec3(props, 'GeometricScaling', 1);
  let m = m4Translate(t[0], t[1], t[2]);
  if (!isZero(r)) m = m4Mul(m, eulerMatrix(r, 0));
  if (!isZero(s, 1)) m = m4Mul(m, m4Scale(s[0], s[1], s[2]));
  return m;
}

function matrixFrom(n: FbxNode | undefined): M4 | null {
  const a = numArray(n);
  if (a.length !== 16) return null;
  const m = new Float64Array(16);
  for (let i = 0; i < 16; i++) m[i] = Number(a[i]);
  return m;
}

/** Decodes a base64 string (ASCII FBX embeds video content that way). */
function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const table = new Int16Array(128).fill(-1);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < 64; i++) table[alphabet.charCodeAt(i)] = i;
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i + 1 < clean.length; i += 4) {
    const a = table[clean.charCodeAt(i)];
    const b = table[clean.charCodeAt(i + 1)];
    const c = i + 2 < clean.length ? table[clean.charCodeAt(i + 2)] : -1;
    const d = i + 3 < clean.length ? table[clean.charCodeAt(i + 3)] : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}

/**
 * Reads an FBX file (binary 6.1-7.7 or ASCII 7.x) into a SourceScene: every mesh in its bind
 * pose, materials with their diffuse textures (embedded video content or file names), and the
 * skeleton of skinned meshes (cluster links with their bind positions and weights).
 */
export function parseFbx(bytes: Uint8Array): SourceScene {
  const roots = parseFbxTree(bytes);
  const objectsNode = roots.find((n) => n.name === 'Objects');
  if (!objectsNode) throw new ModelImportError('This FBX file has no objects.');
  const objects = new Map<string, FbxObject>();
  for (const n of objectsNode.children) {
    let id: string;
    let rawName: string;
    let sub: string;
    if (typeof n.props[0] === 'string' && n.props.length <= 2 && !/^-?\d+$/.test(n.props[0])) {
      // FBX 6: no ids, the name is the id.
      id = n.props[0];
      rawName = n.props[0];
      sub = str(n, 1);
    } else {
      id = str(n, 0);
      rawName = str(n, 1);
      sub = str(n, 2);
    }
    objects.set(id, { id, kind: n.name, name: objectName(rawName), sub, node: n });
  }
  const childrenOf = new Map<string, { id: string; prop: string }[]>();
  const parentsOf = new Map<string, { id: string; prop: string }[]>();
  const conns = roots.find((n) => n.name === 'Connections');
  for (const c of conns?.children ?? []) {
    if (c.name !== 'C' && c.name !== 'Connect') continue;
    const childId = str(c, 1);
    const parentId = str(c, 2);
    const prop = str(c, 3);
    if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
    childrenOf.get(parentId)!.push({ id: childId, prop });
    if (!parentsOf.has(childId)) parentsOf.set(childId, []);
    parentsOf.get(childId)!.push({ id: parentId, prop });
  }
  const childObjects = (id: string, kind?: string): FbxObject[] =>
    (childrenOf.get(id) ?? []).map((c) => objects.get(c.id)).filter((o): o is FbxObject => !!o && (!kind || o.kind === kind));

  // Global settings: up axis.
  const settings = roots.find((n) => n.name === 'GlobalSettings');
  const gprops = settings ? properties(settings) : new Map<string, FbxProp[]>();
  const upAxisIdx = Number(gprops.get('UpAxis')?.[0] ?? 1);
  const upSign = Number(gprops.get('UpAxisSign')?.[0] ?? 1) || 1;
  const frontIdx = Number(gprops.get('FrontAxis')?.[0] ?? 2);
  const frontSign = Number(gprops.get('FrontAxisSign')?.[0] ?? 1) || 1;

  // Model transforms.
  const worldCache = new Map<string, M4>();
  const modelParent = (id: string): string | null => {
    for (const p of parentsOf.get(id) ?? []) {
      const o = objects.get(p.id);
      if (o && o.kind === 'Model') return o.id;
    }
    return null;
  };
  const worldOf = (id: string, depth = 0): M4 => {
    const cached = worldCache.get(id);
    if (cached) return cached;
    const o = objects.get(id);
    if (!o || depth > 256) return m4Identity();
    const local = localMatrix(properties(o.node));
    const parent = modelParent(id);
    const w = parent ? m4Mul(worldOf(parent, depth + 1), local) : local;
    worldCache.set(id, w);
    return w;
  };

  // Bind pose matrices (Pose "BindPose").
  const bindPose = new Map<string, M4>();
  for (const o of objects.values()) {
    if (o.kind !== 'Pose') continue;
    for (const pn of o.node.children) {
      if (pn.name !== 'PoseNode') continue;
      const nodeId = str(child(pn, 'Node'));
      const m = matrixFrom(child(pn, 'Matrix'));
      if (nodeId && m) bindPose.set(nodeId, m);
    }
  }

  const scene: SourceScene = { meshes: [], materials: [], textures: [], bones: [], upAxis: null, frontHint: null, info: [] };
  scene.upAxis = upAxisIdx === 0 ? 'x' : upAxisIdx === 2 ? 'z' : 'y';
  const front: [number, number, number] = [0, 0, 0];
  front[Math.min(2, Math.max(0, frontIdx))] = frontSign;
  scene.frontHint = front;
  void upSign;

  // Textures and materials.
  const textureIndex = new Map<string, number>();
  const textureFor = (texId: string): number => {
    const known = textureIndex.get(texId);
    if (known !== undefined) return known;
    const t = objects.get(texId);
    if (!t) return -1;
    const file = str(child(t.node, 'RelativeFilename')) || str(child(t.node, 'FileName')) || t.name;
    let content: Uint8Array | null = null;
    for (const v of childObjects(texId, 'Video')) {
      const c = child(v.node, 'Content');
      const p = c?.props[0];
      if (p instanceof Uint8Array && p.length > 0) content = p;
      else if (typeof p === 'string' && p.length > 0) content = fromBase64(c!.props.map(String).join(''));
      if (content) break;
    }
    const tex: SourceTexture = { name: baseName(file), bytes: content };
    const idx = scene.textures.push(tex) - 1;
    textureIndex.set(texId, idx);
    return idx;
  };
  const materialIndex = new Map<string, number>();
  const materialFor = (matId: string): number => {
    const known = materialIndex.get(matId);
    if (known !== undefined) return known;
    const o = objects.get(matId)!;
    const props = properties(o.node);
    const diffuse = props.has('DiffuseColor') ? vec3(props, 'DiffuseColor', 1) : props.has('Diffuse') ? vec3(props, 'Diffuse', 1) : [1, 1, 1];
    const opacity = props.has('Opacity') ? Number(props.get('Opacity')![0]) : props.has('TransparencyFactor') ? 1 - Number(props.get('TransparencyFactor')![0]) : 1;
    let texture = -1;
    const links = childrenOf.get(matId) ?? [];
    const order = (prop: string): number => {
      const p = prop.toLowerCase();
      if (p === 'diffusecolor' || p.includes('basecolor') || p.includes('base_color') || p === 'diffuse') return 0;
      if (p.includes('normal') || p.includes('bump') || p.includes('specular') || p.includes('rough') || p.includes('metal') || p.includes('emissive') || p.includes('reflect')) return 9;
      return 5;
    };
    const texLinks = links.filter((l) => objects.get(l.id)?.kind === 'Texture').sort((a, b) => order(a.prop) - order(b.prop));
    if (texLinks.length > 0 && order(texLinks[0].prop) < 9) texture = textureFor(texLinks[0].id);
    const mat: SourceMaterial = {
      name: o.name,
      color: texture >= 0 ? [1, 1, 1, opacity] : [diffuse[0], diffuse[1], diffuse[2], opacity],
      texture,
      alpha: opacity < 0.99 ? 'blend' : 'opaque',
    };
    const idx = scene.materials.push(mat) - 1;
    materialIndex.set(matId, idx);
    return idx;
  };

  // Bones: every model linked from a cluster, plus their model ancestors.
  const boneIndex = new Map<string, number>();
  const clusterLinkBind = new Map<string, M4>();
  const addBone = (id: string, depth = 0): number => {
    const known = boneIndex.get(id);
    if (known !== undefined) return known;
    const o = objects.get(id);
    if (!o || depth > 256) return -1;
    const parentId = modelParent(id);
    const parent = parentId ? addBone(parentId, depth + 1) : -1;
    const m = clusterLinkBind.get(id) ?? bindPose.get(id) ?? worldOf(id);
    const bone: SourceBone = { name: o.name, parent, position: [m[12], m[13], m[14]] };
    const idx = scene.bones.push(bone) - 1;
    boneIndex.set(id, idx);
    return idx;
  };

  // Bind matrices of every cluster's bone first, so parents read theirs too.
  for (const o of objects.values()) {
    if (o.kind !== 'Deformer' || o.sub !== 'Cluster') continue;
    const link = (childrenOf.get(o.id) ?? []).map((c) => objects.get(c.id)).find((l) => l?.kind === 'Model');
    const tl = matrixFrom(child(o.node, 'TransformLink'));
    if (link && tl) clusterLinkBind.set(link.id, tl);
  }

  let totalVerts = 0;
  for (const geo of objects.values()) {
    if (geo.kind !== 'Geometry' && !(geo.kind === 'Model' && child(geo.node, 'Vertices'))) continue;
    if (geo.kind === 'Geometry' && geo.sub && geo.sub !== 'Mesh') continue;
    const verts = numArray(child(geo.node, 'Vertices'));
    const polys = numArray(child(geo.node, 'PolygonVertexIndex'));
    if (verts.length < 9 || polys.length < 3) continue;
    totalVerts += verts.length / 3;
    if (totalVerts > IMPORT_LIMITS.maxVertices) throw new ModelImportError('The model has too many vertices.');
    // The model this geometry belongs to.
    const model = geo.kind === 'Model' ? geo : (parentsOf.get(geo.id) ?? []).map((p) => objects.get(p.id)).find((o) => o?.kind === 'Model');
    if (!model) continue;
    const mprops = properties(model.node);
    const geoMatrix = geometricMatrix(mprops);

    // Skin clusters.
    const cpCount = Math.floor(verts.length / 3);
    const cpWeights: { bone: number; w: number }[][] | null = [];
    let skinned = false;
    for (const skin of childObjects(geo.id, 'Deformer')) {
      if (skin.sub !== 'Skin') continue;
      for (const cluster of childObjects(skin.id, 'Deformer')) {
        if (cluster.sub !== 'Cluster') continue;
        const link = (childrenOf.get(cluster.id) ?? []).map((c) => objects.get(c.id)).find((o) => o?.kind === 'Model');
        if (!link) continue;
        const bone = addBone(link.id);
        const idx = numArray(child(cluster.node, 'Indexes'));
        const w = numArray(child(cluster.node, 'Weights'));
        for (let i = 0; i < idx.length && i < w.length; i++) {
          const cp = idx[i];
          if (cp < 0 || cp >= cpCount || !(w[i] > 0)) continue;
          (cpWeights[cp] ??= []).push({ bone, w: w[i] });
          skinned = true;
        }
      }
    }
    // The mesh's world matrix at bind time: its BindPose entry, else its node transform. (The
    // clusters' Transform is not used: Blender writes it relative to the bone, other exporters as
    // the mesh's global matrix.)
    const world = m4Mul(bindPose.get(model.id) ?? worldOf(model.id), geoMatrix);

    // Layer elements.
    const normalEl = child(geo.node, 'LayerElementNormal');
    const uvEl = child(geo.node, 'LayerElementUV');
    const matEl = child(geo.node, 'LayerElementMaterial');
    const mapping = (el: FbxNode | undefined) => str(child(el, 'MappingInformationType'));
    const reference = (el: FbxNode | undefined) => str(child(el, 'ReferenceInformationType'));
    const normals = numArray(child(normalEl, 'Normals'));
    const normalIdx = numArray(child(normalEl, 'NormalsIndex') ?? child(normalEl, 'NormalIndex'));
    const uvs = numArray(child(uvEl, 'UV'));
    const uvIdx = numArray(child(uvEl, 'UVIndex'));
    const matIds = numArray(child(matEl, 'Materials'));
    const matMapping = mapping(matEl);
    const attrIndex = (el: FbxNode | undefined, index: ArrayLike<number>, cp: number, corner: number, poly: number): number => {
      const m = mapping(el);
      let i: number;
      if (m === 'ByPolygonVertex') i = corner;
      else if (m === 'ByPolygon') i = poly;
      else if (m === 'AllSame') i = 0;
      else i = cp; // ByVertice / ByVertex / ByControlPoint
      if (reference(el) !== 'Direct' && index.length > 0) i = index[i] ?? -1;
      return i;
    };

    const modelMaterials = childObjects(model.id, 'Material').map((m) => materialFor(m.id));
    const mirrored = m4Mirrors(world);

    // Expand polygon corners into unique vertices.
    const key = new Map<string, number>();
    const pos: number[] = [];
    const nrm: number[] = [];
    const uv: number[] = [];
    const cps: number[] = [];
    const triMat: number[] = [];
    const tris: number[] = [];
    let polyStart = 0;
    let poly = 0;
    const cornerVertex = (corner: number): number => {
      let cp = polys[corner];
      if (cp < 0) cp = ~cp;
      if (cp >= cpCount) throw new ModelImportError('The FBX file has a bad polygon index.');
      const ni = normals.length ? attrIndex(normalEl, normalIdx, cp, corner, poly) : -1;
      const ui = uvs.length ? attrIndex(uvEl, uvIdx, cp, corner, poly) : -1;
      const k = `${cp}/${ni}/${ui}`;
      let v = key.get(k);
      if (v === undefined) {
        v = cps.length;
        key.set(k, v);
        cps.push(cp);
        pos.push(verts[cp * 3], verts[cp * 3 + 1], verts[cp * 3 + 2]);
        if (ni >= 0 && ni * 3 + 2 < normals.length) nrm.push(normals[ni * 3], normals[ni * 3 + 1], normals[ni * 3 + 2]);
        else nrm.push(0, 0, 0);
        if (ui >= 0 && ui * 2 + 1 < uvs.length) uv.push(uvs[ui * 2], 1 - uvs[ui * 2 + 1]);
        else uv.push(0, 0);
      }
      return v;
    };
    for (let i = 0; i < polys.length; i++) {
      if (polys[i] >= 0) continue;
      const n = i - polyStart + 1;
      if (n >= 3) {
        const v0 = cornerVertex(polyStart);
        let mat = 0;
        if (matIds.length) mat = matMapping === 'AllSame' ? matIds[0] : matIds[poly] ?? 0;
        for (let k = 1; k + 1 < n; k++) {
          const v1 = cornerVertex(polyStart + k);
          const v2 = cornerVertex(polyStart + k + 1);
          if (mirrored) tris.push(v0, v2, v1);
          else tris.push(v0, v1, v2);
          triMat.push(mat);
        }
      }
      polyStart = i + 1;
      poly++;
    }
    if (tris.length === 0) continue;

    // Sort triangles by material into groups.
    const order = [...triMat.keys()].sort((a, b) => triMat[a] - triMat[b]);
    const indices = new Uint32Array(tris.length);
    const groups: SourceMesh['groups'] = [];
    for (let t = 0; t < order.length; t++) {
      const src = order[t];
      indices[t * 3] = tris[src * 3];
      indices[t * 3 + 1] = tris[src * 3 + 1];
      indices[t * 3 + 2] = tris[src * 3 + 2];
      const local = triMat[src];
      const material = modelMaterials[local] ?? modelMaterials[0] ?? -1;
      const last = groups[groups.length - 1];
      if (last && last.material === material && last.start + last.count === t) last.count++;
      else groups.push({ start: t, count: 1, material });
    }
    const hasNormals = normals.length > 0;
    const mesh: SourceMesh = {
      name: model.name,
      positions: transformPoints(world, pos),
      normals: hasNormals ? transformNormals(world, nrm) : null,
      uvs: uvs.length ? Float32Array.from(uv) : null,
      indices,
      groups,
      joints: null,
      weights: null,
    };
    if (skinned) {
      const vc = cps.length;
      const joints = new Uint16Array(vc * 4);
      const weights = new Float32Array(vc * 4);
      for (let v = 0; v < vc; v++) {
        const list = (cpWeights[cps[v]] ?? []).slice().sort((a, b) => b.w - a.w).slice(0, 4);
        for (let k = 0; k < list.length; k++) {
          joints[v * 4 + k] = list[k].bone;
          weights[v * 4 + k] = list[k].w;
        }
      }
      mesh.joints = joints;
      mesh.weights = weights;
    }
    scene.meshes.push(mesh);
  }
  // Materials without any texture: a missing texture may still be found by name later.
  if (scene.meshes.length === 0) throw new ModelImportError('This FBX file has no meshes.');
  // Also record bones that are skeleton nodes without weights (helps finding the head).
  for (const o of objects.values()) {
    if (o.kind === 'Model' && (o.sub === 'LimbNode' || o.sub === 'Root') && !boneIndex.has(o.id)) addBone(o.id);
  }
  const creator = roots.find((n) => n.name === 'Creator');
  if (creator) scene.info.push(str(creator));
  return scene;
}
