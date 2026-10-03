/**
 * Room codes: six characters from an alphabet without look-alikes (no 0/O, 1/I/L, U/V), shown
 * as "ABC123" and accepted with any case, spaces or dashes. The signalling room a code stands
 * for is namespaced with the app id, so other apps on the same public relays never meet ours.
 */

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
/** The trystero app id: unique to this game, so strangers' rooms on the same relays never collide. */
export const NET_APP_ID = 'mc152-html-vmqs-claudeminecraftclone';

/** A fresh random room code (crypto random when available). */
export function generateRoomCode(random: (n: number) => number = cryptoRandom): string {
  let s = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) s += ROOM_CODE_ALPHABET[random(ROOM_CODE_ALPHABET.length)];
  return s;
}

function cryptoRandom(n: number): number {
  const c = globalThis.crypto;
  if (c?.getRandomValues) {
    const a = new Uint32Array(1);
    // Rejection sampling keeps the characters uniform.
    const limit = Math.floor(0x100000000 / n) * n;
    do c.getRandomValues(a);
    while (a[0] >= limit);
    return a[0] % n;
  }
  return Math.floor(Math.random() * n);
}

/**
 * The code a player typed, normalised: upper case with spaces and separators removed. Returns
 * null when it is not a valid code (look-alikes such as O, 0, I, 1 and L are not in the alphabet).
 */
export function normalizeRoomCode(input: string): string | null {
  const s = input.trim().toUpperCase().replace(/[\s\-_.:]/g, '');
  if (s.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of s) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return s;
}

/** The signalling room id of a code. */
export function roomIdForCode(code: string): string {
  return `room-${code}`;
}
