/**
 * Imported player models, kept in IndexedDB (a list record and the model file, by content hash).
 * Where IndexedDB is unavailable the models last for the session only (`persistent` false).
 * Browser only.
 */

export interface StoredModelMeta {
  /** modelHash of the file. */
  hash: string;
  name: string;
  credits: string;
  /** File size in bytes. */
  size: number;
  added: number;
}

interface DataRecord {
  hash: string;
  bytes: Uint8Array;
}

const DB_NAME = 'mc152.playermodels';
const META = 'meta';
const DATA = 'data';

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

export class ModelStore {
  private readonly memory = new Map<string, { meta: StoredModelMeta; bytes: Uint8Array }>();

  private constructor(
    private readonly db: IDBDatabase | null,
    readonly persistent: boolean,
  ) {}

  private static opening: Promise<ModelStore> | null = null;

  /** The store (opened once). */
  static open(): Promise<ModelStore> {
    this.opening ??= ModelStore.doOpen();
    return this.opening;
  }

  private static async doOpen(): Promise<ModelStore> {
    try {
      if (typeof indexedDB === 'undefined') return new ModelStore(null, false);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'hash' });
        if (!db.objectStoreNames.contains(DATA)) db.createObjectStore(DATA, { keyPath: 'hash' });
      };
      const db = await Promise.race([request(req), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('IndexedDB timed out')), 2000))]);
      return new ModelStore(db, true);
    } catch (e) {
      console.warn('[models] IndexedDB unavailable, imported models last for this session only', e);
      return new ModelStore(null, false);
    }
  }

  async list(): Promise<StoredModelMeta[]> {
    let all: StoredModelMeta[];
    if (!this.db) all = [...this.memory.values()].map((v) => v.meta);
    else {
      const tx = this.db.transaction(META, 'readonly');
      all = (await request(tx.objectStore(META).getAll())) as StoredModelMeta[];
    }
    return all.filter((m) => m && typeof m.hash === 'string').sort((a, b) => a.added - b.added);
  }

  async get(hash: string): Promise<Uint8Array | null> {
    if (!this.db) return this.memory.get(hash)?.bytes ?? null;
    const tx = this.db.transaction(DATA, 'readonly');
    const r = (await request(tx.objectStore(DATA).get(hash))) as DataRecord | undefined;
    return r?.bytes instanceof Uint8Array ? r.bytes : null;
  }

  async put(meta: StoredModelMeta, bytes: Uint8Array): Promise<void> {
    if (!this.db) {
      this.memory.set(meta.hash, { meta, bytes });
      return;
    }
    const tx = this.db.transaction([META, DATA], 'readwrite');
    tx.objectStore(META).put(meta);
    tx.objectStore(DATA).put({ hash: meta.hash, bytes } satisfies DataRecord);
    await done(tx);
  }

  async remove(hash: string): Promise<void> {
    if (!this.db) {
      this.memory.delete(hash);
      return;
    }
    const tx = this.db.transaction([META, DATA], 'readwrite');
    tx.objectStore(META).delete(hash);
    tx.objectStore(DATA).delete(hash);
    await done(tx);
  }
}
