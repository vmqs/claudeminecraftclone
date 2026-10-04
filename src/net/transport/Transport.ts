/**
 * How the game's messages travel between the host and a guest (the original's TcpConnection /
 * MemoryConnection behind INetworkManager). A message is one encoded frame (Packets.encodeFrame);
 * connections are reliable and ordered.
 */
export interface NetConnection {
  /** The peer's id on the transport (for logs and de-duplication). */
  readonly peerId: string;
  readonly isOpen: boolean;
  /** Messages handed to the transport and not sent yet (back-pressure for chunk streaming). */
  readonly pendingSends: number;
  send(frame: Uint8Array): void;
  /**
   * Closes the connection; the other side sees onClose. With `banMs` (a guest kicked for abusing
   * the protocol) the host ignores that peer for so long instead of greeting it again.
   */
  close(banMs?: number): void;
  onMessage: ((frame: Uint8Array) => void) | null;
  /** The connection ended (the peer left, the network failed or close() was called). */
  onClose: ((reason: string) => void) | null;
}

/** The host side: listens under a room code and hands over each guest's connection. */
export interface HostTransport {
  /** Starts listening; rejects when no signalling route works at all. */
  start(code: string): Promise<void>;
  onConnection: ((c: NetConnection) => void) | null;
  /** Stops listening and closes every connection. */
  stop(): void;
  /** A short description of the signalling routes in use (for the F3 screen and logs). */
  describe(): string;
}

/** The guest side: finds the host of a room code. */
export interface GuestTransport {
  /** Resolves with the connection to the host, or rejects with a ConnectError. */
  connect(code: string, timeoutMs: number): Promise<NetConnection>;
  /** Gives up a connect in progress (Cancel on the connecting screen). */
  cancel(): void;
}

/** Why a guest could not reach the host; `reason` is shown on the disconnect screen. */
export class ConnectError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'ConnectError';
  }
}

/** Shown when no host answered in time or the peer-to-peer link failed. */
export const COULD_NOT_CONNECT = 'Could not connect to the host';

/** How long the host ignores a peer kicked for abusing the protocol (malformed data, floods). */
export const ABUSE_BAN_MS = 60000;
