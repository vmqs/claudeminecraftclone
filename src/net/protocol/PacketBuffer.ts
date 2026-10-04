/**
 * Binary reading and writing for the multiplayer protocol (the DataInput/DataOutputStream pair
 * Packet.java read and wrote). Big-endian like Java. The reader checks every bound and throws
 * ProtocolError, so a malformed message from a peer can never read past its end or allocate
 * more than the limits allow.
 */

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: false });

export class PacketWriter {
  private buf: Uint8Array;
  private view: DataView;
  private pos = 0;

  constructor(initial = 256) {
    this.buf = new Uint8Array(initial);
    this.view = new DataView(this.buf.buffer);
  }

  get length(): number {
    return this.pos;
  }

  private ensure(n: number): void {
    if (this.pos + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.pos + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.pos));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }

  u8(v: number): void {
    this.ensure(1);
    this.view.setUint8(this.pos, v & 255);
    this.pos += 1;
  }

  i8(v: number): void {
    this.ensure(1);
    this.view.setInt8(this.pos, ((v & 255) << 24) >> 24);
    this.pos += 1;
  }

  bool(v: boolean): void {
    this.u8(v ? 1 : 0);
  }

  u16(v: number): void {
    this.ensure(2);
    this.view.setUint16(this.pos, v & 0xffff);
    this.pos += 2;
  }

  i16(v: number): void {
    this.ensure(2);
    this.view.setInt16(this.pos, ((v & 0xffff) << 16) >> 16);
    this.pos += 2;
  }

  i32(v: number): void {
    this.ensure(4);
    this.view.setInt32(this.pos, v | 0);
    this.pos += 4;
  }

  u32(v: number): void {
    this.ensure(4);
    this.view.setUint32(this.pos, v >>> 0);
    this.pos += 4;
  }

  f32(v: number): void {
    this.ensure(4);
    this.view.setFloat32(this.pos, v);
    this.pos += 4;
  }

  f64(v: number): void {
    this.ensure(8);
    this.view.setFloat64(this.pos, v);
    this.pos += 8;
  }

  /** Unsigned LEB128 (up to 2^32 - 1). */
  varint(v: number): void {
    v = v >>> 0;
    while (v >= 0x80) {
      this.u8((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    this.u8(v);
  }

  bytes(b: Uint8Array): void {
    this.varint(b.length);
    this.raw(b);
  }

  raw(b: Uint8Array): void {
    this.ensure(b.length);
    this.buf.set(b, this.pos);
    this.pos += b.length;
  }

  /** UTF-8 with a varint byte length. */
  str(s: string): void {
    this.bytes(encoder.encode(s));
  }

  finish(): Uint8Array {
    return this.buf.slice(0, this.pos);
  }
}

export class PacketReader {
  private readonly view: DataView;
  pos = 0;

  constructor(readonly data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  get remaining(): number {
    return this.data.length - this.pos;
  }

  private need(n: number): void {
    if (this.pos + n > this.data.length) throw new ProtocolError('message ends early');
  }

  u8(): number {
    this.need(1);
    return this.view.getUint8(this.pos++);
  }

  i8(): number {
    this.need(1);
    return this.view.getInt8(this.pos++);
  }

  bool(): boolean {
    return this.u8() !== 0;
  }

  u16(): number {
    this.need(2);
    const v = this.view.getUint16(this.pos);
    this.pos += 2;
    return v;
  }

  i16(): number {
    this.need(2);
    const v = this.view.getInt16(this.pos);
    this.pos += 2;
    return v;
  }

  i32(): number {
    this.need(4);
    const v = this.view.getInt32(this.pos);
    this.pos += 4;
    return v;
  }

  u32(): number {
    this.need(4);
    const v = this.view.getUint32(this.pos);
    this.pos += 4;
    return v;
  }

  f32(): number {
    this.need(4);
    const v = this.view.getFloat32(this.pos);
    this.pos += 4;
    return v;
  }

  f64(): number {
    this.need(8);
    const v = this.view.getFloat64(this.pos);
    this.pos += 8;
    return v;
  }

  varint(): number {
    let v = 0;
    let shift = 0;
    for (;;) {
      const b = this.u8();
      v += (b & 0x7f) * 2 ** shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
      if (shift > 28) throw new ProtocolError('varint too long');
    }
    return v;
  }

  /** A length-prefixed byte string of at most `max` bytes (a view, not a copy). */
  bytes(max: number): Uint8Array {
    const n = this.varint();
    if (n > max) throw new ProtocolError(`byte string of ${n} exceeds ${max}`);
    this.need(n);
    const out = this.data.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  /** A UTF-8 string of at most `maxBytes` encoded bytes. */
  str(maxBytes: number): string {
    return decoder.decode(this.bytes(maxBytes));
  }
}
