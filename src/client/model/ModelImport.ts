import type { BuildReport } from './ModelBuilder';
import { ModelStore } from './ModelStore';
import { modelHash } from './PlayerModelFormat';
import { PlayerModels } from './PlayerModels';
import { refreshUserModels } from './PlayerModelsInstall';

export interface ImportOutcome {
  ok: boolean;
  /** The model key ('data:<hash>') on success. */
  key?: string;
  name?: string;
  error?: string;
  warnings?: string[];
  report?: BuildReport | null;
  bytes?: number;
}

/** File types Import Model... offers. */
export const MODEL_FILE_ACCEPT = '.glb,.gltf,.fbx,.obj,.mtl,.bin,.zip,.png,.jpg,.jpeg,.tga,.dds,.bmp,.webp,.mcpm';

/** Opens the file chooser for model files (several may be picked: .obj + .mtl + textures). */
export function pickModelFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = MODEL_FILE_ACCEPT;
    input.style.display = 'none';
    const done = (f: File[]) => {
      input.remove();
      resolve(f);
    };
    input.addEventListener('change', () => done([...(input.files ?? [])]), { once: true });
    input.addEventListener('cancel', () => done([]), { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Imports model files: parses and rigs them in a worker (the parsers load only then), stores the
 * result in IndexedDB and makes it known to the registry. Never throws.
 */
export async function importModelFiles(files: { name: string; bytes: Uint8Array }[]): Promise<ImportOutcome> {
  if (files.length === 0) return { ok: false, error: 'No files chosen' };
  type WorkerResult = { ok: boolean; bytes?: Uint8Array; name?: string; warnings?: string[]; error?: string; report?: BuildReport | null };
  let result: WorkerResult;
  try {
    const worker = new Worker(new URL('./ModelImportWorker.ts', import.meta.url), { type: 'module' });
    result = await new Promise<WorkerResult>((resolve) => {
      worker.onmessage = (ev) => resolve(ev.data);
      worker.onerror = (ev) => resolve({ ok: false, error: `The importer stopped (${ev.message || 'error'})` });
      worker.postMessage({ files });
    }).finally(() => worker.terminate());
  } catch (e) {
    return { ok: false, error: `The importer could not start (${e instanceof Error ? e.message : String(e)})` };
  }
  if (!result.ok || !result.bytes) return { ok: false, error: result.error ?? 'The model could not be imported' };
  const bytes = result.bytes;
  let key: string;
  try {
    key = PlayerModels.putData(bytes);
  } catch (e) {
    return { ok: false, error: `The converted model is invalid (${e instanceof Error ? e.message : String(e)})` };
  }
  const hash = modelHash(bytes);
  const name = result.name ?? 'Model';
  try {
    const store = await ModelStore.open();
    await store.put({ hash, name, credits: PlayerModels.dataFor(key)?.credits ?? '', size: bytes.length, added: Date.now() }, bytes);
    if (!store.persistent) result.warnings = [...(result.warnings ?? []), 'Models cannot be saved in this browser: it is kept until the page closes.'];
  } catch (e) {
    result.warnings = [...(result.warnings ?? []), `The model could not be saved (${e instanceof Error ? e.message : String(e)}).`];
  }
  await refreshUserModels();
  if (!PlayerModels.user.some((u) => u.hash === hash)) PlayerModels.user.push({ hash, name, credits: '', size: bytes.length, added: Date.now() });
  return { ok: true, key, name, warnings: result.warnings ?? [], report: result.report ?? null, bytes: bytes.length };
}

/** Deletes an imported model (Delete Model). */
export async function deleteUserModel(hash: string): Promise<void> {
  try {
    await (await ModelStore.open()).remove(hash);
  } catch (e) {
    console.warn('[models] could not delete', e);
  }
  PlayerModels.forgetUser(hash);
  await refreshUserModels();
}

/** Reads browser files into byte arrays (refusing huge ones before reading them). */
export async function readFiles(files: File[]): Promise<{ files: { name: string; bytes: Uint8Array }[]; error?: string }> {
  const out: { name: string; bytes: Uint8Array }[] = [];
  let total = 0;
  for (const f of files) {
    if (f.size > 30 * 1024 * 1024) return { files: [], error: `${f.name} is larger than 30 MB` };
    total += f.size;
    if (total > 60 * 1024 * 1024) return { files: [], error: 'The chosen files are larger than 60 MB together' };
    out.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
  }
  return { files: out };
}
