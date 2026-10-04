import { unzipSync } from 'fflate';
import { baseName, IMPORT_LIMITS, ModelImportError, stemOf } from './SourceScene';

/**
 * The files of one import: a single model file, several picked files, or the contents of a
 * .zip. Lookups ignore case and folders when the exact path is missing (exporters write
 * absolute Windows paths into OBJ, MTL and FBX files).
 */
export class ModelFiles {
  private readonly byPath = new Map<string, Uint8Array>();
  private readonly byBase = new Map<string, string>();

  add(path: string, bytes: Uint8Array): void {
    const p = normalisePath(path);
    if (!p || p.endsWith('/')) return;
    this.byPath.set(p, bytes);
    const b = baseName(p);
    if (!this.byBase.has(b)) this.byBase.set(b, p);
  }

  get paths(): string[] {
    return [...this.byPath.keys()];
  }

  /** The file at `path` (relative to `from`'s folder when given), else any file with its name. */
  get(path: string, from?: string): Uint8Array | null {
    let p = normalisePath(safeDecode(path));
    if (from) {
      const dir = normalisePath(from).replace(/[^/]*$/, '');
      const joined = resolveDots(dir + p);
      const hit = this.byPath.get(joined);
      if (hit) return hit;
    }
    p = resolveDots(p);
    const exact = this.byPath.get(p);
    if (exact) return exact;
    const b = this.byBase.get(baseName(p));
    return b ? this.byPath.get(b) ?? null : null;
  }

  /** The path of a file by name, if any. */
  findPath(path: string): string | null {
    const p = resolveDots(normalisePath(safeDecode(path)));
    if (this.byPath.has(p)) return p;
    return this.byBase.get(baseName(p)) ?? null;
  }

  /** Image files (by extension) with their lower-case stems. */
  images(): { path: string; stem: string }[] {
    return this.paths.filter((p) => IMAGE_EXT.test(p)).map((path) => ({ path, stem: stemOf(path) }));
  }

  /** Adds a file, unpacking .zip archives (nested ones too, once) within the size limits. */
  static async fromFiles(files: { name: string; bytes: Uint8Array }[]): Promise<ModelFiles> {
    const out = new ModelFiles();
    let total = 0;
    const addAll = (name: string, bytes: Uint8Array, depth: number): void => {
      if (/\.zip$/i.test(name) && depth < 2) {
        let entries: Record<string, Uint8Array>;
        try {
          entries = unzipSync(bytes, {
            filter: (f) => {
              total += f.originalSize;
              if (total > IMPORT_LIMITS.maxUnpackedBytes) throw new ModelImportError('The .zip unpacks to more than 120 MB.');
              return !f.name.endsWith('/') && !/(^|\/)__MACOSX\//.test(f.name);
            },
          });
        } catch (e) {
          if (e instanceof ModelImportError) throw e;
          throw new ModelImportError('The .zip file could not be read.');
        }
        for (const [n, b] of Object.entries(entries)) addAll(n, b, depth + 1);
        return;
      }
      out.add(name, bytes);
    };
    for (const f of files) addAll(f.name, f.bytes, 0);
    return out;
  }
}

export const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|tga|dds)$/i;
export const MODEL_EXT = /\.(glb|gltf|fbx|obj)$/i;

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function normalisePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^[a-z]:\//i, '/').replace(/^\.\//, '').replace(/^\/+/, '').toLowerCase();
}

function resolveDots(p: string): string {
  const out: string[] = [];
  for (const part of p.split('/')) {
    if (part === '.' || part === '') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}
