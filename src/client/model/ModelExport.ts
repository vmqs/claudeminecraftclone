import { downloadFile } from '../../world/storage/WorldTransfer';
import { exportFileName, exportGlb, withStandardTextures } from './GlbExport';
import { encodePlayerModel, type ModelTexture } from './PlayerModelFormat';
import { PlayerModels, STEVE_KEY, type ModelKey } from './PlayerModels';

export type ExportKind = 'mcpm' | 'glb';

export interface ExportOutcome {
  ok: boolean;
  file?: string;
  bytes?: number;
  error?: string;
}

/** The last exported file (automation cannot see downloads: `mc.dev.models.lastExport()`). */
export const exportLog: { last: { kind: ExportKind; file: string; bytes: Uint8Array } | null } = { last: null };

/**
 * The Account Manager's "Export .mcpm" / "Export .glb": saves the chosen model (built-in or
 * imported) as the game's own model file (what the Forge 1.8.9 mod in mods/forge-1.8.9 loads
 * from config/polymodels/) or as binary glTF for Blender and other tools (GlbExport). WebP
 * textures are re-encoded as PNG first so every reader can open them.
 */
export async function exportModel(key: ModelKey, kind: ExportKind, save = downloadFile): Promise<ExportOutcome> {
  if (key === STEVE_KEY) return { ok: false, error: 'Steve is not a model file' };
  const data = await PlayerModels.whenLoaded(key);
  const raw = PlayerModels.bytesFor(key);
  if (!data || !raw) return { ok: false, error: PlayerModels.errorOf(key) || 'The model could not be loaded' };
  const standard = await withStandardTextures(data, webpToPng);
  const bytes = kind === 'mcpm' ? (standard === data ? raw : encodePlayerModel(standard)) : exportGlb(standard);
  const file = exportFileName(PlayerModels.nameOf(key), kind);
  save(bytes, file, kind === 'glb' ? 'model/gltf-binary' : 'application/octet-stream');
  exportLog.last = { kind, file, bytes };
  return { ok: true, file, bytes: bytes.length };
}

/** Re-encodes a texture as PNG with the browser's codecs (null when it cannot be read). */
async function webpToPng(t: ModelTexture): Promise<Uint8Array | null> {
  const bmp = await createImageBitmap(new Blob([t.bytes as BlobPart], { type: t.mime }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  try {
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bmp.close();
  }
}
