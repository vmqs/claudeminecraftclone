import type { JoinRoom, JoinRoomConfig, MessageAction, Room } from '@trystero-p2p/nostr';
import { NET_APP_ID, roomIdForCode } from '../RoomCode';
import { COULD_NOT_CONNECT, ConnectError, type GuestTransport, type HostTransport, type NetConnection } from './Transport';

/**
 * WebRTC data channels with serverless signalling (trystero). Peers find each other through
 * public relays (Nostr, with BitTorrent trackers as a second route) in a room named after the
 * room code; after that the game's messages go straight between the browsers over STUN-assisted
 * WebRTC, end-to-end encrypted. The host joins as an active peer and guests as passive ones, so
 * guests only connect to the host (a star, like the integrated server). With `relayUrls` set
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

function configFor(s: SignallingStrategy, code: string, o: TrysteroOptions, passive: boolean): JoinRoomConfig {
  const relayConfig = s === 'relay' ? { urls: o.relayUrls ?? [], warnOnRelayFailure: false } : { warnOnRelayFailure: false };
  return { appId: NET_APP_ID, password: code, passive, relayConfig } as JoinRoomConfig;
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
    private readonly onLocalClose: (c: TrysteroConnection) => void,
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

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    // Give a kick message time to leave, then drop the peer connection.
    setTimeout(() => {
      try {
        this.route.room.getPeers()[this.peerId]?.close();
      } catch {
        /* already gone */
      }
    }, 500);
    this.onLocalClose(this);
  }

  peerLeft(reason: string): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.onLocalClose(this);
    this.onClose?.(reason);
  }
}

export class TrysteroHost implements HostTransport {
  onConnection: ((c: NetConnection) => void) | null = null;
  private readonly routes: Route[] = [];
  private readonly connections = new Map<string, TrysteroConnection>();
  private stopped = false;

  constructor(private readonly options: TrysteroOptions = {}) {}

  async start(code: string): Promise<void> {
    const errors: string[] = [];
    for (const s of strategiesOf(this.options)) {
      try {
        const join = await loadJoinRoom(s);
        if (this.stopped) return;
        const room = join(configFor(s, code, this.options, false), roomIdForCode(code), {
          onJoinError: (d) => console.warn(`[lan] ${s}: ${d.error}`),
        });
        const action = room.makeAction<Payload>('mc');
        const route: Route = { strategy: s, room, action };
        // A guest's connection belongs to the route its first message came on: a guest may meet
        // the host on several routes and keeps only one.
        action.onMessage = (data, ctx) => {
          let c = this.connections.get(ctx.peerId);
          if (!c) {
            c = new TrysteroConnection(ctx.peerId, route, (gone) => this.forget(gone));
            this.connections.set(ctx.peerId, c);
            this.onConnection?.(c);
          }
          if (c.strategy === s) c.deliver(data);
        };
        room.onPeerLeave = (peerId) => {
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

  private forget(c: TrysteroConnection): void {
    if (this.connections.get(c.peerId) === c) this.connections.delete(c.peerId);
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
      const finish = (err: ConnectError | null, conn?: NetConnection) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.cancelled = null;
        if (err) {
          this.leaveAll();
          reject(err);
        } else resolve(conn!);
      };
      const timer = setTimeout(() => finish(new ConnectError(`${COULD_NOT_CONNECT} (no answer for room ${code})`)), timeoutMs);
      this.cancelled = () => finish(new ConnectError('Cancelled'));
      for (const s of strategies) {
        void loadJoinRoom(s)
          .then((join) => {
            if (settled) return;
            const room = join(configFor(s, code, this.options, true), roomIdForCode(code), {
              onJoinError: (d) => {
                console.warn(`[lan] ${s}: ${d.error}`);
                if (++failed >= strategies.length) finish(new ConnectError(`${COULD_NOT_CONNECT}: the peer-to-peer link failed (a strict NAT or firewall may need a relay server)`));
              },
            });
            const action = room.makeAction<Payload>('mc');
            const route: Route = { strategy: s, room, action };
            this.routes.push(route);
            let conn: TrysteroConnection | null = null;
            action.onMessage = (data, ctx) => {
              if (conn && ctx.peerId === conn.peerId) conn.deliver(data);
            };
            room.onPeerLeave = (peerId) => {
              if (conn && peerId === conn.peerId) conn.peerLeft('The host closed the game');
            };
            room.onPeerJoin = (peerId) => {
              if (settled || conn) return;
              conn = new TrysteroConnection(peerId, route, () => this.leaveAll());
              // Keep only this route.
              for (const r of this.routes) if (r !== route) void r.room.leave().catch(() => undefined);
              this.routes = [route];
              finish(null, conn);
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
