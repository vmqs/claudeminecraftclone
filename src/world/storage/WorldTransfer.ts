import { unzipSync, zipSync, type Zippable } from 'fflate';
import { NBT, NBTError, gzipInflate, readCompressedNBT, zlibDeflate } from './NBT';
import { encodeRegion, parseRegionFileName, readRegionPayloads, regionFileName, type RegionChunk } from './RegionFile';
import type { SaveFormat } from './SaveFormat';

/**
 * Worlds in and out of the browser as a .zip of a 1.5.2 save folder:
 *   <folder>/level.dat               gzip NBT {Data: {...,Player}}
 *   <folder>/region/r.<x>.<z>.mca    Anvil regions, chunks zlib-compressed
 *   <folder>/players/<name>.dat      (when present), data/*.dat (when present)
 * so an exported world opens in Minecraft 1.5.2 and a world zipped from a real saves folder can
 * be played here. Imports are checked defensively: size limits, a readable level.dat, and only
 * the files a 1.5.2 overworld uses; anything wrong ends in an ImportError with a reason.
 */

export class ImportError extends Error {}

/** Largest .zip accepted. */
export const MAX_ZIP_BYTES = 512 * 1024 * 1024;
/** Largest single file inside it (uncompressed) and in total. */
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
const MAX_ENTRIES = 20000;

/** Characters a folder name may not have, as GuiCreateWorld's checks (and zip paths) need. */
const ILLEGAL = /[./"\\:*?<>|\u0000-\u001f]/g;
const RESERVED = ['CON', 'COM', 'PRN', 'AUX', 'CLOCK$', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];

/** A folder name for an imported world: the zip's folder (else the level name), made unique. */
export function importFolderName(base: string, taken: (name: string) => boolean): string {
  let name = base.trim().replace(ILLEGAL, '_').slice(0, 60);
  if (name.length === 0) name = 'World';
  if (RESERVED.includes(name.toUpperCase())) name = '_' + name + '_';
  while (taken(name)) name += '-';
  return name;
}

/**
 * The save folder as a zip. `onProgress` gets 0-100. Chunks are grouped into region files with
 * their stored payloads (no recompression).
 */
export async function exportWorld(saves: SaveFormat, folder: string, onProgress?: (p: number) => void): Promise<Uint8Array> {
  const backend = saves.backend;
  const files: Zippable = {};
  const paths = await backend.listFiles(folder);
  if (!paths.includes('level.dat')) throw new ImportError(`The world "${folder}" has no level.dat`);
  for (const path of paths) {
    const data = await backend.getFile(folder, path);
    if (data) files[`${folder}/${path}`] = [data, { level: 0 }];
  }
  const regions = new Map<string, RegionChunk[]>();
  const positions = await backend.chunkPositions(folder);
  const now = Math.floor(Date.now() / 1000);
  let n = 0;
  for (const [cx, cz] of positions) {
    const data = await backend.getChunk(folder, cx, cz);
    if (!data) continue;
    const key = regionFileName(cx >> 5, cz >> 5);
    let list = regions.get(key);
    if (!list) regions.set(key, (list = []));
    list.push({ x: cx & 31, z: cz & 31, data, timestamp: now });
    if (++n % 64 === 0) onProgress?.(Math.floor((n * 80) / Math.max(1, positions.length)));
  }
  for (const [name, chunks] of regions) files[`${folder}/region/${name}`] = [encodeRegion(chunks), { level: 1 }];
  onProgress?.(90);
  await new Promise((r) => setTimeout(r, 0));
  const zip = zipSync(files, { mtime: new Date() });
  onProgress?.(100);
  return zip;
}

/** What an import added. */
export interface ImportResult {
  folder: string;
  name: string;
  chunks: number;
}

/**
 * Adds a zipped save folder to the world list. The world folder is the directory holding the
 * shallowest level.dat (the zip of a saves/<world> folder, or of its contents).
 */
export async function importWorld(saves: SaveFormat, zip: Uint8Array, fileName: string, onProgress?: (p: number) => void): Promise<ImportResult> {
  if (zip.length > MAX_ZIP_BYTES) throw new ImportError('The file is too large (more than 512 MB)');
  if (zip.length < 22 || zip[0] !== 0x50 || zip[1] !== 0x4b) throw new ImportError('This is not a .zip file');
  let entries: { name: string; originalSize: number }[] = [];
  try {
    unzipSync(zip, {
      filter: (f) => {
        entries.push({ name: f.name, originalSize: f.originalSize });
        return false;
      },
    });
  } catch (e) {
    throw new ImportError(`The .zip file is damaged (${(e as Error).message})`);
  }
  if (entries.length > MAX_ENTRIES) throw new ImportError('The .zip file has too many files');
  entries = entries.filter((e) => !e.name.endsWith('/') && !e.name.split('/').includes('__MACOSX'));
  const levels = entries.filter((e) => e.name === 'level.dat' || e.name.endsWith('/level.dat')).sort((a, b) => a.name.split('/').length - b.name.split('/').length);
  if (levels.length === 0) {
    if (entries.some((e) => e.name.endsWith('.mcr'))) throw new ImportError('This world is in the old McRegion format: open it in Minecraft 1.5.2 once to convert it');
    throw new ImportError('There is no level.dat in this .zip');
  }
  const root = levels[0].name.slice(0, levels[0].name.length - 'level.dat'.length);
  // Only what a 1.5.2 overworld save holds; the Nether and the End (DIM-1, DIM1) are not played here.
  const wanted = (name: string): boolean => {
    if (!name.startsWith(root)) return false;
    const rel = name.slice(root.length);
    return rel === 'level.dat' || rel === 'level.dat_old' || /^region\/r\.-?\d+\.-?\d+\.mca$/.test(rel) || /^players\/[^/]{1,64}\.dat$/.test(rel) || /^data\/[^/]{1,64}\.dat$/.test(rel);
  };
  let total = 0;
  for (const e of entries) {
    if (!wanted(e.name)) continue;
    if (e.originalSize > MAX_ENTRY_BYTES) throw new ImportError(`${e.name} is too large`);
    total += e.originalSize;
  }
  if (total > MAX_TOTAL_BYTES) throw new ImportError('The world is too large to import (more than 1 GB)');
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip, { filter: (f) => wanted(f.name) && f.originalSize <= MAX_ENTRY_BYTES });
  } catch (e) {
    throw new ImportError(`The .zip file is damaged (${(e as Error).message})`);
  }
  onProgress?.(10);
  const rel = (name: string) => name.slice(root.length);
  let levelBytes = files[root + 'level.dat'];
  let data;
  try {
    data = NBT.getCompoundTag(readCompressedNBT(levelBytes), 'Data');
    if (!NBT.hasKey(data, 'RandomSeed')) throw new NBTError('level.dat has no world data');
  } catch (e) {
    const old = files[root + 'level.dat_old'];
    if (!old) throw new ImportError(`level.dat cannot be read (${(e as Error).message})`);
    try {
      data = NBT.getCompoundTag(readCompressedNBT(old), 'Data');
      levelBytes = old;
    } catch {
      throw new ImportError(`level.dat cannot be read (${(e as Error).message})`);
    }
  }
  const hasAnvil = Object.keys(files).some((n) => n.endsWith('.mca'));
  if (!hasAnvil && (NBT.getInteger(data, 'version') === 19132 || entries.some((e) => e.name.startsWith(root) && e.name.endsWith('.mcr')))) {
    throw new ImportError('This world is in the old McRegion format: open it in Minecraft 1.5.2 once to convert it');
  }
  const levelName = NBT.getString(data, 'LevelName') || 'World';
  const dir = root.replace(/\/$/, '').split('/').pop() || fileName.replace(/\.zip$/i, '') || levelName;
  const folder = importFolderName(dir, (n) => saves.getWorldInfo(n) !== null || saves.isFolderTaken(n));
  const backend = saves.backend;
  // Chunks first, so the world only appears in the list once it is complete.
  const regionNames = Object.keys(files).filter((n) => rel(n).startsWith('region/'));
  let chunkCount = 0;
  try {
    for (let i = 0; i < regionNames.length; i++) {
      const r = parseRegionFileName(rel(regionNames[i]).slice('region/'.length));
      if (!r) continue;
      let payloads;
      try {
        payloads = readRegionPayloads(files[regionNames[i]]);
      } catch {
        continue;
      }
      const batch: { cx: number; cz: number; data: Uint8Array }[] = [];
      for (const p of payloads) {
        let stored: Uint8Array = p.payload.slice();
        if (p.kind === 1) {
          try {
            stored = zlibDeflate(gzipInflate(p.payload));
          } catch {
            continue;
          }
        }
        batch.push({ cx: r.rx * 32 + p.x, cz: r.rz * 32 + p.z, data: stored });
      }
      await backend.putChunks(folder, batch);
      chunkCount += batch.length;
      onProgress?.(10 + Math.floor(((i + 1) * 80) / Math.max(1, regionNames.length)));
    }
    const other = new Map<string, Uint8Array | null>();
    for (const name of Object.keys(files)) {
      const r = rel(name);
      if (r.startsWith('players/') || r.startsWith('data/')) other.set(r, files[name]);
    }
    // A clean level.dat last: the world becomes visible only now.
    other.set('level.dat', levelBytes);
    await backend.putFiles(folder, other);
  } catch (e) {
    await backend.deleteFolder(folder).catch(() => undefined);
    throw new ImportError(`The world could not be stored (${(e as Error).message})`);
  }
  await saves.noteWorld(folder);
  onProgress?.(100);
  return { folder, name: levelName, chunks: chunkCount };
}

/** Lets the browser save `bytes` as a file. */
export function downloadFile(bytes: Uint8Array, name: string, type = 'application/zip'): void {
  const blob = new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Opens the browser's file picker for one file (null when cancelled). */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    let settled = false;
    const finish = (f: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(f);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}
