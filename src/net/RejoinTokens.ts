/**
 * The rejoin tokens a guest was given (MC|Rejoin), kept in localStorage per room code and name so
 * a guest that closed its tab can still come back to its things while the room is open. Only the
 * newest rooms are kept.
 */
const KEY = 'mc152.rejoin';
const MAX_ROOMS = 16;

type Store = Record<string, { at: number; names: Record<string, string> }>;

function read(): Store {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}') as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Store) : {};
  } catch {
    return {};
  }
}

export function loadRejoinToken(code: string, name: string): string | null {
  const t = read()[code]?.names?.[name.toLowerCase()];
  return typeof t === 'string' && /^[0-9a-f]{32}$/.test(t) ? t : null;
}

export function saveRejoinToken(code: string, name: string, token: string): void {
  try {
    const store = read();
    const room = (store[code] ??= { at: 0, names: {} });
    room.at = Date.now();
    room.names[name.toLowerCase()] = token;
    const rooms = Object.entries(store).sort((a, b) => b[1].at - a[1].at);
    globalThis.localStorage?.setItem(KEY, JSON.stringify(Object.fromEntries(rooms.slice(0, MAX_ROOMS))));
  } catch {
    /* storage blocked: the guest starts fresh when it rejoins */
  }
}
