import { processSkin, sameSkin } from '../../client/skin/SkinImage';
import type { Packet } from '../protocol/Packets';
import { decodeOwnSkin, encodePlayerSkin, SKIN_CHANNEL } from '../SkinSync';

/** A guest may change its skin at most this often (ticks); a newer one waits its turn. */
export const SKIN_CHANGE_TICKS = 40;

/** One guest as the relay sees it (a NetServerHandler). */
export interface SkinGuest {
  readonly username: string;
  readonly state: 'handshake' | 'login' | 'play' | 'closed';
  sendPacket(p: Packet): void;
}

/** What the relay needs from the LAN server and the host's client. */
export interface SkinRelayServer {
  readonly host: {
    readonly hostName: string;
    /** The host player's own skin (null: Steve); absent when the host has no skins (tests). */
    hostSkin?(): Uint8Array | null;
    /** A guest's skin for the host's own renderer (null: back to Steve). */
    playerSkin?(name: string, rgba: Uint8Array | null): void;
  };
  broadcast(p: Packet, except?: SkinGuest | null): void;
}

function skinPacket(name: string, rgba: Uint8Array | null): Packet {
  return { type: 'CustomPayload', channel: SKIN_CHANNEL, data: encodePlayerSkin(name, rgba) };
}

/**
 * The host's side of skin sharing (see SkinSync): keeps each guest's skin, gives the host's
 * renderer the guests' skins, relays every skin to the other players and tells newcomers about
 * everyone's. Guest skins are checked (exact size), reprocessed and rate limited.
 */
export class SkinRelay {
  private readonly skins = new Map<SkinGuest, Uint8Array>();
  private readonly pending = new Map<SkinGuest, Uint8Array | null>();
  private readonly lastChange = new Map<SkinGuest, number>();
  /** The host skin and name last sent (undefined: not yet). */
  private sentHostSkin: Uint8Array | null | undefined = undefined;
  private sentHostName = '';
  /** Skin messages that were not skins (tests, logs). */
  rejected = 0;

  constructor(private readonly server: SkinRelayServer) {}

  /** MC|Skin from a guest (any state after the handshake). */
  received(g: SkinGuest, data: Uint8Array): void {
    const rgba = decodeOwnSkin(data);
    if (rgba === undefined) {
      this.rejected++;
      return;
    }
    this.pending.set(g, rgba);
  }

  /** A guest finished logging in: it learns everyone's skin. */
  joined(g: SkinGuest): void {
    const hostSkin = this.server.host.hostSkin?.() ?? null;
    if (hostSkin) g.sendPacket(skinPacket(this.server.host.hostName, hostSkin));
    for (const [o, rgba] of this.skins) if (o !== g && o.state === 'play') g.sendPacket(skinPacket(o.username, rgba));
  }

  /** A guest left: its skin is forgotten everywhere. */
  left(g: SkinGuest): void {
    this.pending.delete(g);
    this.lastChange.delete(g);
    if (!this.skins.delete(g)) return;
    // A second login under the same name keeps its own skin.
    for (const o of this.skins.keys()) if (o.username === g.username) return;
    this.server.host.playerSkin?.(g.username, null);
    this.server.broadcast(skinPacket(g.username, null), g);
  }

  /** Once per host tick: apply waiting guest skins and send the host's when it changed. */
  tick(ticks: number): void {
    for (const [g, rgba] of this.pending) {
      if (g.state === 'closed') {
        this.pending.delete(g);
        continue;
      }
      if (g.state !== 'play' || ticks - (this.lastChange.get(g) ?? -Infinity) < SKIN_CHANGE_TICKS) continue;
      this.pending.delete(g);
      this.lastChange.set(g, ticks);
      this.apply(g, rgba ? processSkin(rgba) : null);
    }
    const host = this.server.host;
    if (!host.hostSkin) return;
    const skin = host.hostSkin();
    const name = host.hostName;
    if (skin === this.sentHostSkin && name === this.sentHostName) return;
    // Nobody has heard of a Steve host yet: nothing to send.
    if (this.sentHostSkin !== undefined || skin !== null) {
      if (name !== this.sentHostName && this.sentHostName !== '') this.server.broadcast(skinPacket(this.sentHostName, null));
      this.server.broadcast(skinPacket(name, skin));
    }
    this.sentHostSkin = skin;
    this.sentHostName = name;
  }

  private apply(g: SkinGuest, rgba: Uint8Array | null): void {
    const old = this.skins.get(g) ?? null;
    if (sameSkin(old, rgba)) return;
    if (rgba) this.skins.set(g, rgba);
    else this.skins.delete(g);
    this.server.host.playerSkin?.(g.username, rgba);
    this.server.broadcast(skinPacket(g.username, rgba), g);
  }

  /** The skin the host keeps for a guest (tests). */
  skinOf(g: SkinGuest): Uint8Array | null {
    return this.skins.get(g) ?? null;
  }
}
