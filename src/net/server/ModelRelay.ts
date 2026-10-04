import { MAX_NET_MODEL_BYTES, PlayerModels, STEVE_KEY, type ModelKey, type PlayerModelRegistry } from '../../client/model/PlayerModels';
import { decodeModelMessage, encodeData, encodeWear, HOST_PIECE_BYTES, ModelAssembly, MODEL_CHANNEL } from '../ModelSync';
import type { Packet } from '../protocol/Packets';

/** A guest may change its model at most this often (ticks); a newer choice waits its turn. */
export const MODEL_CHANGE_TICKS = 40;
/** File pieces sent to one guest per tick. */
const PIECES_PER_TICK = 2;

/** One guest as the relay sees it (a NetServerHandler). */
export interface ModelGuest {
  readonly username: string;
  readonly state: 'handshake' | 'login' | 'play' | 'closed';
  sendPacket(p: Packet): void;
}

export interface ModelRelayServer {
  readonly host: {
    readonly hostName: string;
    /** The registry of the host's game (absent: the shared one). */
    readonly models?: PlayerModelRegistry;
  };
  /** Every connected guest. */
  readonly handlers: readonly ModelGuest[];
  broadcast(p: Packet, except?: ModelGuest | null): void;
}

function packet(data: Uint8Array): Packet {
  return { type: 'CustomPayload', channel: MODEL_CHANNEL, data };
}

interface Outgoing {
  hash: string;
  bytes: Uint8Array;
  offset: number;
}

/**
 * The host's side of model sharing (see ModelSync): keeps which model each guest wears, takes
 * imported models' files from guests (in order, hash and model checks, one change per two
 * seconds), shows them on the host and relays them, tells newcomers about everyone's model and
 * streams the files they need a few pieces per tick.
 */
export class ModelRelay {
  private readonly wearing = new Map<ModelGuest, ModelKey>();
  private readonly pending = new Map<ModelGuest, { key: ModelKey; size: number }>();
  private readonly uploads = new Map<ModelGuest, ModelAssembly>();
  private readonly lastChange = new Map<ModelGuest, number>();
  private readonly outgoing = new Map<ModelGuest, Outgoing[]>();
  private sentHostKey: ModelKey = STEVE_KEY;
  private sentHostName = '';
  /** Messages that were not valid (tests, logs). */
  rejected = 0;

  constructor(private readonly server: ModelRelayServer) {}

  private get models(): PlayerModelRegistry {
    return this.server.host.models ?? PlayerModels;
  }

  /** MC|Model from a guest. */
  received(g: ModelGuest, data: Uint8Array): void {
    const m = decodeModelMessage(data, false);
    if (!m) {
      this.rejected++;
      return;
    }
    if (m.kind === 'wear') {
      this.pending.set(g, { key: m.key, size: m.size });
      this.uploads.delete(g);
      if (m.key.startsWith('data:') && !this.models.has(m.key)) this.uploads.set(g, new ModelAssembly(m.key.slice(5), m.size));
      return;
    }
    const a = this.uploads.get(g);
    if (!a || a.hash !== m.hash || !a.add(m.offset, m.bytes)) {
      this.uploads.delete(g);
      this.rejected++;
      return;
    }
    if (!a.complete) return;
    this.uploads.delete(g);
    const bytes = a.result();
    if (!bytes) {
      this.rejected++;
      return;
    }
    try {
      this.models.putData(bytes, MAX_NET_MODEL_BYTES);
    } catch (e) {
      this.rejected++;
      console.warn(`[lan] ${g.username}'s model was refused: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** A guest finished logging in: it learns everyone's model (and gets the files). */
  joined(g: ModelGuest): void {
    const host = this.hostKey();
    if (host !== STEVE_KEY) this.tell(g, this.server.host.hostName, host);
    for (const [o, key] of this.wearing) if (o !== g && o.state === 'play') this.tell(g, o.username, key);
  }

  /** A guest left: its model is forgotten everywhere. */
  left(g: ModelGuest): void {
    this.pending.delete(g);
    this.uploads.delete(g);
    this.lastChange.delete(g);
    this.outgoing.delete(g);
    if (!this.wearing.delete(g)) return;
    for (const o of this.wearing.keys()) if (o.username === g.username) return;
    this.models.setRemote(g.username, STEVE_KEY);
    this.server.broadcast(packet(encodeWear(STEVE_KEY, 0, g.username)), g);
  }

  /** Once per host tick: apply waiting choices, announce the host's own, stream files. */
  tick(ticks: number): void {
    for (const [g, p] of this.pending) {
      if (g.state === 'closed') {
        this.pending.delete(g);
        continue;
      }
      if (g.state !== 'play' || ticks - (this.lastChange.get(g) ?? -Infinity) < MODEL_CHANGE_TICKS) continue;
      // A file still arriving waits for its last piece.
      if (p.key.startsWith('data:') && !this.models.has(p.key)) {
        if (this.uploads.get(g)?.hash === p.key.slice(5)) continue;
        // The upload failed: Steve.
        this.pending.delete(g);
        this.apply(g, STEVE_KEY, ticks);
        continue;
      }
      this.pending.delete(g);
      this.apply(g, p.key, ticks);
    }
    const name = this.server.host.hostName;
    const key = this.hostKey();
    if (key !== this.sentHostKey || name !== this.sentHostName) {
      // A renamed host: its old name goes back to Steve.
      if (name !== this.sentHostName && this.sentHostName !== '' && this.sentHostKey !== STEVE_KEY) this.server.broadcast(packet(encodeWear(STEVE_KEY, 0, this.sentHostName)));
      // Nobody has heard of a Steve host yet: nothing to send.
      if (key !== STEVE_KEY || this.sentHostKey !== STEVE_KEY) this.announce(name, key, null);
      this.sentHostKey = key;
      this.sentHostName = name;
    }
    for (const [g, list] of this.outgoing) {
      if (g.state === 'closed') {
        this.outgoing.delete(g);
        continue;
      }
      for (let n = 0; n < PIECES_PER_TICK && list.length; n++) {
        const o = list[0];
        const piece = o.bytes.subarray(o.offset, o.offset + HOST_PIECE_BYTES);
        g.sendPacket(packet(encodeData(o.hash, o.offset, piece, o.bytes.length)));
        o.offset += piece.length;
        if (o.offset >= o.bytes.length) list.shift();
      }
      if (!list.length) this.outgoing.delete(g);
    }
  }

  /**
   * The host's own model as others should see it: Steve while an imported model is loading or
   * when it is too large to send.
   */
  private hostKey(): ModelKey {
    const key = this.models.local;
    if (!key.startsWith('data:')) return key;
    this.models.dataFor(key);
    const bytes = this.models.bytesFor(key);
    return bytes && bytes.length <= MAX_NET_MODEL_BYTES ? key : STEVE_KEY;
  }

  private apply(g: ModelGuest, key: ModelKey, ticks: number): void {
    this.lastChange.set(g, ticks);
    const old = this.wearing.get(g) ?? STEVE_KEY;
    if (old === key) return;
    if (key === STEVE_KEY) this.wearing.delete(g);
    else this.wearing.set(g, key);
    this.models.setRemote(g.username, key);
    this.announce(g.username, key, g);
  }

  /** Tells every guest but `except` who wears what. */
  private announce(name: string, key: ModelKey, except: ModelGuest | null): void {
    for (const o of this.server.handlers) if (o !== except && o.state === 'play') this.tell(o, name, key);
  }

  /** One guest learns a player's model, and gets the file when it is not built in. */
  private tell(g: ModelGuest, name: string, key: ModelKey): void {
    const bytes = key.startsWith('data:') ? this.models.bytesFor(key) : null;
    g.sendPacket(packet(encodeWear(key, bytes ? bytes.length : 0, name)));
    if (bytes) {
      const list = this.outgoing.get(g) ?? [];
      const hash = key.slice(5);
      if (!list.some((o) => o.hash === hash)) list.push({ hash, bytes, offset: 0 });
      this.outgoing.set(g, list);
    }
  }

  /** The model the host keeps for a guest (tests). */
  modelOf(g: ModelGuest): ModelKey {
    return this.wearing.get(g) ?? STEVE_KEY;
  }
}
