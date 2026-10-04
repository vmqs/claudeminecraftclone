import { ConnectError, type NetConnection } from '../transport/Transport';
import { formatServerAddress, parseServerAddress, type ServerAddress } from './ServerAddress';

/** What a server answers to the server list's ping (Packet254 / the 0xFF reply in 1.5.2). */
export interface ServerPing {
  motd: string;
  onlinePlayers: number;
  maxPlayers: number;
  /** Protocol version the server speaks (61 is 1.5.2). */
  protocolVersion: number;
  gameVersion: string;
  /** Round trip in milliseconds. */
  pingMs: number;
}

/**
 * The hook for real server connections (Direct Connect, Add Server, Join Server). A connector
 * opens a connection to a server address and hands back a NetConnection that carries the game's
 * frames (src/net/protocol/Packets.ts: 1.5.2's packet ids and fields). The guest side
 * (NetClientHandler) then logs in exactly as it does in a LAN room. Implementations are
 * registered by address scheme: `tcp` is a plain `host[:port]` (1.5.2's raw TCP connection,
 * which a browser cannot open), and e.g. `ws` / `wss` could be a WebSocket-to-TCP proxy that
 * translates between these frames and the 1.5.2 wire format of a real server.
 */
export interface ServerConnector {
  /** Opens a connection; rejects with a ConnectError whose reason is shown to the player. */
  connect(address: ServerAddress, signal: AbortSignal): Promise<NetConnection>;
  /** The server list's ping; without it the list shows "Can't reach server". */
  ping?(address: ServerAddress, signal: AbortSignal): Promise<ServerPing>;
}

const connectors = new Map<string, ServerConnector>();

/** Registers (or with null removes) the connector for an address scheme such as `wss`. */
export function registerServerConnector(scheme: string, connector: ServerConnector | null): void {
  if (connector) connectors.set(scheme.toLowerCase(), connector);
  else connectors.delete(scheme.toLowerCase());
}

export function getServerConnector(scheme: string): ServerConnector | null {
  return connectors.get(scheme.toLowerCase()) ?? null;
}

/**
 * Why a plain address fails today. 1.5.2 showed java.net.ConnectException's message ("Connection
 * refused: connect") under "Failed to connect to the server"; a web page cannot open raw TCP
 * sockets at all, so the reason says so.
 */
export const NO_DIRECT_CONNECTIONS = 'Connection refused: browsers cannot open direct server connections yet';

/** ThreadConnectToServer: the connection to a typed address, through its scheme's connector. */
export async function connectToServerAddress(input: string, signal: AbortSignal): Promise<NetConnection> {
  const address = parseServerAddress(input);
  if (address.host === '') throw new ConnectError(`Unknown host '${address.host}'`);
  console.info(`[net] connecting to ${address.scheme}://${formatServerAddress(address)}`);
  const c = getServerConnector(address.scheme);
  if (!c) {
    if (address.scheme === 'tcp') throw new ConnectError(NO_DIRECT_CONNECTIONS);
    throw new ConnectError(`Connection refused: no connector for ${address.scheme}:// addresses`);
  }
  return c.connect(address, signal);
}

/** ThreadPollServers: the server list's ping through the address's connector. */
export async function pingServerAddress(input: string, signal: AbortSignal): Promise<ServerPing> {
  const address = parseServerAddress(input);
  const c = getServerConnector(address.scheme);
  if (!c?.ping) throw new ConnectError("Can't reach server");
  return c.ping(address, signal);
}
