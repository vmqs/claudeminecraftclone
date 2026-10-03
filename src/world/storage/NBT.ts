import { gunzipSync, gzipSync, unzlibSync, zlibSync } from 'fflate';
import type { TagCompound } from '../../item/ItemStack';

/**
 * Named Binary Tag, the format of 1.5.2's level.dat, players/*.dat and region chunks
 * (NBTBase and its NBTTag* subclasses, CompressedStreamTools).
 *
 * The game keeps tags as plain objects (`TagCompound`): compounds are objects, lists are
 * arrays, numbers are numbers, TAG_Long is a bigint, TAG_Byte_Array a Uint8Array and
 * TAG_Int_Array a number[]. The binary type of each key is remembered beside the value in a
 * hidden, non-enumerable map, which the typed setters below fill and the reader records, so a
 * tag read from a real save is written back with the same types. Keys without a recorded type
 * get one from their value (and, for numbers, from `KEY_HINTS`: the item and enchantment keys
 * that game code still writes as bare numbers).
 */
export const NBTType = {
  End: 0,
  Byte: 1,
  Short: 2,
  Int: 3,
  Long: 4,
  Float: 5,
  Double: 6,
  ByteArray: 7,
  String: 8,
  List: 9,
  Compound: 10,
  IntArray: 11,
} as const;
export type NBTTypeId = (typeof NBTType)[keyof typeof NBTType];

const TYPES = Symbol('nbt.types');
const LIST_TYPE = Symbol('nbt.listType');

type Typed = { [TYPES]?: Record<string, number> };
type TypedList = unknown[] & { [LIST_TYPE]?: number };

/** Numeric keys written without a type by older code: their 1.5.2 type. */
const KEY_HINTS: Record<string, number> = {
  Slot: NBTType.Byte,
  Count: NBTType.Byte,
  Damage: NBTType.Short,
  id: NBTType.Short,
  lvl: NBTType.Short,
  Id: NBTType.Byte,
  Amplifier: NBTType.Byte,
  Duration: NBTType.Int,
  Ambient: NBTType.Byte,
  Flight: NBTType.Byte,
  Flicker: NBTType.Byte,
  Trail: NBTType.Byte,
  Type: NBTType.Byte,
  Colors: NBTType.IntArray,
  FadeColors: NBTType.IntArray,
  map_is_scaling: NBTType.Byte,
};

function typesOf(tag: object): Record<string, number> {
  const t = tag as Typed;
  let m = t[TYPES];
  if (!m) {
    m = Object.create(null) as Record<string, number>;
    Object.defineProperty(tag, TYPES, { value: m, enumerable: false, writable: true, configurable: true });
  }
  return m;
}

function setListType(list: unknown[], type: number): void {
  Object.defineProperty(list, LIST_TYPE, { value: type, enumerable: false, writable: true, configurable: true });
}

/** The binary type recorded for `key` (undefined when it was set without one). */
export function nbtTypeOf(tag: TagCompound, key: string): number | undefined {
  return (tag as Typed)[TYPES]?.[key];
}

/** Records the binary type of a key that was assigned directly. */
export function nbtSetType(tag: TagCompound, key: string, type: NBTTypeId): void {
  typesOf(tag)[key] = type;
}

const isObj = (v: unknown): v is TagCompound => !!v && typeof v === 'object' && !Array.isArray(v) && !ArrayBuffer.isView(v);

function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'bigint') return Number(BigInt.asIntN(64, v));
  if (typeof v === 'boolean') return v ? 1 : 0;
  return 0;
}

/** Typed setters and getters with the semantics of NBTTagCompound (missing keys read as 0, "", empty). */
export const NBT = {
  setByte(tag: TagCompound, key: string, v: number | boolean): void {
    tag[key] = (num(v) << 24) >> 24;
    typesOf(tag)[key] = NBTType.Byte;
  },
  setBoolean(tag: TagCompound, key: string, v: boolean): void {
    tag[key] = v ? 1 : 0;
    typesOf(tag)[key] = NBTType.Byte;
  },
  setShort(tag: TagCompound, key: string, v: number): void {
    tag[key] = (Math.trunc(num(v)) << 16) >> 16;
    typesOf(tag)[key] = NBTType.Short;
  },
  setInteger(tag: TagCompound, key: string, v: number): void {
    tag[key] = Math.trunc(num(v)) | 0;
    typesOf(tag)[key] = NBTType.Int;
  },
  setLong(tag: TagCompound, key: string, v: bigint | number): void {
    tag[key] = BigInt.asIntN(64, typeof v === 'bigint' ? v : BigInt(Math.trunc(num(v))));
    typesOf(tag)[key] = NBTType.Long;
  },
  setFloat(tag: TagCompound, key: string, v: number): void {
    tag[key] = Math.fround(num(v));
    typesOf(tag)[key] = NBTType.Float;
  },
  setDouble(tag: TagCompound, key: string, v: number): void {
    tag[key] = num(v);
    typesOf(tag)[key] = NBTType.Double;
  },
  setString(tag: TagCompound, key: string, v: string): void {
    tag[key] = String(v);
    typesOf(tag)[key] = NBTType.String;
  },
  setByteArray(tag: TagCompound, key: string, v: Uint8Array): void {
    tag[key] = v;
    typesOf(tag)[key] = NBTType.ByteArray;
  },
  setIntArray(tag: TagCompound, key: string, v: ArrayLike<number>): void {
    tag[key] = Array.from(v, (n) => n | 0);
    typesOf(tag)[key] = NBTType.IntArray;
  },
  setCompoundTag(tag: TagCompound, key: string, v: TagCompound): void {
    tag[key] = v;
    typesOf(tag)[key] = NBTType.Compound;
  },
  /** A list whose elements all have `elementType` (NBTTagList). */
  setList(tag: TagCompound, key: string, elementType: NBTTypeId, v: unknown[]): void {
    setListType(v, elementType);
    tag[key] = v;
    typesOf(tag)[key] = NBTType.List;
  },
  /** A typed list without a key (an element of an outer list). */
  list<T>(elementType: NBTTypeId, v: T[]): T[] {
    setListType(v, elementType);
    return v;
  },
  doubleList(...v: number[]): number[] {
    return NBT.list(NBTType.Double, v.map(num));
  },
  floatList(...v: number[]): number[] {
    return NBT.list(NBTType.Float, v.map((n) => Math.fround(num(n))));
  },

  hasKey(tag: TagCompound, key: string): boolean {
    return tag[key] !== undefined && tag[key] !== null;
  },
  getByte(tag: TagCompound, key: string): number {
    return (Math.trunc(num(tag[key])) << 24) >> 24;
  },
  getBoolean(tag: TagCompound, key: string): boolean {
    return NBT.getByte(tag, key) !== 0;
  },
  getShort(tag: TagCompound, key: string): number {
    return (Math.trunc(num(tag[key])) << 16) >> 16;
  },
  getInteger(tag: TagCompound, key: string): number {
    return Math.trunc(num(tag[key])) | 0;
  },
  getLong(tag: TagCompound, key: string): bigint {
    const v = tag[key];
    if (typeof v === 'bigint') return BigInt.asIntN(64, v);
    return BigInt(Math.trunc(num(v)));
  },
  getFloat(tag: TagCompound, key: string): number {
    return Math.fround(num(tag[key]));
  },
  getDouble(tag: TagCompound, key: string): number {
    return num(tag[key]);
  },
  getString(tag: TagCompound, key: string): string {
    const v = tag[key];
    return typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v);
  },
  getByteArray(tag: TagCompound, key: string): Uint8Array {
    const v = tag[key];
    if (v instanceof Uint8Array) return v;
    if (v instanceof Int8Array) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    if (Array.isArray(v)) return Uint8Array.from(v, (n) => num(n) & 255);
    return new Uint8Array(0);
  },
  getIntArray(tag: TagCompound, key: string): number[] {
    const v = tag[key];
    if (Array.isArray(v)) return v.map((n) => num(n) | 0);
    if (ArrayBuffer.isView(v)) return Array.from(v as unknown as ArrayLike<number>, (n) => n | 0);
    return [];
  },
  getCompoundTag(tag: TagCompound, key: string): TagCompound {
    const v = tag[key];
    return isObj(v) ? v : {};
  },
  getTagList<T = unknown>(tag: TagCompound, key: string): T[] {
    const v = tag[key];
    return Array.isArray(v) ? (v as T[]) : [];
  },
  /** The compounds of a list (other elements are skipped). */
  getCompoundList(tag: TagCompound, key: string): TagCompound[] {
    return NBT.getTagList(tag, key).filter(isObj);
  },
};

// ------------------------------------------------------------------ binary

/** Thrown for malformed or oversized data; callers turn it into an error screen. */
export class NBTError extends Error {}

const MAX_DEPTH = 512;

class Writer {
  private buf = new Uint8Array(4096);
  private view = new DataView(this.buf.buffer);
  pos = 0;

  private ensure(n: number): void {
    if (this.pos + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.pos + n) size *= 2;
    const b = new Uint8Array(size);
    b.set(this.buf.subarray(0, this.pos));
    this.buf = b;
    this.view = new DataView(b.buffer);
  }
  byte(v: number): void {
    this.ensure(1);
    this.view.setInt8(this.pos, (v << 24) >> 24);
    this.pos += 1;
  }
  short(v: number): void {
    this.ensure(2);
    this.view.setInt16(this.pos, (v << 16) >> 16);
    this.pos += 2;
  }
  int(v: number): void {
    this.ensure(4);
    this.view.setInt32(this.pos, v | 0);
    this.pos += 4;
  }
  long(v: bigint): void {
    this.ensure(8);
    this.view.setBigInt64(this.pos, BigInt.asIntN(64, v));
    this.pos += 8;
  }
  float(v: number): void {
    this.ensure(4);
    this.view.setFloat32(this.pos, v);
    this.pos += 4;
  }
  double(v: number): void {
    this.ensure(8);
    this.view.setFloat64(this.pos, v);
    this.pos += 8;
  }
  bytes(b: Uint8Array): void {
    this.ensure(b.length);
    this.buf.set(b, this.pos);
    this.pos += b.length;
  }
  /** DataOutput.writeUTF: modified UTF-8 with a u16 length. */
  utf(s: string): void {
    const enc = encodeModifiedUtf8(s);
    if (enc.length > 65535) throw new NBTError('String too long for NBT');
    this.ensure(2 + enc.length);
    this.view.setUint16(this.pos, enc.length);
    this.pos += 2;
    this.buf.set(enc, this.pos);
    this.pos += enc.length;
  }
  result(): Uint8Array {
    return this.buf.slice(0, this.pos);
  }
}

export function encodeModifiedUtf8(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 1 && c <= 0x7f) out.push(c);
    else if (c <= 0x7ff) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return Uint8Array.from(out);
}

export function decodeModifiedUtf8(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; ) {
    const a = b[i];
    let c: number;
    if (a < 0x80) {
      c = a;
      i += 1;
    } else if ((a & 0xe0) === 0xc0 && i + 1 < b.length) {
      c = ((a & 0x1f) << 6) | (b[i + 1] & 0x3f);
      i += 2;
    } else if ((a & 0xf0) === 0xe0 && i + 2 < b.length) {
      c = ((a & 0x0f) << 12) | ((b[i + 1] & 0x3f) << 6) | (b[i + 2] & 0x3f);
      i += 3;
    } else {
      throw new NBTError('Malformed string in NBT');
    }
    s += String.fromCharCode(c);
  }
  return s;
}

/** The binary type a value is written as. */
function typeFor(key: string | null, v: unknown, hint: number | undefined): number {
  if (hint !== undefined) return hint;
  if (typeof v === 'boolean') return NBTType.Byte;
  if (typeof v === 'bigint') return NBTType.Long;
  if (typeof v === 'string') return NBTType.String;
  if (v instanceof Uint8Array || v instanceof Int8Array) return NBTType.ByteArray;
  if (v instanceof Int32Array) return NBTType.IntArray;
  if (Array.isArray(v)) return key !== null && KEY_HINTS[key] === NBTType.IntArray ? NBTType.IntArray : NBTType.List;
  if (isObj(v)) return NBTType.Compound;
  if (typeof v === 'number') {
    const h = key !== null ? KEY_HINTS[key] : undefined;
    if (h !== undefined && h !== NBTType.IntArray) return h;
    return Number.isInteger(v) && v >= -2147483648 && v <= 2147483647 ? NBTType.Int : NBTType.Double;
  }
  return NBTType.End;
}

function listElementType(key: string | null, list: unknown[]): number {
  const t = (list as TypedList)[LIST_TYPE];
  if (t !== undefined) return t;
  if (list.length === 0) return NBTType.Byte;
  // An untyped list takes its first element's type, like NBTTagList.write (numbers as their key's hint).
  const first = list.find((e) => e !== undefined && e !== null);
  if (first === undefined) return NBTType.Byte;
  if (typeof first === 'number') {
    if (key === 'Pos' || key === 'Motion') return NBTType.Double;
    if (key === 'Rotation' || key === 'DropChances') return NBTType.Float;
    return list.every((n) => Number.isInteger(n)) ? NBTType.Int : NBTType.Double;
  }
  return typeFor(null, first, undefined);
}

function writePayload(w: Writer, type: number, v: unknown, key: string | null, depth: number): void {
  if (depth > MAX_DEPTH) throw new NBTError('NBT nested too deeply');
  switch (type) {
    case NBTType.Byte:
      w.byte(Math.trunc(num(v)));
      return;
    case NBTType.Short:
      w.short(Math.trunc(num(v)));
      return;
    case NBTType.Int:
      w.int(Math.trunc(num(v)));
      return;
    case NBTType.Long:
      w.long(typeof v === 'bigint' ? v : BigInt(Math.trunc(num(v))));
      return;
    case NBTType.Float:
      w.float(num(v));
      return;
    case NBTType.Double:
      w.double(num(v));
      return;
    case NBTType.ByteArray: {
      let b: Uint8Array;
      if (v instanceof Uint8Array) b = v;
      else if (ArrayBuffer.isView(v)) b = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      else if (Array.isArray(v)) b = Uint8Array.from(v, (n) => num(n) & 255);
      else b = new Uint8Array(0);
      w.int(b.length);
      w.bytes(b);
      return;
    }
    case NBTType.String:
      w.utf(typeof v === 'string' ? v : String(v ?? ''));
      return;
    case NBTType.List: {
      const list = Array.isArray(v) ? v.filter((e) => e !== undefined && e !== null) : [];
      const et = listElementType(key, Array.isArray(v) ? (v as unknown[]) : []);
      w.byte(et);
      w.int(list.length);
      for (const e of list) writePayload(w, et, e, null, depth + 1);
      return;
    }
    case NBTType.Compound:
      writeCompoundBody(w, isObj(v) ? v : {}, depth + 1);
      return;
    case NBTType.IntArray: {
      const a: ArrayLike<number> = Array.isArray(v) || ArrayBuffer.isView(v) ? (v as unknown as ArrayLike<number>) : [];
      w.int(a.length);
      for (let i = 0; i < a.length; i++) w.int(num(a[i]));
      return;
    }
    default:
      throw new NBTError(`Unknown NBT type ${type}`);
  }
}

function writeCompoundBody(w: Writer, tag: TagCompound, depth: number): void {
  const types = (tag as Typed)[TYPES];
  for (const key of Object.keys(tag)) {
    const v = tag[key];
    if (v === undefined || v === null || typeof v === 'function') continue;
    const t = typeFor(key, v, types?.[key]);
    if (t === NBTType.End) continue;
    w.byte(t);
    w.utf(key);
    writePayload(w, t, v, key, depth);
  }
  w.byte(NBTType.End);
}

/** CompressedStreamTools.write: a named root compound (named "" in every 1.5.2 file). */
export function writeNBT(root: TagCompound, name = ''): Uint8Array {
  const w = new Writer();
  w.byte(NBTType.Compound);
  w.utf(name);
  writeCompoundBody(w, root, 0);
  return w.result();
}

class Reader {
  private readonly view: DataView;
  pos = 0;
  constructor(private readonly buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  private need(n: number): void {
    if (n < 0 || this.pos + n > this.buf.length) throw new NBTError('Unexpected end of NBT data');
  }
  get remaining(): number {
    return this.buf.length - this.pos;
  }
  byte(): number {
    this.need(1);
    return this.view.getInt8(this.pos++);
  }
  short(): number {
    this.need(2);
    const v = this.view.getInt16(this.pos);
    this.pos += 2;
    return v;
  }
  int(): number {
    this.need(4);
    const v = this.view.getInt32(this.pos);
    this.pos += 4;
    return v;
  }
  long(): bigint {
    this.need(8);
    const v = this.view.getBigInt64(this.pos);
    this.pos += 8;
    return v;
  }
  float(): number {
    this.need(4);
    const v = this.view.getFloat32(this.pos);
    this.pos += 4;
    return v;
  }
  double(): number {
    this.need(8);
    const v = this.view.getFloat64(this.pos);
    this.pos += 8;
    return v;
  }
  bytes(n: number): Uint8Array {
    this.need(n);
    const b = this.buf.slice(this.pos, this.pos + n);
    this.pos += n;
    return b;
  }
  utf(): string {
    this.need(2);
    const n = this.view.getUint16(this.pos);
    this.pos += 2;
    this.need(n);
    const s = decodeModifiedUtf8(this.buf.subarray(this.pos, this.pos + n));
    this.pos += n;
    return s;
  }
}

/** Smallest encoded size of one element of a type (to reject impossible list lengths early). */
const MIN_SIZE = [0, 1, 2, 4, 8, 4, 8, 4, 2, 5, 1, 4];

function readPayload(r: Reader, type: number, depth: number): unknown {
  if (depth > MAX_DEPTH) throw new NBTError('NBT nested too deeply');
  switch (type) {
    case NBTType.Byte:
      return r.byte();
    case NBTType.Short:
      return r.short();
    case NBTType.Int:
      return r.int();
    case NBTType.Long:
      return r.long();
    case NBTType.Float:
      return r.float();
    case NBTType.Double:
      return r.double();
    case NBTType.ByteArray: {
      const n = r.int();
      if (n < 0 || n > r.remaining) throw new NBTError('Bad byte array length');
      return r.bytes(n);
    }
    case NBTType.String:
      return r.utf();
    case NBTType.List: {
      const et = r.byte();
      const n = r.int();
      if (et < 0 || et > 11) throw new NBTError(`Unknown NBT list type ${et}`);
      if (n < 0 || (n > 0 && et === NBTType.End) || n * MIN_SIZE[et] > r.remaining) throw new NBTError('Bad list length');
      const list: unknown[] = [];
      for (let i = 0; i < n; i++) list.push(readPayload(r, et, depth + 1));
      setListType(list, et);
      return list;
    }
    case NBTType.Compound:
      return readCompoundBody(r, depth + 1);
    case NBTType.IntArray: {
      const n = r.int();
      if (n < 0 || n * 4 > r.remaining) throw new NBTError('Bad int array length');
      const a: number[] = new Array(n);
      for (let i = 0; i < n; i++) a[i] = r.int();
      return a;
    }
    default:
      throw new NBTError(`Unknown NBT type ${type}`);
  }
}

function readCompoundBody(r: Reader, depth: number): TagCompound {
  const tag: TagCompound = {};
  const types = typesOf(tag);
  for (;;) {
    const t = r.byte();
    if (t === NBTType.End) return tag;
    if (t < 0 || t > 11) throw new NBTError(`Unknown NBT type ${t}`);
    const key = r.utf();
    const v = readPayload(r, t, depth);
    // __proto__ and friends stay plain data.
    Object.defineProperty(tag, key, { value: v, enumerable: true, writable: true, configurable: true });
    types[key] = t;
  }
}

/** CompressedStreamTools.read: the root compound (and its name). Throws NBTError on bad data. */
export function readNBT(bytes: Uint8Array): TagCompound {
  return readNamedNBT(bytes).tag;
}

export function readNamedNBT(bytes: Uint8Array): { name: string; tag: TagCompound } {
  const r = new Reader(bytes);
  const t = r.byte();
  if (t !== NBTType.Compound) throw new NBTError('Root tag must be a named compound tag');
  const name = r.utf();
  return { name, tag: readCompoundBody(r, 0) };
}

// ------------------------------------------------------------------ compression

/** Largest decompressed size accepted from a single file or chunk. */
export const MAX_INFLATED = 64 * 1024 * 1024;

function guardInflate(fn: () => Uint8Array): Uint8Array {
  let out: Uint8Array;
  try {
    out = fn();
  } catch (e) {
    throw new NBTError(`Corrupt compressed data (${(e as Error).message})`);
  }
  if (out.length > MAX_INFLATED) throw new NBTError('Compressed data is too large');
  return out;
}

/** CompressedStreamTools.compress / writeCompressed: GZip'd NBT (level.dat, players). */
export function writeCompressedNBT(root: TagCompound): Uint8Array {
  return gzipSync(writeNBT(root), { level: 6, mtime: 0 });
}

/** CompressedStreamTools.decompress / readCompressed. */
export function readCompressedNBT(bytes: Uint8Array): TagCompound {
  return readNBT(guardInflate(() => gunzipSync(bytes)));
}

/** Zlib (InflaterInputStream / DeflaterOutputStream, region compression type 2). */
export function zlibDeflate(bytes: Uint8Array): Uint8Array {
  return zlibSync(bytes, { level: 6 });
}

export function zlibInflate(bytes: Uint8Array): Uint8Array {
  return guardInflate(() => unzlibSync(bytes));
}

export function gzipInflate(bytes: Uint8Array): Uint8Array {
  return guardInflate(() => gunzipSync(bytes));
}

/** Deep copy that keeps the recorded binary types (structuredClone drops them). */
export function cloneNBT<T>(v: T): T {
  if (v instanceof Uint8Array) return v.slice() as T;
  if (Array.isArray(v)) {
    const out = v.map((e) => cloneNBT(e));
    const lt = (v as TypedList)[LIST_TYPE];
    if (lt !== undefined) setListType(out, lt);
    return out as T;
  }
  if (isObj(v)) {
    const out: TagCompound = {};
    const types = (v as Typed)[TYPES];
    for (const k of Object.keys(v)) Object.defineProperty(out, k, { value: cloneNBT(v[k]), enumerable: true, writable: true, configurable: true });
    if (types) Object.assign(typesOf(out), types);
    return out as T;
  }
  return v;
}
