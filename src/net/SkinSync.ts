import { SKIN_BYTES } from '../client/skin/SkinImage';
import { isValidUsername } from './Username';

/**
 * Skins over the network, in Packet250CustomPayload on the `MC|Skin` channel (1.5.2 fetched
 * skins from a skin server by name; a LAN room has none, so players hand theirs to the host).
 *
 * - Guest to host: the guest's own skin as exactly 8192 bytes of 64x32 RGBA, or no bytes for
 *   Steve. It is sent after the login and again whenever the guest picks another skin.
 * - Host to guest: one player's skin, a name byte length, the name, then 8192 bytes of RGBA or
 *   nothing for Steve. The host relays every skin it accepted (its own included) to everyone.
 *
 * Only raw pixels travel: the PNG is decoded by its owner, and both sides check the exact size,
 * re-apply 1.5.2's skin processing (opaque body, hat layer rules) and use the result only as a
 * 64x32 texture, so a peer cannot send anything but a picture.
 */
export const SKIN_CHANNEL = 'MC|Skin';

/** Guest -> host. */
export function encodeOwnSkin(rgba: Uint8Array | null): Uint8Array {
  return rgba ? new Uint8Array(rgba) : new Uint8Array(0);
}

/** The guest's skin, null for Steve, or undefined when the data is not a skin. */
export function decodeOwnSkin(data: Uint8Array): Uint8Array | null | undefined {
  if (data.length === 0) return null;
  return data.length === SKIN_BYTES ? data : undefined;
}

/** Host -> guest. */
export function encodePlayerSkin(name: string, rgba: Uint8Array | null): Uint8Array {
  const n = new TextEncoder().encode(name);
  const out = new Uint8Array(1 + n.length + (rgba ? SKIN_BYTES : 0));
  out[0] = n.length;
  out.set(n, 1);
  if (rgba) out.set(rgba.subarray(0, SKIN_BYTES), 1 + n.length);
  return out;
}

/** A player's skin from the host, or null when the data is malformed. */
export function decodePlayerSkin(data: Uint8Array): { name: string; rgba: Uint8Array | null } | null {
  if (data.length < 1) return null;
  const len = data[0];
  if (len < 1 || len > 16 || data.length < 1 + len) return null;
  const name = new TextDecoder('utf-8', { fatal: false }).decode(data.subarray(1, 1 + len));
  if (!isValidUsername(name)) return null;
  const rest = data.length - 1 - len;
  if (rest === 0) return { name, rgba: null };
  if (rest !== SKIN_BYTES) return null;
  return { name, rgba: data.slice(1 + len) };
}
