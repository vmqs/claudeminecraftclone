/**
 * Room codes: eight characters from an alphabet without look-alikes (no 0/O, 1/I/L, U/V), shown
 * as "ABCD-EFGH" and accepted with any case, spaces or dashes.
 *
 * The code is the only secret of a room, and the public signalling relays see what is derived
 * from it (trystero publishes a hash of the room id as a Nostr tag and a BitTorrent info hash,
 * and encrypts the WebRTC offers with a key made from the password). So neither is the code
 * itself: both come from PBKDF2-SHA256 over the code with 200 000 iterations, the room id from
 * the first half of the output and the password from the second. With 29^8 (about 2^39) codes
 * that makes listing rooms or reading their offers from the relays a matter of GPU-years
 * rather than the seconds the plain 6-character code took.
 */

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTWXYZ23456789';
export const ROOM_CODE_LENGTH = 8;
/** The trystero app id: unique to this game, so strangers' rooms on the same relays never collide. */
export const NET_APP_ID = 'mc152-html-vmqs-claudeminecraftclone';
/** PBKDF2 parameters of the room keys (changing them changes every room id: bump the salt's version). */
const ROOM_KEY_SALT = `${NET_APP_ID}:room-keys:v2`;
const ROOM_KEY_ITERATIONS = 200000;

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

/** How a code is shown: "ABCD-EFGH". */
export function formatRoomCode(code: string): string {
  return code.length === ROOM_CODE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export interface RoomKeys {
  /** The signalling room id (hex). */
  roomId: string;
  /** The signalling password (hex). */
  password: string;
}

const toHex = (b: Uint8Array) => [...b].map((v) => v.toString(16).padStart(2, '0')).join('');

/** The signalling room id and password of a code (PBKDF2, see above; takes a fraction of a second). */
export async function deriveRoomKeys(code: string): Promise<RoomKeys> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('This browser has no Web Crypto (an https page is needed)');
  const enc = new TextEncoder();
  const key = await subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(ROOM_KEY_SALT), iterations: ROOM_KEY_ITERATIONS }, key, 256));
  return { roomId: toHex(bits.subarray(0, 16)), password: toHex(bits.subarray(16, 32)) };
}
