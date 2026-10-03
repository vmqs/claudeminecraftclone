import { unzipSync } from 'fflate';

/**
 * Reads a texture pack .zip the player picked (no DOM, so it runs under Node too).
 *
 * 1.5 packs (textures/blocks, textures/items, gui/, mob/, ...) are kept as they are. 1.6+
 * resource packs (assets/minecraft/textures/...) are converted with a name table
 * (src/assets/ModernPackMap.ts): block and item textures, GUI, entities, environment, fonts
 * and colour maps that exist in 1.5.2 move to their 1.5.2 paths, animations described by
 * .png.mcmeta become 1.5.2 .txt frame lists, and anything else (models, sounds, shaders,
 * textures with a different layout) is left out. A pack without textures/ afterwards is shown
 * as "Incompatible", like 1.5.2 showed pre-1.5 packs.
 *
 * Everything is checked before use: archive and file sizes, file counts, paths (no "..",
 * no absolute paths), file types and PNG headers; a broken archive is refused with a message.
 */

export const LIMITS = {
  /** The .zip itself. */
  zipBytes: 192 * 1024 * 1024,
  /** One unpacked file. */
  fileBytes: 32 * 1024 * 1024,
  /** All unpacked files that are kept. */
  totalBytes: 256 * 1024 * 1024,
  /** Entries looked at in the archive. */
  entries: 20000,
};

export interface ImportedPack {
  /** The file name without .zip. */
  name: string;
  /** pack.txt (or the 1.6+ pack.mcmeta description), as 1.5.2 shows it: two lines. */
  description: string;
  /** 'classic': a 1.5 texture pack; 'modern': converted from a 1.6+ resource pack. */
  layout: 'classic' | 'modern';
  /** TexturePackCustom.isCompatible: something under textures/. */
  compatible: boolean;
  /** 1.5.2 path -> bytes. */
  files: Map<string, Uint8Array>;
  /** What was converted or left out, for the log and the pack list. */
  notes: string[];
  /** Sum of the kept files. */
  bytes: number;
}

export class PackImportError extends Error {}

/** Top-level folders and files of a 1.5.2 texture pack (the client jar's resource layout). */
const CLASSIC_DIRS = ['textures/blocks/', 'textures/items/', 'achievement/', 'armor/', 'art/', 'environment/', 'font/', 'gui/', 'item/', 'misc/', 'mob/', 'title/'];
const CLASSIC_FILES = new Set(['pack.png', 'pack.txt', 'particles.png']);
const CLASSIC_EXT = /\.(png|txt|bin)$/i;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Width and height from a PNG's IHDR, or null when it is not a PNG. */
export function pngSize(data: Uint8Array): { width: number; height: number } | null {
  if (data.length < 24) return null;
  for (let i = 0; i < 8; i++) if (data[i] !== PNG_SIGNATURE[i]) return null;
  if (String.fromCharCode(data[12], data[13], data[14], data[15]) !== 'IHDR') return null;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width = dv.getUint32(16);
  const height = dv.getUint32(20);
  if (width === 0 || height === 0 || width > 16384 || height > 16384) return null;
  return { width, height };
}

/** Normalises a zip entry name; null for directories, hidden files and anything unsafe. */
function cleanPath(name: string): string | null {
  const p = name.replace(/\\/g, '/').replace(/^\.\//, '');
  if (p.endsWith('/') || p.startsWith('/') || /^[a-z]:/i.test(p)) return null;
  const parts = p.split('/');
  for (const s of parts) if (s === '' || s === '.' || s === '..' || s.startsWith('.') || s === '__MACOSX') return null;
  if (/[\u0000-\u001f]/.test(p)) return null;
  return p;
}

/** Packs zipped with their folder: the folder that holds pack.txt / textures / assets. */
function findRoot(paths: string[]): string {
  const marker = (prefix: string) =>
    paths.some((p) => {
      if (!p.startsWith(prefix)) return false;
      const rest = p.slice(prefix.length);
      return rest === 'pack.txt' || rest === 'pack.mcmeta' || rest === 'pack.png' || rest.startsWith('textures/') || rest.startsWith('assets/') || rest.startsWith('gui/') || rest.startsWith('mob/');
    });
  let prefix = '';
  for (let depth = 0; depth < 3 && !marker(prefix); depth++) {
    const tops = new Set(paths.filter((p) => p.startsWith(prefix) && p.length > prefix.length).map((p) => p.slice(prefix.length).split('/')[0]));
    const only = tops.size === 1 ? [...tops][0] : null;
    if (only === null || !paths.some((p) => p.startsWith(prefix + only + '/'))) break;
    prefix += only + '/';
  }
  return prefix;
}

const textDecoder = new TextDecoder('utf-8');

/** The text of a 1.6+ description (a string or a JSON text component). */
function componentText(c: unknown, depth = 0): string {
  if (depth > 8 || c === null || c === undefined) return '';
  if (typeof c === 'string') return c;
  if (typeof c === 'number' || typeof c === 'boolean') return String(c);
  if (Array.isArray(c)) return c.map((x) => componentText(x, depth + 1)).join('');
  if (typeof c === 'object') {
    const o = c as { text?: unknown; translate?: unknown; extra?: unknown };
    return componentText(o.text ?? o.translate ?? '', depth + 1) + componentText(o.extra ?? '', depth + 1);
  }
  return '';
}

/** 1.6+ .png.mcmeta animation -> 1.5.2 animation .txt ("0*2,1*2,..."), or null. */
export function mcmetaToFrames(json: string, frameCount: number): string | null {
  let meta: unknown;
  try {
    meta = JSON.parse(json);
  } catch {
    return null;
  }
  const anim = (meta as { animation?: { frametime?: unknown; frames?: unknown } } | null)?.animation;
  if (!anim || typeof anim !== 'object') return null;
  const time = typeof anim.frametime === 'number' && anim.frametime >= 1 ? Math.min(1000, Math.trunc(anim.frametime)) : 1;
  const out: string[] = [];
  if (Array.isArray(anim.frames)) {
    for (const f of anim.frames.slice(0, 599)) {
      let index: unknown = f;
      let t = time;
      if (f && typeof f === 'object') {
        index = (f as { index?: unknown }).index;
        const ft = (f as { time?: unknown }).time;
        if (typeof ft === 'number' && ft >= 1) t = Math.min(1000, Math.trunc(ft));
      }
      if (typeof index !== 'number' || index < 0 || index >= frameCount) continue;
      out.push(`${Math.trunc(index)}*${t}`);
    }
  } else {
    if (time === 1) return null;
    for (let i = 0; i < Math.min(frameCount, 599); i++) out.push(`${i}*${time}`);
  }
  return out.length > 0 ? out.join(',') : null;
}

/** The 1.6+ -> 1.5.2 name table, parsed once. */
export interface ModernMap {
  textures: Map<string, string[]>;
  sizes: Map<string, [number, number]>;
}

export function parseModernMap(textures: string, sizes: string): ModernMap {
  const expand = (t: string) => (t.startsWith('b:') ? 'textures/blocks/' + t.slice(2) : t.startsWith('i:') ? 'textures/items/' + t.slice(2) : t) + '.png';
  const map: ModernMap = { textures: new Map(), sizes: new Map() };
  for (const line of textures.split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) map.textures.set(line.slice(0, eq) + '.png', line.slice(eq + 1).split(',').map(expand));
  }
  for (const line of sizes.split('\n')) {
    const m = /^(.+)=(\d+)x(\d+)$/.exec(line);
    if (m) map.sizes.set(m[1] + '.png', [Number(m[2]), Number(m[3])]);
  }
  return map;
}

/**
 * Unpacks and checks a texture pack. `modern` is the name table for 1.6+ packs (the caller
 * loads it lazily; without it such packs come out with no textures).
 */
export function readTexturePack(fileName: string, zip: Uint8Array, modern: ModernMap | null): ImportedPack {
  const name = fileName.replace(/\.zip$/i, '').replace(/[\u0000-\u001f]/g, '').slice(0, 128) || 'Texture pack';
  if (zip.length > LIMITS.zipBytes) throw new PackImportError(`the file is larger than ${LIMITS.zipBytes >> 20} MB`);
  if (zip.length < 22 || zip[0] !== 0x50 || zip[1] !== 0x4b) throw new PackImportError('not a .zip file');
  const notes: string[] = [];
  let entries = 0;
  let declared = 0;
  let skippedLarge = 0;
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(zip, {
      filter: (f) => {
        if (++entries > LIMITS.entries) return false;
        if (f.compression !== 0 && f.compression !== 8) return false;
        const p = cleanPath(f.name);
        if (p === null || !/\.(png|txt|bin|mcmeta)$/i.test(p)) return false;
        if (f.originalSize > LIMITS.fileBytes) {
          skippedLarge++;
          return false;
        }
        if (declared + f.originalSize > LIMITS.totalBytes) {
          skippedLarge++;
          return false;
        }
        declared += f.originalSize;
        return true;
      },
    });
  } catch (e) {
    throw new PackImportError(`the archive could not be read (${e instanceof Error ? e.message : String(e)})`);
  }
  if (entries > LIMITS.entries) notes.push(`only the first ${LIMITS.entries} entries were read`);
  if (skippedLarge > 0) notes.push(`${skippedLarge} oversized files left out`);
  const byPath = new Map<string, Uint8Array>();
  for (const [n, data] of Object.entries(raw)) {
    const p = cleanPath(n);
    if (p !== null && data.length <= LIMITS.fileBytes) byPath.set(p, data);
  }
  const root = findRoot([...byPath.keys()]);
  const files = new Map<string, Uint8Array>();
  for (const [p, data] of byPath) if (p.startsWith(root)) files.set(p.slice(root.length), data);

  const modernLayout = [...files.keys()].some((p) => p.startsWith('assets/minecraft/'));
  const pack: ImportedPack = { name, description: '', layout: modernLayout ? 'modern' : 'classic', compatible: false, files: new Map(), notes, bytes: 0 };
  if (modernLayout) convertModern(files, pack, modern);
  else keepClassic(files, pack);
  for (const d of pack.files.values()) pack.bytes += d.length;
  pack.compatible = [...pack.files.keys()].some((p) => p.startsWith('textures/'));
  if (pack.files.size === 0) throw new PackImportError(modernLayout ? 'no textures 1.5.2 can use' : 'no texture pack files in it');
  return pack;
}

/** A PNG that decodes as one (header check); texture atlas icons must be square or a vertical strip. */
function validPng(data: Uint8Array, icon: boolean): boolean {
  const size = pngSize(data);
  if (!size) return false;
  return !icon || (size.height % size.width === 0 && size.height / size.width <= 1024);
}

function isIconPath(p: string): boolean {
  return p.startsWith('textures/blocks/') || p.startsWith('textures/items/');
}

function keepClassic(files: Map<string, Uint8Array>, pack: ImportedPack): void {
  let skipped = 0;
  let broken = 0;
  for (const [p, data] of files) {
    const known = CLASSIC_FILES.has(p) || CLASSIC_DIRS.some((d) => p.startsWith(d));
    if (!known || !CLASSIC_EXT.test(p)) {
      skipped++;
      continue;
    }
    if (p.toLowerCase().endsWith('.png') && !validPng(data, isIconPath(p))) {
      broken++;
      continue;
    }
    pack.files.set(p, data);
  }
  const txt = files.get('pack.txt');
  if (txt) pack.description = textDecoder.decode(txt.subarray(0, 4096)).trim();
  if (files.has('terrain.png') && ![...files.keys()].some((p) => p.startsWith('textures/'))) pack.notes.push('a pre-1.5 pack: terrain.png and gui/items.png are not used by 1.5.2');
  if (skipped > 0) pack.notes.push(`${skipped} files 1.5.2 does not use left out`);
  if (broken > 0) pack.notes.push(`${broken} broken or misshapen images left out`);
}

function convertModern(files: Map<string, Uint8Array>, pack: ImportedPack, modern: ModernMap | null): void {
  const PREFIX = 'assets/minecraft/textures/';
  let format = 1;
  const mcmeta = files.get('pack.mcmeta');
  if (mcmeta) {
    try {
      const meta = JSON.parse(textDecoder.decode(mcmeta.subarray(0, 65536))) as { pack?: { description?: unknown; pack_format?: unknown } };
      pack.description = componentText(meta.pack?.description).trim();
      if (typeof meta.pack?.pack_format === 'number') format = meta.pack.pack_format;
    } catch {
      pack.notes.push('pack.mcmeta is not valid JSON');
    }
  }
  const icon = files.get('pack.png');
  if (icon && validPng(icon, false)) pack.files.set('pack.png', icon);
  let converted = 0;
  let unknown = 0;
  let misshapen = 0;
  // Chests were redrawn with a new layout in 1.15 (pack format 5).
  const skip = (p: string) => format >= 5 && p.startsWith('entity/chest/');
  for (const [p, data] of files) {
    if (!p.startsWith(PREFIX) || !p.toLowerCase().endsWith('.png')) continue;
    const rel = p.slice(PREFIX.length);
    const targets = modern?.textures.get(rel);
    if (!targets || skip(rel)) {
      unknown++;
      continue;
    }
    const size = pngSize(data);
    let used = false;
    for (const t of targets) {
      const iconTarget = isIconPath(t);
      const want = modern?.sizes.get(t);
      const fits = size !== null && (iconTarget ? validPng(data, true) : !want || want[0] * size.height === want[1] * size.width);
      if (!fits) continue;
      pack.files.set(t, data);
      used = true;
      const anim = files.get(p + '.mcmeta');
      if (iconTarget && anim && size) {
        const frames = mcmetaToFrames(textDecoder.decode(anim.subarray(0, 65536)), Math.trunc(size.height / size.width));
        if (frames) pack.files.set(t.replace(/\.png$/, '.txt'), new TextEncoder().encode(frames));
      }
    }
    if (used) converted++;
    else misshapen++;
  }
  pack.notes.push(`converted from a 1.6+ resource pack (format ${format}): ${converted} textures`);
  if (unknown > 0) pack.notes.push(`${unknown} textures 1.5.2 has no place for left out`);
  if (misshapen > 0) pack.notes.push(`${misshapen} textures with a different layout left out`);
}
