import { LIMITS, PackImportError, parseModernMap, readTexturePack, type ModernMap } from './PackImport';
import type { PackInfo, ResourceManager } from './ResourceManager';

export type PackImportResult = { ok: true; name: string; info: PackInfo; notes: string[] } | { ok: false; error: string };

/** The 1.6+ name table, loaded the first time a pack is imported. */
let modernMap: Promise<ModernMap> | null = null;

function loadModernMap(): Promise<ModernMap> {
  modernMap ??= import('./ModernPackMap').then((m) => parseModernMap(m.MODERN_TEXTURES, m.CLASSIC_SIZES));
  return modernMap;
}

/** Imports a .zip the player chose (file picker or drop) into the pack list. */
export async function importTexturePackFile(rm: ResourceManager, file: File): Promise<PackImportResult> {
  if (!/\.zip$/i.test(file.name)) return { ok: false, error: 'not a .zip file' };
  if (file.size > LIMITS.zipBytes) return { ok: false, error: `larger than ${LIMITS.zipBytes >> 20} MB` };
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, error: 'the file could not be read' };
  }
  return importTexturePackBytes(rm, file.name, bytes);
}

/** Checks, converts and stores a texture pack .zip. */
export async function importTexturePackBytes(rm: ResourceManager, fileName: string, bytes: Uint8Array): Promise<PackImportResult> {
  try {
    const pack = readTexturePack(fileName, bytes, await loadModernMap());
    const info = await rm.addUserPack(pack);
    console.info(`[packs] added ${pack.name}: ${pack.files.size} files, ${(pack.bytes / 1048576).toFixed(1)} MB${pack.notes.length ? '; ' + pack.notes.join('; ') : ''}`);
    return { ok: true, name: pack.name, info, notes: pack.notes };
  } catch (e) {
    if (e instanceof PackImportError) return { ok: false, error: e.message };
    const name = e instanceof DOMException ? e.name : '';
    if (name === 'QuotaExceededError') return { ok: false, error: 'not enough browser storage' };
    console.warn('[packs] import failed', e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
