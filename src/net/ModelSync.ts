import { isModelKey, MAX_NET_MODEL_BYTES, PlayerModels, STEVE_KEY, type ModelKey, type PlayerModelRegistry } from '../client/model/PlayerModels';
import { modelHash } from '../client/model/PlayerModelFormat';
import type { Packet } from './protocol/Packets';
import { isValidUsername } from './Username';

/**
 * Player models over the network, in Packet250CustomPayload on the `MC|Model` channel (beside
 * MC|Skin): which model each player wears, and the model files other players cannot fetch
 * themselves (imported ones; built-in models travel by id).
 *
 * - Guest to host: WEAR (0) with the model key ('steve', 'builtin:<id>', 'data:<hash>') and, for
 *   data, the file size (at most 3 MiB); then DATA (1) pieces of the file in order, one per tick.
 * - Host to guest: PLAYER (0): a player's name, key and size; DATA (1): a piece of a file by hash,
 *   with its offset and the total size.
 *
 * Files are cached by content hash: the host checks that the received bytes hash to the key and
 * decode as a model (decodePlayerModel's limits) before anyone else gets them; guests check
 * the same again. A model too large to send makes the others see Steve.
 */
export const MODEL_CHANNEL = 'MC|Model';

/** A file piece in a guest's message (the guest's whole message must stay under 64 KiB). */
export const GUEST_PIECE_BYTES = 32 * 1024;
/** A file piece from the host. */
export const HOST_PIECE_BYTES = 48 * 1024;

const WEAR = 0;
const DATA = 1;

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (const v of b) s += v.toString(16).padStart(2, '0');
  return s;
}

function putU32(out: Uint8Array, at: number, v: number): void {
  new DataView(out.buffer, out.byteOffset, out.byteLength).setUint32(at, v >>> 0);
}

function getU32(d: Uint8Array, at: number): number {
  return new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(at);
}

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: false });

export interface WearMessage {
  kind: 'wear';
  /** Host -> guest only: whose model. */
  name: string;
  key: ModelKey;
  size: number;
}

export interface DataMessage {
  kind: 'data';
  hash: string;
  offset: number;
  /** Host -> guest only: the whole file's size. */
  total: number;
  bytes: Uint8Array;
}

/** Guest -> host WEAR, or host -> guest PLAYER when `name` is given. */
export function encodeWear(key: ModelKey, size: number, name?: string): Uint8Array {
  const k = enc.encode(key);
  const n = name !== undefined ? enc.encode(name) : null;
  const out = new Uint8Array(1 + (n ? 1 + n.length : 0) + 1 + k.length + 4);
  let o = 0;
  out[o++] = WEAR;
  if (n) {
    out[o++] = n.length;
    out.set(n, o);
    o += n.length;
  }
  out[o++] = k.length;
  out.set(k, o);
  o += k.length;
  putU32(out, o, size);
  return out;
}

/** A DATA piece (`total` only from the host). */
export function encodeData(hash: string, offset: number, bytes: Uint8Array, total?: number): Uint8Array {
  const head = 1 + 16 + 4 + (total !== undefined ? 4 : 0);
  const out = new Uint8Array(head + bytes.length);
  out[0] = DATA;
  out.set(hexToBytes(hash), 1);
  putU32(out, 17, offset);
  if (total !== undefined) putU32(out, 21, total);
  out.set(bytes, head);
  return out;
}

/** Reads a message; `fromHost` selects the host's layouts. Null when malformed. */
export function decodeModelMessage(d: Uint8Array, fromHost: boolean): WearMessage | DataMessage | null {
  if (d.length < 1) return null;
  if (d[0] === WEAR) {
    let o = 1;
    let name = '';
    if (fromHost) {
      const nl = d[o++];
      if (nl < 1 || nl > 16 || o + nl > d.length) return null;
      name = dec.decode(d.subarray(o, o + nl));
      o += nl;
      if (!isValidUsername(name)) return null;
    }
    if (o >= d.length) return null;
    const kl = d[o++];
    if (kl < 1 || o + kl + 4 !== d.length) return null;
    const key = dec.decode(d.subarray(o, o + kl));
    if (!isModelKey(key)) return null;
    const size = getU32(d, o + kl);
    if (key.startsWith('data:') ? size < 12 || size > MAX_NET_MODEL_BYTES : size !== 0) return null;
    return { kind: 'wear', name, key, size };
  }
  if (d[0] === DATA) {
    const head = fromHost ? 25 : 21;
    if (d.length <= head) return null;
    const hash = bytesToHex(d.subarray(1, 17));
    const offset = getU32(d, 17);
    const total = fromHost ? getU32(d, 21) : 0;
    const bytes = d.subarray(head);
    if (bytes.length > HOST_PIECE_BYTES) return null;
    if (fromHost && (total > MAX_NET_MODEL_BYTES || offset + bytes.length > total)) return null;
    if (!fromHost && offset + bytes.length > MAX_NET_MODEL_BYTES) return null;
    return { kind: 'data', hash, offset, total, bytes };
  }
  return null;
}

/** A model file being received piece by piece. */
export class ModelAssembly {
  private readonly buf: Uint8Array;
  received = 0;
  constructor(
    readonly hash: string,
    readonly size: number,
  ) {
    this.buf = new Uint8Array(size);
  }

  /** Adds the next piece; false when it is out of order or too long. */
  add(offset: number, bytes: Uint8Array): boolean {
    if (offset !== this.received || offset + bytes.length > this.size) return false;
    this.buf.set(bytes, offset);
    this.received += bytes.length;
    return true;
  }

  get complete(): boolean {
    return this.received === this.size;
  }

  /** The file, if its hash matches. */
  result(): Uint8Array | null {
    return this.complete && modelHash(this.buf) === this.hash ? this.buf : null;
  }
}

/** What the guest side needs from its connection. */
export interface ModelSyncConnection {
  addToSendQueue(p: Packet): void;
}

const MAX_ASSEMBLIES = 16;

/**
 * The guest's side: sends its own model when it changes (the file in pieces, one per tick), and
 * takes the other players' models from the host.
 */
export class ModelSyncClient {
  private sentKey: ModelKey | undefined = undefined;
  private upload: { hash: string; bytes: Uint8Array; offset: number } | null = null;
  private readonly incoming = new Map<string, ModelAssembly>();
  /** Messages that were not valid (tests, logs). */
  rejected = 0;

  constructor(
    private readonly conn: ModelSyncConnection,
    private readonly ownName: () => string,
    private readonly models: PlayerModelRegistry = PlayerModels,
  ) {}

  /** Once per tick while playing. */
  tick(): void {
    const key = this.models.local;
    if (key !== this.sentKey) {
      if (key === STEVE_KEY) {
        if (this.sentKey !== undefined) this.send(encodeWear(STEVE_KEY, 0));
        this.sentKey = key;
        this.upload = null;
      } else if (key.startsWith('builtin:')) {
        this.send(encodeWear(key, 0));
        this.sentKey = key;
        this.upload = null;
      } else {
        // The file must be loaded before it can be sent.
        this.models.dataFor(key);
        const bytes = this.models.bytesFor(key);
        const state = this.models.stateOf(key);
        if (bytes) {
          if (bytes.length > MAX_NET_MODEL_BYTES) {
            // Too large to share: the others see Steve.
            if (this.sentKey !== undefined) this.send(encodeWear(STEVE_KEY, 0));
            this.upload = null;
          } else {
            this.send(encodeWear(key, bytes.length));
            this.upload = { hash: key.slice(5), bytes, offset: 0 };
          }
          this.sentKey = key;
        } else if (state === 'failed') {
          if (this.sentKey !== undefined) this.send(encodeWear(STEVE_KEY, 0));
          this.sentKey = key;
          this.upload = null;
        }
      }
    }
    const up = this.upload;
    if (up) {
      const piece = up.bytes.subarray(up.offset, up.offset + GUEST_PIECE_BYTES);
      this.send(encodeData(up.hash, up.offset, piece));
      up.offset += piece.length;
      if (up.offset >= up.bytes.length) this.upload = null;
    }
  }

  /** MC|Model from the host. */
  received(data: Uint8Array): void {
    const m = decodeModelMessage(data, true);
    if (!m) {
      this.rejected++;
      return;
    }
    if (m.kind === 'wear') {
      if (m.name === this.ownName()) return;
      this.models.setRemote(m.name, m.key);
      if (m.key.startsWith('data:') && !this.models.has(m.key)) this.expect(m.key.slice(5), m.size);
      return;
    }
    const key = `data:${m.hash}`;
    if (this.models.has(key)) return;
    const a = this.incoming.get(m.hash) ?? this.expect(m.hash, m.total);
    if (!a || a.size !== m.total || !a.add(m.offset, m.bytes)) {
      this.incoming.delete(m.hash);
      this.rejected++;
      return;
    }
    if (!a.complete) return;
    this.incoming.delete(m.hash);
    const bytes = a.result();
    if (!bytes) {
      this.rejected++;
      return;
    }
    try {
      this.models.putData(bytes, MAX_NET_MODEL_BYTES);
    } catch {
      this.rejected++;
    }
  }

  private expect(hash: string, size: number): ModelAssembly | null {
    const known = this.incoming.get(hash);
    if (known && known.size === size) return known;
    if (size < 12 || size > MAX_NET_MODEL_BYTES) return null;
    if (this.incoming.size >= MAX_ASSEMBLIES) this.incoming.delete(this.incoming.keys().next().value!);
    const a = new ModelAssembly(hash, size);
    this.incoming.set(hash, a);
    return a;
  }

  private send(data: Uint8Array): void {
    this.conn.addToSendQueue({ type: 'CustomPayload', channel: MODEL_CHANNEL, data });
  }
}
