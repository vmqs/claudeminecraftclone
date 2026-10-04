import { isFbx, parseFbx } from './FbxParser';
import { isGlb, parseGltf } from './GltfParser';
import type { RgbaImage } from './ImageCodecs';
import { buildPlayerModel, type BuildReport, type ImageCodec } from './ModelBuilder';
import { MODEL_EXT, ModelFiles } from './ModelFiles';
import { parseObj } from './ObjParser';
import { cleanText, decodePlayerModel, encodePlayerModel, FORMAT_LIMITS, isPlayerModelFile } from './PlayerModelFormat';
import { MAX_NET_MODEL_BYTES } from './PlayerModels';
import { IMPORT_LIMITS, ModelImportError, stemOf, type SourceScene } from './SourceScene';

export interface ImportResult {
  bytes: Uint8Array;
  name: string;
  report: BuildReport | null;
  warnings: string[];
}

/**
 * The whole import of user files (Import Model...): unpack .zip files, pick the model file (GLB,
 * glTF, FBX, OBJ, or an already converted .mcpm), parse, build, and shrink the textures when the
 * result is too large to share with other players. Runs in a worker in the browser
 * (ModelImportWorker.ts); `codec` decodes and encodes images there.
 */
export async function importModel(input: { name: string; bytes: Uint8Array }[], codec: ImageCodec): Promise<ImportResult> {
  for (const f of input) {
    if (f.bytes.length > IMPORT_LIMITS.maxFileBytes) throw new ModelImportError(`${f.name} is larger than 30 MB.`);
  }
  const files = await ModelFiles.fromFiles(input);
  // An exported model file is used as it is (after the usual checks).
  const ready = files.paths.find((p) => p.endsWith('.mcpm'));
  if (ready) {
    const bytes = files.get(ready)!;
    if (!isPlayerModelFile(bytes)) throw new ModelImportError('That .mcpm file is not a player model.');
    let data;
    try {
      data = decodePlayerModel(bytes);
    } catch (e) {
      throw new ModelImportError(`That .mcpm file is damaged (${e instanceof Error ? e.message : e}).`);
    }
    return { bytes, name: data.name, report: null, warnings: [] };
  }
  const candidates = files.paths.filter((p) => MODEL_EXT.test(p));
  if (candidates.length === 0) throw new ModelImportError('No model found: choose a .glb, .gltf, .fbx or .obj file (or a .zip with one inside).');
  const rank = (p: string) => (p.endsWith('.glb') ? 0 : p.endsWith('.gltf') ? 1 : p.endsWith('.fbx') ? 2 : 3);
  candidates.sort((a, b) => rank(a) - rank(b) || files.get(b)!.length - files.get(a)!.length);
  const main = candidates[0];
  const bytes = files.get(main)!;
  let scene: SourceScene;
  try {
    if (isGlb(bytes) || main.endsWith('.gltf') || main.endsWith('.glb')) scene = parseGltf(bytes, files, main);
    else if (isFbx(bytes) || main.endsWith('.fbx')) scene = parseFbx(bytes);
    else scene = parseObj(bytes, files, main);
  } catch (e) {
    if (e instanceof ModelImportError) throw e;
    throw new ModelImportError(`${main} could not be read (${e instanceof Error ? e.message : String(e)}).`);
  }
  const name = cleanText(prettyName(stemOf(main)), FORMAT_LIMITS.maxName) || 'Model';
  const warnings: string[] = [];
  let result: { bytes: Uint8Array; report: BuildReport } | null = null;
  // Smaller textures until the model can be sent to other players.
  for (const max of [1024, 512, 256]) {
    const built = await buildPlayerModel(scene, files, codec, { name, credits: scene.info.join('; '), maxTextureSize: max });
    const out = encodePlayerModel(built.model);
    result = { bytes: out, report: built.report };
    if (out.length <= MAX_NET_MODEL_BYTES) break;
  }
  if (!result) throw new ModelImportError('The model could not be built.');
  if (result.bytes.length > MAX_NET_MODEL_BYTES) warnings.push(`At ${(result.bytes.length / 1048576).toFixed(1)} MB this model is too large to send: other players will see Steve (the limit is 3 MB).`);
  warnings.push(...result.report.warnings);
  // The game must accept its own output.
  decodePlayerModel(result.bytes);
  return { bytes: result.bytes, name, report: result.report, warnings };
}

function prettyName(stem: string): string {
  const s = stem.replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** Image decoding and encoding with OffscreenCanvas (browser main thread or worker). */
export const canvasCodec: ImageCodec = {
  async decode(bytes: Uint8Array, _name: string): Promise<RgbaImage | null> {
    let bmp: ImageBitmap;
    try {
      bmp = await createImageBitmap(new Blob([bytes as BlobPart]), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    } catch {
      return null;
    }
    try {
      if (bmp.width > 8192 || bmp.height > 8192) return null;
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bmp, 0, 0);
      const d = ctx.getImageData(0, 0, bmp.width, bmp.height);
      return { width: d.width, height: d.height, rgba: new Uint8Array(d.data.buffer, d.data.byteOffset, d.data.byteLength) };
    } finally {
      bmp.close();
    }
  },
  async encode(img: RgbaImage, opaque: boolean): Promise<{ mime: string; bytes: Uint8Array }> {
    const c = new OffscreenCanvas(img.width, img.height);
    const ctx = c.getContext('2d')!;
    const data = new ImageData(new Uint8ClampedArray(img.rgba.buffer as ArrayBuffer, img.rgba.byteOffset, img.rgba.byteLength), img.width, img.height);
    ctx.putImageData(data, 0, 0);
    const blob = await c.convertToBlob(opaque ? { type: 'image/jpeg', quality: 0.9 } : { type: 'image/png' });
    const mime = blob.type === 'image/jpeg' || blob.type === 'image/webp' ? blob.type : 'image/png';
    return { mime, bytes: new Uint8Array(await blob.arrayBuffer()) };
  },
};
