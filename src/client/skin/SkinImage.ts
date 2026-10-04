/**
 * Player skin pixels: the 64x32 layout 1.5.2's player model reads (head and hat on the top
 * rows, body, arms and legs below). A 64x64 skin from newer versions keeps that layout in its
 * top half, so its top 64x32 is used. Everything here is plain data (no DOM), so the network
 * layer and Node tests use it too.
 */

export const SKIN_WIDTH = 64;
export const SKIN_HEIGHT = 32;
/** Bytes of one skin as RGBA (what the network carries). */
export const SKIN_BYTES = SKIN_WIDTH * SKIN_HEIGHT * 4;

export type SkinResult = { ok: true; rgba: Uint8Array } | { ok: false; error: string };

/**
 * Takes decoded RGBA pixels of any size: 64x32 is used as it is, 64x64 gives its top half,
 * anything else is refused with a message for the player.
 */
export function skinFromPixels(data: ArrayLike<number>, width: number, height: number): SkinResult {
  if (width !== SKIN_WIDTH || (height !== 32 && height !== 64)) {
    return { ok: false, error: `Skins must be 64x32 or 64x64 pixels (this one is ${width}x${height})` };
  }
  if (data.length < width * height * 4) return { ok: false, error: 'The image data is incomplete' };
  const rgba = new Uint8Array(SKIN_BYTES);
  for (let i = 0; i < SKIN_BYTES; i++) rgba[i] = data[i];
  return { ok: true, rgba };
}

function alphaAt(rgba: Uint8Array, x: number, y: number): number {
  return rgba[(y * SKIN_WIDTH + x) * 4 + 3];
}

function hasTransparency(rgba: Uint8Array, x0: number, y0: number, x1: number, y1: number): boolean {
  for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) if (alphaAt(rgba, x, y) < 128) return true;
  return false;
}

function setAreaOpaque(rgba: Uint8Array, x0: number, y0: number, x1: number, y1: number): void {
  for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) rgba[(y * SKIN_WIDTH + x) * 4 + 3] = 255;
}

/** Clears the area's alpha unless something in it is already see-through. */
function setAreaTransparent(rgba: Uint8Array, x0: number, y0: number, x1: number, y1: number): void {
  if (hasTransparency(rgba, x0, y0, x1, y1)) return;
  for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) rgba[(y * SKIN_WIDTH + x) * 4 + 3] = 0;
}

/**
 * What 1.5.2 did to every downloaded skin (ImageBufferDownload): the head is made opaque; the
 * hat layer (the right half of the top rows) is cleared when the image has no see-through pixel
 * there, so a skin painted without a hat does not get a solid box around its head; the body,
 * arms and legs are made opaque. Returns a new array; the input is not changed.
 */
export function processSkin(input: Uint8Array): Uint8Array {
  if (input.length !== SKIN_BYTES) throw new Error(`a skin has ${SKIN_BYTES} bytes, not ${input.length}`);
  const rgba = new Uint8Array(input);
  setAreaOpaque(rgba, 0, 0, 32, 16);
  setAreaTransparent(rgba, 32, 0, 64, 32);
  setAreaOpaque(rgba, 0, 16, 64, 32);
  return rgba;
}

/** Whether two skins have the same pixels. */
export function sameSkin(a: Uint8Array | null, b: Uint8Array | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
