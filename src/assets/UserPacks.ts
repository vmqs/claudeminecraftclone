import type { ImportedPack } from './PackImport';

/** What the pack list needs of an imported pack without loading its files. */
export interface UserPackMeta {
  /** "user:<random>", never a bundled pack id. */
  id: string;
  name: string;
  description: string;
  layout: 'classic' | 'modern';
  compatible: boolean;
  notes: string[];
  bytes: number;
  added: number;
  /** Every file path (1.5.2 layout). */
  paths: string[];
  /** pack.png, if any. */
  icon: Blob | null;
}

interface FilesRecord {
  id: string;
  files: [string, Blob][];
}

const DB_NAME = 'mc152.texturepacks';
const META = 'meta';
const FILES = 'files';

function mimeOf(path: string): string {
  return path.endsWith('.png') ? 'image/png' : 'text/plain';
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  });
}

/**
 * Imported texture packs, kept in IndexedDB (one record with the list data and pack.png,
 * one with the files as Blobs). Where IndexedDB is unavailable (private windows of some
 * browsers) the packs live in memory until the page is closed, and `persistent` is false.
 */
export class UserPackStore {
  private memory = new Map<string, { meta: UserPackMeta; files: [string, Blob][] }>();

  private constructor(
    private readonly db: IDBDatabase | null,
    readonly persistent: boolean,
  ) {}

  static async open(): Promise<UserPackStore> {
    try {
      if (typeof indexedDB === 'undefined') return new UserPackStore(null, false);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES, { keyPath: 'id' });
      };
      const db = await Promise.race([request(req), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('IndexedDB timed out')), 5000))]);
      return new UserPackStore(db, true);
    } catch (e) {
      console.warn('[packs] IndexedDB unavailable, imported packs last for this session only', e);
      return new UserPackStore(null, false);
    }
  }

  async list(): Promise<UserPackMeta[]> {
    let all: UserPackMeta[];
    if (!this.db) all = [...this.memory.values()].map((v) => v.meta);
    else all = await request(this.db.transaction(META, 'readonly').objectStore(META).getAll() as IDBRequest<UserPackMeta[]>);
    return all.filter((m) => m && typeof m.id === 'string' && Array.isArray(m.paths)).sort((a, b) => a.added - b.added);
  }

  async files(id: string): Promise<Map<string, Blob> | null> {
    let rec: FilesRecord | undefined;
    if (!this.db) {
      const m = this.memory.get(id);
      rec = m ? { id, files: m.files } : undefined;
    } else {
      rec = await request(this.db.transaction(FILES, 'readonly').objectStore(FILES).get(id) as IDBRequest<FilesRecord | undefined>);
    }
    if (!rec || !Array.isArray(rec.files)) return null;
    return new Map(rec.files.filter(([p, b]) => typeof p === 'string' && b instanceof Blob));
  }

  async add(pack: ImportedPack): Promise<UserPackMeta> {
    const id = 'user:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const files: [string, Blob][] = [...pack.files].map(([p, d]) => [p, new Blob([d as Uint8Array<ArrayBuffer>], { type: mimeOf(p) })]);
    const icon = files.find(([p]) => p === 'pack.png')?.[1] ?? null;
    const meta: UserPackMeta = {
      id,
      name: pack.name,
      description: pack.description,
      layout: pack.layout,
      compatible: pack.compatible,
      notes: pack.notes,
      bytes: pack.bytes,
      added: Date.now(),
      paths: files.map(([p]) => p),
      icon,
    };
    if (!this.db) {
      this.memory.set(id, { meta, files });
      return meta;
    }
    const tx = this.db.transaction([META, FILES], 'readwrite');
    tx.objectStore(FILES).put({ id, files } satisfies FilesRecord);
    tx.objectStore(META).put(meta);
    await done(tx);
    return meta;
  }

  async remove(id: string): Promise<void> {
    if (!this.db) {
      this.memory.delete(id);
      return;
    }
    const tx = this.db.transaction([META, FILES], 'readwrite');
    tx.objectStore(META).delete(id);
    tx.objectStore(FILES).delete(id);
    await done(tx);
  }
}
