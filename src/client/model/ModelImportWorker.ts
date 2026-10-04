import { canvasCodec, importModel } from './ModelImportPipeline';
import { ModelImportError } from './SourceScene';

/** Import Model... off the main thread: files in, a model file (or a message) out. */
self.onmessage = async (ev: MessageEvent<{ files: { name: string; bytes: Uint8Array }[] }>) => {
  try {
    const r = await importModel(ev.data.files, canvasCodec);
    (self as unknown as Worker).postMessage({ ok: true, bytes: r.bytes, name: r.name, warnings: r.warnings, report: r.report }, [r.bytes.buffer as ArrayBuffer]);
  } catch (e) {
    const known = e instanceof ModelImportError;
    if (!known) console.error('[models] import failed', e);
    (self as unknown as Worker).postMessage({ ok: false, error: known ? e.message : `The model could not be imported (${e instanceof Error ? e.message : String(e)}).` });
  }
};
