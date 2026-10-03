import { bitmapToRGBA } from '../../assets/ResourceManager';
import { PlayerSkins } from './PlayerSkins';
import { SKIN_HEIGHT, SKIN_WIDTH, skinFromPixels, type SkinResult } from './SkinImage';

/**
 * Skins as files: reading an uploaded PNG, and keeping the user's skin in localStorage as a PNG
 * data URL (the launcher-era equivalent was the skin server). Browser only.
 */

const STORAGE_KEY = 'mc152.skin';
/** Uploads larger than this are refused before decoding (a 64x64 PNG is a few KiB). */
export const MAX_SKIN_FILE_BYTES = 512 * 1024;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function isPng(head: Uint8Array): boolean {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return head.length >= 8 && sig.every((v, i) => head[i] === v);
}

/** Decodes a PNG file into a 64x32 skin, or a message saying why it cannot be a skin. */
export async function readSkinFile(file: Blob): Promise<SkinResult> {
  if (file.size > MAX_SKIN_FILE_BYTES) return { ok: false, error: 'That file is too large to be a skin' };
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (!isPng(head)) return { ok: false, error: 'That file is not a PNG image' };
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  } catch {
    return { ok: false, error: 'That PNG image could not be read' };
  }
  try {
    if (bmp.width !== SKIN_WIDTH || (bmp.height !== 32 && bmp.height !== 64)) return skinFromPixels([], bmp.width, bmp.height);
    const img = bitmapToRGBA(bmp);
    return skinFromPixels(img.data, img.width, img.height);
  } finally {
    bmp.close();
  }
}

/** A 64x32 skin as a PNG data URL. */
export function skinToDataUrl(rgba: Uint8Array): string {
  const c = document.createElement('canvas');
  c.width = SKIN_WIDTH;
  c.height = SKIN_HEIGHT;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(SKIN_WIDTH, SKIN_HEIGHT);
  img.data.set(rgba);
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

/** Reads a skin from a data URL (the saved skin, or one handed in by automation). */
export async function readSkinDataUrl(url: string): Promise<SkinResult> {
  if (!url.startsWith('data:image/png;base64,')) return { ok: false, error: 'Not a PNG data URL' };
  const bin = atob(url.slice('data:image/png;base64,'.length));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return readSkinFile(new Blob([bytes], { type: 'image/png' }));
}

/** Keeps the user's skin for the next visit (null forgets it). */
export function saveSkin(rgba: Uint8Array | null): void {
  try {
    if (rgba) storage()?.setItem(STORAGE_KEY, skinToDataUrl(rgba));
    else storage()?.removeItem(STORAGE_KEY);
  } catch {
    /* storage full or blocked: the skin lasts for this visit */
  }
}

/** Loads the saved skin into PlayerSkins (in the background at start-up). */
export async function loadSavedSkin(): Promise<void> {
  let url: string | null = null;
  try {
    url = storage()?.getItem(STORAGE_KEY) ?? null;
  } catch {
    url = null;
  }
  if (!url) return;
  const r = await readSkinDataUrl(url);
  // A skin chosen while this one decoded wins.
  if (r.ok && PlayerSkins.local === null) PlayerSkins.setLocal(r.rgba);
  else if (!r.ok) console.warn('[skin] the saved skin could not be read:', r.error);
}

/**
 * Asks for a PNG with the browser's file picker. Resolves with null when the picker is closed
 * without a file (browsers that do not report that leave the promise pending, which is harmless).
 */
export function pickPngFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,.png';
    input.style.display = 'none';
    const done = (f: File | null) => {
      input.remove();
      resolve(f);
    };
    input.addEventListener('change', () => done(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => done(null), { once: true });
    document.body.appendChild(input);
    input.click();
  });
}
