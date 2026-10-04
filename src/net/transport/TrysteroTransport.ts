import type { JoinRoom, JoinRoomConfig, MessageAction, Room } from '@trystero-p2p/nostr';
import { deriveRoomKeys, formatRoomCode, NET_APP_ID, type RoomKeys } from '../RoomCode';
import { ABUSE_BAN_MS, COULD_NOT_CONNECT, ConnectError, type GuestTransport, type HostTransport, type NetConnection } from './Transport';

/**
 * WebRTC data channels with serverless signalling (trystero). Peers find each other through
 * public relays (Nostr, with BitTorrent trackers as a second route) in a room named after the
 * room code; after that the game's messages go straight between the browsers over STUN-assisted
 * WebRTC, end-to-end encrypted. The host greets every peer that joins with a "host" message; a
 * guest takes the first peer that greets it as the host and only talks to it (a star, like the
 * integrated server), so other guests in the room are ignored. With `relayUrls` set
 * (`?relay=ws://localhost:4401`), a self-hosted WebSocket relay is the only signalling route
 * (local tests).
 *
 * The strategy modules are loaded on demand so single player never downloads them.
 */

export type SignallingStrategy = 'nostr' | 'torrent' | 'relay';

export interface TrysteroOptions {
  /** Signalling routes in order of preference (default: nostr, then torrent). */
  strategies?: SignallingStrategy[];
  /** WebSocket relay URLs for the 'relay' strategy (implies strategies ['relay'] when given alone). */
  relayUrls?: string[];
}

type AnyJoin = JoinRoom<JoinRoomConfig & { relayConfig?: { urls?: string[]; warnOnRelayFailure?: boolean } }>;

async function loadJoinRoom(s: SignallingStrategy): Promise<AnyJoin> {
  if (s === 'nostr') return (await import('@trystero-p2p/nostr')).joinRoom as AnyJoin;
  if (s === 'torrent') return (await import('@trystero-p2p/torrent')).joinRoom as AnyJoin;
  return (await import('@trystero-p2p/ws-relay')).joinRoom as unknown as AnyJoin;
}

function strategiesOf(o: TrysteroOptions): SignallingStrategy[] {
  if (o.strategies && o.strategies.length > 0) return o.strategies;
  if (o.relayUrls && o.relayUrls.length > 0) return ['relay'];
  return ['nostr', 'torrent'];
}

function configFor(s: SignallingStrategy, keys: RoomKeys, o: TrysteroOptions): JoinRoomConfig {
  const relayConfig = s === 'relay' ? { urls: o.relayUrls ?? [], warnOnRelayFailure: false } : { warnOnRelayFailure: false };
  return { appId: NET_APP_ID, password: keys.password, relayConfig } as JoinRoomConfig;
}

/** The host's greeting (protocol marker), sent to each peer that joins the room. */
const HOST_HELLO = 'mc152-host';

/**
 * What trystero may buffer for one peer before the game sees a message (scripts/patch-trystero.mjs
 * reads these): a guest's messages are at most 64 KiB (MAX_GUEST_MESSAGE), the host's chunk
 * frames a few hundred KiB at most (8 MiB is the protocol's cap). A peer that sends more, or
 * keeps more unfinished messages open, is dropped (onViolation).
 */
interface WireLimits {
  maxMessageBytes: number;
  maxPeerBytes: number;
  maxOpenMessages: number;
  onViolation?: (peerId: string) => void;
}

declare global {
  // eslint-disable-next-line no-var
  var __mc152TrysteroLimits: WireLimits | undefined;
}

const HOST_LIMITS = { maxMessageBytes: 80 * 1024, maxPeerBytes: 256 * 1024, maxOpenMessages: 16 };
const GUEST_LIMITS = { maxMessageBytes: 8 * 1024 * 1024 + 64 * 1024, maxPeerBytes: 16 * 1024 * 1024, maxOpenMessages: 64 };

/** How long a guest waits after the first greeting for a second "host" before trusting it. */
export const HOST_CONFIRM_MS = 1500;


function closePeerLink(room: Room, peerId: string): void {
  try {
    room.getPeers()[peerId]?.close();
  } catch {
    /* already gone */
  }
}

type Payload = ArrayBuffer | ArrayBufferView;

function toBytes(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

interface Route {
  strategy: SignallingStrategy;
  room: Room;
  action: MessageAction<Payload>;
}

class TrysteroConnection implements NetConnection {
  isOpen = true;
  pendingSends = 0;
  onMessage: ((frame: Uint8Array) => void) | null = null;
  onClose: ((reason: string) => void) | null = null;

  constructor(
    readonly peerId: string,
    private readonly route: Route,
    /** `local`: this side closed it (rather than the peer leaving). */
    private readonly onLocalClose: (c: TrysteroConnection, local: boolean) => void,
  ) {}

  get strategy(): SignallingStrategy {
    return this.route.strategy;
  }

  send(frame: Uint8Array): void {
    if (!this.isOpen) return;
    this.pendingSends++;
    this.route.action
      .send(frame, { target: this.peerId })
      .catch(() => undefined)
      .finally(() => this.pendingSends--);
  }

  deliver(data: unknown): void {
    if (!this.isOpen) return;
    const b = toBytes(data);
    if (b) this.onMessage?.(b);
  }

  /** The ban the host keeps after closing (0: none). */
  banMs = 0;

  close(banMs = 0): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.banMs = banMs;
    // Give a kick message time to leave, then drop the peer connection.
    setTimeout(() => closePeerLink(this.route.room, this.peerId), 500);
    this.onLocalClose(this, true);
  }

  peerLeft(reason: string): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.onLocalClose(this, false);
    this.onClose?.(reason);
  }
}

export class TrysteroHost implements HostTransport {
  onConnection: ((c: NetConnection) => void) | null = null;
  private readonly routes: Route[] = [];
  private readonly connections = new Map<string, TrysteroConnection>();
  /**
   * Peers whose connection the host closed: their late messages must not open a new connection.
   * A peer that left the room is forgotten (a guest may rejoin from the same tab); a banned one
   * (protocol abuse) stays ignored until the time given.
   */
  private readonly closedPeers = new Map<string, { until: number; banned: boolean }>();
  private stopped = false;

  constructor(private readonly options: TrysteroOptions = {}) {}

  async start(code: string): Promise<void> {
    globalThis.__mc152TrysteroLimits = { ...HOST_LIMITS, onViolation: (peerId) => this.dropPeer(peerId, 'buffer limits') };
    const errors: string[] = [];
    const keys = await deriveRoomKeys(code);
    for (const s of strategiesOf(this.options)) {
      try {
        const join = await loadJoinRoom(s);
        if (this.stopped) return;
        const room = join(configFor(s, keys, this.options), keys.roomId, {
          onJoinError: (d) => console.warn(`[lan] ${s}: ${d.error}`),
        });
        const action = room.makeAction<Payload>('mc');
        const hello = room.makeAction<string>('host');
        // Guests never send greetings; without a handler trystero would queue them forever.
        hello.onMessage = () => undefined;
        const route: Route = { strategy: s, room, action };
        room.onPeerJoin = (peerId) => {
          if (this.isIgnored(peerId)) {
            closePeerLink(room, peerId);
            return;
          }
          void hello.send(HOST_HELLO, { target: peerId }).catch(() => undefined);
        };
        // A guest's connection belongs to the route its first message came on: a guest may meet
        // the host on several routes and keeps only one.
        action.onMessage = (data, ctx) => {
          let c = this.connections.get(ctx.peerId);
          if (!c) {
            if (this.isIgnored(ctx.peerId)) return;
            c = new TrysteroConnection(ctx.peerId, route, (gone, local) => this.forget(gone, local));
            this.connections.set(ctx.peerId, c);
            this.onConnection?.(c);
          }
          if (c.strategy === s) c.deliver(data);
        };
        room.onPeerLeave = (peerId) => {
          const closed = this.closedPeers.get(peerId);
          if (closed && !closed.banned) this.closedPeers.delete(peerId);
          const c = this.connections.get(peerId);
          if (c && c.strategy === s) {
            this.connections.delete(peerId);
            c.peerLeft('The player left');
          }
        };
        this.routes.push(route);
      } catch (e) {
        errors.push(`${s}: ${(e as Error).message}`);
      }
    }
    if (this.routes.length === 0) throw new Error(`No signalling route works (${errors.join('; ')})`);
  }

  private isIgnored(peerId: string): boolean {
    const closed = this.closedPeers.get(peerId);
    if (!closed) return false;
    if (performance.now() < closed.until) return true;
    this.closedPeers.delete(peerId);
    return false;
  }

  /** A peer broke trystero's buffer limits: close its link and ignore it for a while. */
  private dropPeer(peerId: string, why: string): void {
    console.warn(`[lan] dropping peer ${peerId}: ${why}`);
    const c = this.connections.get(peerId);
    if (c) {
      c.peerLeft('Sending too much data');
    }
    this.closedPeers.set(peerId, { until: performance.now() + ABUSE_BAN_MS, banned: true });
    for (const r of this.routes) closePeerLink(r.room, peerId);
  }

  private forget(c: TrysteroConnection, local: boolean): void {
    if (this.connections.get(c.peerId) === c) this.connections.delete(c.peerId);
    if (!local) return;
    // Ignore what is still in flight until the peer leaves (at most 30 s without a ban).
    const banned = c.banMs > 0;
    this.closedPeers.set(c.peerId, { until: performance.now() + (banned ? c.banMs : 30000), banned });
    if (this.closedPeers.size > 1024) {
      const now = performance.now();
      for (const [id, v] of this.closedPeers) if (v.until <= now) this.closedPeers.delete(id);
    }
  }

  stop(): void {
    this.stopped = true;
    for (const c of [...this.connections.values()]) c.close();
    this.connections.clear();
    for (const r of this.routes) void r.room.leave().catch(() => undefined);
    this.routes.length = 0;
  }

  describe(): string {
    return this.routes.map((r) => r.strategy).join('+') || 'none';
  }
}

export class TrysteroGuest implements GuestTransport {
  private routes: Route[] = [];
  private cancelled: (() => void) | null = null;

  constructor(private readonly options: TrysteroOptions = {}) {}

  connect(code: string, timeoutMs: number): Promise<NetConnection> {
    return new Promise<NetConnection>((resolve, reject) => {
      let settled = false;
      const strategies = strategiesOf(this.options);
      let failed = 0;
      /** The first peer that greeted as the host, confirmed after HOST_CONFIRM_MS. */
      let candidate: { peerId: string; route: Route } | null = null;
      let conn: TrysteroConnection | null = null;
      let confirmTimer: ReturnType<typeof setTimeout> | null = null;
      const finish = (err: ConnectError | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (confirmTimer) clearTimeout(confirmTimer);
        this.cancelled = null;
        if (err || !candidate) {
          this.leaveAll();
          reject(err ?? new ConnectError(COULD_NOT_CONNECT));
          return;
        }
        const { peerId, route } = candidate;
        conn = new TrysteroConnection(peerId, route, () => this.leaveAll());
        // Keep only the host's route.
        for (const r of this.routes) if (r !== route) void r.room.leave().catch(() => undefined);
        this.routes = [route];
        resolve(conn);
      };
      const twoHosts = () => `Two players claim to host room ${formatRoomCode(code)} (someone may be pretending to be the host)`;
      globalThis.__mc152TrysteroLimits = {
        ...GUEST_LIMITS,
        onViolation: (peerId) => {
          console.warn(`[lan] dropping peer ${peerId}: buffer limits`);
          if (conn && peerId === conn.peerId) conn.peerLeft('The host sent too much data');
          else if (!settled && candidate?.peerId === peerId) finish(new ConnectError(`${COULD_NOT_CONNECT}: the host sent too much data`));
          for (const r of this.routes) closePeerLink(r.room, peerId);
        },
      };
      const timer = setTimeout(() => finish(new ConnectError(`${COULD_NOT_CONNECT} (no answer for room ${formatRoomCode(code)})`)), timeoutMs);
      this.cancelled = () => finish(new ConnectError('Cancelled'));
      const keys = deriveRoomKeys(code);
      for (const s of strategies) {
        void Promise.all([loadJoinRoom(s), keys])
          .then(([join, k]) => {
            if (settled) return;
            const room = join(configFor(s, k, this.options), k.roomId, {
              onJoinError: (d) => {
                console.warn(`[lan] ${s}: ${d.error}`);
                if (++failed >= strategies.length) finish(new ConnectError(`${COULD_NOT_CONNECT}: the peer-to-peer link failed (a strict NAT or firewall may need a relay server)`));
              },
            });
            const action = room.makeAction<Payload>('mc');
            const hello = room.makeAction<string>('host');
            const route: Route = { strategy: s, room, action };
            this.routes.push(route);
            // Other guests in the room are ignored; only the host's messages count.
            action.onMessage = (data, ctx) => {
              if (conn && ctx.peerId === conn.peerId) conn.deliver(data);
            };
            room.onPeerLeave = (peerId) => {
              if (conn && peerId === conn.peerId) conn.peerLeft('The host closed the game');
            };
            // Every member of the room can greet; the real host always does. The first greeting
            // is confirmed after a short wait, and a second peer greeting (then or later) ends
            // the connection, so an impostor can block a join but not take it over unnoticed.
            hello.onMessage = (data, ctx) => {
              if (data !== HOST_HELLO) return;
              if (!candidate) {
                if (settled) return;
                candidate = { peerId: ctx.peerId, route };
                confirmTimer = setTimeout(() => finish(null), HOST_CONFIRM_MS);
              } else if (ctx.peerId !== candidate.peerId) {
                if (!settled) finish(new ConnectError(twoHosts()));
                else if (conn) conn.peerLeft(twoHosts());
              }
            };
          })
          .catch((e: Error) => {
            console.warn(`[lan] ${s} unavailable: ${e.message}`);
            if (++failed >= strategies.length) finish(new ConnectError(`${COULD_NOT_CONNECT} (no signalling route)`));
          });
      }
    });
  }

  private leaveAll(): void {
    for (const r of this.routes) void r.room.leave().catch(() => undefined);
    this.routes = [];
  }

  cancel(): void {
    this.cancelled?.();
    this.leaveAll();
  }
}
