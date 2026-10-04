/**
 * Where saves live: one folder per world, holding files by their 1.5.2 path ("level.dat",
 * "players/<name>.dat", "data/villages.dat"...) and the chunks of the region files, each stored
 * as its zlib-compressed NBT (exactly the payload of a region-file sector run), so a world can
 * be exported as real `region/r.X.Z.mca` files and imported back.
 *
 * The browser backend is IndexedDB; tests (and browsers without IndexedDB) use the in-memory
 * one, which keeps the same behaviour for the session.
 */
export interface SaveBackend {
  readonly persistent: boolean;
  /** Folders with a level.dat. */
  listFolders(): Promise<string[]>;
  getFile(folder: string, path: string): Promise<Uint8Array | null>;
  listFiles(folder: string): Promise<string[]>;
  /** Writes files (null deletes one) in one transaction. */
  putFiles(folder: string, files: Map<string, Uint8Array | null>): Promise<void>;
  getChunk(folder: string, cx: number, cz: number): Promise<Uint8Array | null>;
  /** Writes chunks (zlib-compressed NBT) in one transaction. */
  putChunks(folder: string, chunks: { cx: number; cz: number; data: Uint8Array }[]): Promise<void>;
  /** Every saved chunk position of a folder. */
  chunkPositions(folder: string): Promise<[number, number][]>;
  /** Total stored bytes of a folder's chunks (every dimension's) and files. */
  folderSize(folder: string): Promise<number>;
  /** Deletes the folder with all its files and the chunks of every dimension. */
  deleteFolder(folder: string): Promise<void>;
}

/** A save write that failed (quota, blocked storage...): shown to the player. */
export class SaveError extends Error {}

function describe(e: unknown): string {
  if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) return 'The browser has no storage space left for this world';
  if (e instanceof Error) return e.message || e.name;
  return String(e);
}

const DB_NAME = 'minecraft-1.5.2-saves';
const DB_VERSION = 1;
const FILES = 'files';
const CHUNKS = 'chunks';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
  });
}

/** Key ranges over [folder, ...] compound keys. */
function folderRange(folder: string): IDBKeyRange {
  return IDBKeyRange.bound([folder], [folder, []]);
}

/**
 * The chunk folders of a world: its own (the overworld) and the Nether's and the End's
 * ("<folder>/DIM-1", "<folder>/DIM1"; see SaveHandler.chunkFolderOf).
 */
function chunkFolders(folder: string): string[] {
  return [folder, `${folder}/DIM-1`, `${folder}/DIM1`];
}

export class IndexedDBBackend implements SaveBackend {
  readonly persistent = true;
  private dbPromise: Promise<IDBDatabase> | null = null;

  static available(): boolean {
    try {
      return typeof indexedDB !== 'undefined' && indexedDB !== null;
    } catch {
      return false;
    }
  }

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => {
        const db = open.result;
        // files: key [folder, path] -> bytes; chunks: key [folder, cx, cz] -> zlib bytes.
        if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES);
        if (!db.objectStoreNames.contains(CHUNKS)) db.createObjectStore(CHUNKS);
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
      open.onblocked = () => reject(new Error('The save database is blocked by another tab'));
    }).catch((e) => {
      this.dbPromise = null;
      throw new SaveError(describe(e));
    });
    return this.dbPromise;
  }

  private async run<T>(stores: string[], mode: IDBTransactionMode, fn: (tx: IDBTransaction) => Promise<T> | T): Promise<T> {
    const db = await this.db();
    try {
      const tx = db.transaction(stores, mode);
      const finished = done(tx);
      const result = await fn(tx);
      await finished;
      return result;
    } catch (e) {
      throw new SaveError(describe(e));
    }
  }

  async listFolders(): Promise<string[]> {
    return this.run([FILES], 'readonly', async (tx) => {
      const keys = (await req(tx.objectStore(FILES).getAllKeys())) as [string, string][];
      const out = new Set<string>();
      for (const k of keys) if (Array.isArray(k) && k[1] === 'level.dat') out.add(k[0]);
      return [...out];
    });
  }

  async getFile(folder: string, path: string): Promise<Uint8Array | null> {
    return this.run([FILES], 'readonly', async (tx) => {
      const v = (await req(tx.objectStore(FILES).get([folder, path]))) as Uint8Array | undefined;
      return v instanceof Uint8Array ? v : null;
    });
  }

  async listFiles(folder: string): Promise<string[]> {
    return this.run([FILES], 'readonly', async (tx) => {
      const keys = (await req(tx.objectStore(FILES).getAllKeys(folderRange(folder)))) as [string, string][];
      return keys.map((k) => k[1]);
    });
  }

  async putFiles(folder: string, files: Map<string, Uint8Array | null>): Promise<void> {
    await this.run([FILES], 'readwrite', (tx) => {
      const s = tx.objectStore(FILES);
      for (const [path, data] of files) {
        if (data) s.put(data, [folder, path]);
        else s.delete([folder, path]);
      }
    });
  }

  async getChunk(folder: string, cx: number, cz: number): Promise<Uint8Array | null> {
    return this.run([CHUNKS], 'readonly', async (tx) => {
      const v = (await req(tx.objectStore(CHUNKS).get([folder, cx, cz]))) as Uint8Array | undefined;
      return v instanceof Uint8Array ? v : null;
    });
  }

  async putChunks(folder: string, chunks: { cx: number; cz: number; data: Uint8Array }[]): Promise<void> {
    if (chunks.length === 0) return;
    await this.run([CHUNKS], 'readwrite', (tx) => {
      const s = tx.objectStore(CHUNKS);
      for (const c of chunks) s.put(c.data, [folder, c.cx, c.cz]);
    });
  }

  async chunkPositions(folder: string): Promise<[number, number][]> {
    return this.run([CHUNKS], 'readonly', async (tx) => {
      const keys = (await req(tx.objectStore(CHUNKS).getAllKeys(folderRange(folder)))) as [string, number, number][];
      return keys.map((k) => [k[1], k[2]] as [number, number]);
    });
  }

  async folderSize(folder: string): Promise<number> {
    return this.run([FILES, CHUNKS], 'readonly', async (tx) => {
      let n = 0;
      const files = (await req(tx.objectStore(FILES).getAll(folderRange(folder)))) as Uint8Array[];
      for (const v of files) n += v.byteLength;
      for (const f of chunkFolders(folder)) {
        const values = (await req(tx.objectStore(CHUNKS).getAll(folderRange(f)))) as Uint8Array[];
        for (const v of values) n += v.byteLength;
      }
      return n;
    });
  }

  /** Deletes the folder: its files and the chunks of every dimension. */
  async deleteFolder(folder: string): Promise<void> {
    await this.run([FILES, CHUNKS], 'readwrite', (tx) => {
      tx.objectStore(FILES).delete(folderRange(folder));
      for (const f of chunkFolders(folder)) tx.objectStore(CHUNKS).delete(folderRange(f));
    });
  }
}

/** Saves that only last as long as the page (tests, or no IndexedDB). */
export class MemoryBackend implements SaveBackend {
  readonly persistent = false;
  private readonly files = new Map<string, Map<string, Uint8Array>>();
  private readonly chunks = new Map<string, Map<string, Uint8Array>>();

  private folderFiles(folder: string): Map<string, Uint8Array> {
    let m = this.files.get(folder);
    if (!m) this.files.set(folder, (m = new Map()));
    return m;
  }

  private folderChunks(folder: string): Map<string, Uint8Array> {
    let m = this.chunks.get(folder);
    if (!m) this.chunks.set(folder, (m = new Map()));
    return m;
  }

  async listFolders(): Promise<string[]> {
    return [...this.files.entries()].filter(([, m]) => m.has('level.dat')).map(([f]) => f);
  }

  async getFile(folder: string, path: string): Promise<Uint8Array | null> {
    return this.files.get(folder)?.get(path) ?? null;
  }

  async listFiles(folder: string): Promise<string[]> {
    return [...(this.files.get(folder)?.keys() ?? [])];
  }

  async putFiles(folder: string, files: Map<string, Uint8Array | null>): Promise<void> {
    const m = this.folderFiles(folder);
    for (const [path, data] of files) {
      if (data) m.set(path, data);
      else m.delete(path);
    }
  }

  async getChunk(folder: string, cx: number, cz: number): Promise<Uint8Array | null> {
    return this.chunks.get(folder)?.get(`${cx},${cz}`) ?? null;
  }

  async putChunks(folder: string, chunks: { cx: number; cz: number; data: Uint8Array }[]): Promise<void> {
    const m = this.folderChunks(folder);
    for (const c of chunks) m.set(`${c.cx},${c.cz}`, c.data);
  }

  async chunkPositions(folder: string): Promise<[number, number][]> {
    return [...(this.chunks.get(folder)?.keys() ?? [])].map((k) => k.split(',').map(Number) as [number, number]);
  }

  async folderSize(folder: string): Promise<number> {
    let n = 0;
    for (const v of this.files.get(folder)?.values() ?? []) n += v.byteLength;
    for (const f of chunkFolders(folder)) for (const v of this.chunks.get(f)?.values() ?? []) n += v.byteLength;
    return n;
  }

  async deleteFolder(folder: string): Promise<void> {
    this.files.delete(folder);
    for (const f of chunkFolders(folder)) this.chunks.delete(f);
  }
}
