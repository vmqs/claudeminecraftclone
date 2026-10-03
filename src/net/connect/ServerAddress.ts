import { normalizeRoomCode } from '../RoomCode';

/** The port a Minecraft server listens on when the address names none. */
export const DEFAULT_PORT = 25565;

/**
 * A server address as typed into Direct Connect or Add Server, parsed like 1.5.2's
 * ServerAddress: `host`, `host:port`, `[IPv6]` or `[IPv6]:port`; a bare IPv6 address (more
 * than one colon) is all host; a port that is not a number becomes 25565. An optional
 * `scheme://` prefix (`ws://`, `wss://` ...) picks the ServerConnector; without one the scheme
 * is `tcp`, the plain Minecraft connection. 1.5.2 also looked up a `_minecraft._tcp` SRV record
 * for the default port; a browser cannot query DNS, so the host is used as typed.
 */
export interface ServerAddress {
  readonly scheme: string;
  readonly host: string;
  readonly port: number;
  /** What was typed, trimmed. */
  readonly raw: string;
}

/** Java's String.split(":"): trailing empty strings are dropped (":" gives no parts at all). */
export function javaSplitColon(s: string): string[] {
  const parts = s.split(':');
  while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
  if (parts.length === 1 && parts[0] === '' && s.length > 0) return [];
  return parts;
}

/** Integer.parseInt(s.trim()) with a default for anything that is not a plain int. */
function parseIntWithDefault(s: string, def: number): number {
  const t = s.trim();
  if (!/^[+-]?\d+$/.test(t)) return def;
  const n = Number(t);
  return n >= -2147483648 && n <= 2147483647 ? n : def;
}

export function parseServerAddress(input: string): ServerAddress {
  const raw = input.trim();
  let rest = raw;
  let scheme = 'tcp';
  const m = /^([a-z][a-z0-9+.-]*):\/\//i.exec(rest);
  if (m) {
    scheme = m[1].toLowerCase();
    rest = rest.slice(m[0].length);
    // A path after the authority belongs to the connector (e.g. a proxy's endpoint); the host
    // and port are what comes before it.
    const slash = rest.indexOf('/');
    if (slash >= 0) rest = rest.slice(0, slash);
  }
  let parts = javaSplitColon(rest);
  if (rest.startsWith('[')) {
    const end = rest.indexOf(']');
    if (end > 0) {
      const host = rest.substring(1, end);
      let tail = rest.substring(end + 1).trim();
      if (tail.startsWith(':') && tail.length > 0) {
        tail = tail.substring(1);
        parts = [host, tail];
      } else {
        parts = [host];
      }
    }
  }
  if (parts.length > 2) parts = [rest];
  const host = parts[0] ?? '';
  const port = parts.length > 1 ? parseIntWithDefault(parts[1], DEFAULT_PORT) : DEFAULT_PORT;
  return { scheme, host, port, raw };
}

/** "host:port" for logs and messages ("[v6]:port" for IPv6). */
export function formatServerAddress(a: ServerAddress): string {
  const host = a.host.includes(':') ? `[${a.host}]` : a.host;
  return `${host}:${a.port}`;
}

/**
 * The kind of a saved server list entry. Lists saved before Direct Connect took server addresses
 * again held room codes only (and no kind): an old entry that reads as a room code stays a room,
 * anything else is a server.
 */
export function savedServerKind(s: { ip: string; kind?: string }): 'server' | 'room' {
  if (s.kind === 'server' || s.kind === 'room') return s.kind;
  return normalizeRoomCode(s.ip) !== null ? 'room' : 'server';
}
