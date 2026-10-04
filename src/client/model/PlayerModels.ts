import { decodePlayerModel, modelHash, type PlayerModelData } from './PlayerModelFormat';

/**
 * Which model each player wears (beside its skin): Steve (the skin on ModelBiped), one of the
 * built-in models (public/models/index.json) or a model file known by its content hash (the
 * user's imported models, and other players' models received over the network).
 *
 * Model keys: 'steve', 'builtin:<id>', 'data:<hash>'. The local choice is kept in localStorage.
 * Model data is decoded and checked (decodePlayerModel) before anything uses it, and cached by
 * key while a player wears it. No DOM here: loading goes through `loaders`, which the game sets.
 */

export type ModelKey = string;
export const STEVE_KEY = 'steve';

export interface BuiltinModelInfo {
  id: string;
  name: string;
  credits: string;
  file: string;
  bytes: number;
  hash: string;
}

export interface UserModelInfo {
  hash: string;
  name: string;
  credits: string;
  size: number;
  added: number;
}

/** What other players get for a model they cannot fetch themselves (imported ones). */
export const MAX_NET_MODEL_BYTES = 3 * 1024 * 1024;

export interface ModelLoaders {
  /** The built-in list (public/models/index.json). */
  builtinIndex(): Promise<BuiltinModelInfo[]>;
  /** A built-in model file. */
  builtinFile(info: BuiltinModelInfo): Promise<Uint8Array>;
  /** An imported model file from storage (null when gone). */
  userFile(hash: string): Promise<Uint8Array | null>;
}

interface Entry {
  state: 'loading' | 'ready' | 'failed';
  data: PlayerModelData | null;
  bytes: Uint8Array | null;
  error: string;
}

const STORAGE_KEY = 'mc152.playerModel';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function isModelKey(k: unknown): k is ModelKey {
  return typeof k === 'string' && (k === STEVE_KEY || /^builtin:[a-z0-9_]{1,32}$/.test(k) || /^data:[0-9a-f]{32}$/.test(k));
}

export class PlayerModelRegistry {
  loaders: ModelLoaders | null = null;
  builtins: BuiltinModelInfo[] = [];
  user: UserModelInfo[] = [];
  private builtinsLoading: Promise<void> | null = null;
  private localKey: ModelKey = STEVE_KEY;
  /** Bumped when the local model changes (the network sends it again). */
  localVersion = 0;
  /** The player the user controls (set by Minecraft): it wears the local model. */
  localPlayer: () => object | null = () => null;
  private readonly remote = new Map<string, ModelKey>();
  private readonly entries = new Map<ModelKey, Entry>();
  /** Called with keys whose data was dropped (their GPU copies can be freed). */
  readonly releaseListeners: ((key: ModelKey) => void)[] = [];
  /** Called after the local model changed. */
  readonly localListeners: (() => void)[] = [];
  /** Called when a model finished loading (or failed). */
  readonly loadListeners: ((key: ModelKey) => void)[] = [];
  /** Keys kept loaded besides the worn ones (the Account Manager's preview). */
  readonly pinned = new Set<ModelKey>();

  /** Reads the saved choice (call once at start-up). */
  restore(): void {
    const saved = storage()?.getItem(STORAGE_KEY);
    if (isModelKey(saved)) this.localKey = saved;
  }

  get local(): ModelKey {
    return this.localKey;
  }

  setLocal(key: ModelKey): void {
    if (!isModelKey(key) || key === this.localKey) return;
    const old = this.localKey;
    this.localKey = key;
    this.localVersion++;
    try {
      storage()?.setItem(STORAGE_KEY, key);
    } catch {
      /* storage full or blocked */
    }
    for (const l of this.localListeners) l();
    this.collect(old);
  }

  /** Another player's model (Steve: back to the skin). */
  setRemote(name: string, key: ModelKey): void {
    const old = this.remote.get(name) ?? STEVE_KEY;
    if (old === key) return;
    if (key === STEVE_KEY) this.remote.delete(name);
    else this.remote.set(name, key);
    this.collect(old);
  }

  getRemote(name: string): ModelKey {
    return this.remote.get(name) ?? STEVE_KEY;
  }

  remoteNames(): string[] {
    return [...this.remote.keys()];
  }

  clearRemote(): void {
    const keys = [...this.remote.values()];
    this.remote.clear();
    for (const k of keys) this.collect(k);
  }

  /** The model key `player` wears. */
  keyFor(player: { readonly username: string }): ModelKey {
    if (player === this.localPlayer()) return this.localKey;
    return this.remote.get(player.username) ?? STEVE_KEY;
  }

  /** The decoded model for a key, or null (Steve, still loading, failed). Starts loading. */
  dataFor(key: ModelKey): PlayerModelData | null {
    if (key === STEVE_KEY) return null;
    const e = this.entries.get(key);
    if (e) return e.data;
    this.load(key);
    return this.entries.get(key)?.data ?? null;
  }

  /** The loading state of a key. */
  stateOf(key: ModelKey): 'steve' | 'loading' | 'ready' | 'failed' | 'unknown' {
    if (key === STEVE_KEY) return 'steve';
    return this.entries.get(key)?.state ?? 'unknown';
  }

  errorOf(key: ModelKey): string {
    return this.entries.get(key)?.error ?? '';
  }

  /** The file bytes of a loaded model (sent to other players). */
  bytesFor(key: ModelKey): Uint8Array | null {
    return this.entries.get(key)?.bytes ?? null;
  }

  /** Waits until a key is ready or failed. */
  async whenLoaded(key: ModelKey): Promise<PlayerModelData | null> {
    if (key === STEVE_KEY) return null;
    this.dataFor(key);
    const e = this.entries.get(key);
    if (!e || e.state !== 'loading') return e?.data ?? null;
    await new Promise<void>((resolve) => {
      const l = (k: ModelKey) => {
        if (k !== key) return;
        const i = this.loadListeners.indexOf(l);
        if (i >= 0) this.loadListeners.splice(i, 1);
        resolve();
      };
      this.loadListeners.push(l);
    });
    return this.entries.get(key)?.data ?? null;
  }

  /** The display name of a key ("Steve", a built-in's name, an imported model's name). */
  nameOf(key: ModelKey): string {
    if (key === STEVE_KEY) return 'Steve';
    if (key.startsWith('builtin:')) return this.builtins.find((b) => `builtin:${b.id}` === key)?.name ?? key.slice(8);
    const hash = key.slice(5);
    return this.user.find((u) => u.hash === hash)?.name ?? this.entries.get(key)?.data?.name ?? 'Custom model';
  }

  /** Every key the Account Manager can cycle through: Steve, the built-ins, the imported ones. */
  choices(): ModelKey[] {
    return [STEVE_KEY, ...this.builtins.map((b) => `builtin:${b.id}`), ...this.user.map((u) => `data:${u.hash}`)];
  }

  /** Loads the built-in list (once). */
  loadBuiltins(): Promise<void> {
    if (!this.loaders) return Promise.resolve();
    this.builtinsLoading ??= this.loaders.builtinIndex().then(
      (list) => {
        this.builtins = list.filter((b) => b && /^[a-z0-9_]{1,32}$/.test(b.id) && typeof b.file === 'string');
      },
      (e) => {
        console.warn('[models] no built-in model list', e);
        this.builtinsLoading = null;
      },
    );
    return this.builtinsLoading;
  }

  /**
   * Model bytes from elsewhere (an import, another player): checked, decoded and cached under
   * 'data:<hash>'. Returns the key, or throws when the bytes are not a valid model.
   */
  putData(bytes: Uint8Array, maxBytes?: number): ModelKey {
    const hash = modelHash(bytes);
    const key = `data:${hash}`;
    const known = this.entries.get(key);
    if (known?.state === 'ready') return key;
    const data = decodePlayerModel(bytes, maxBytes);
    this.entries.set(key, { state: 'ready', data, bytes, error: '' });
    for (const l of this.loadListeners) l(key);
    return key;
  }

  /** Whether model data for a key is here (network: no need to send it again). */
  has(key: ModelKey): boolean {
    return this.entries.get(key)?.state === 'ready';
  }

  private load(key: ModelKey): void {
    const loaders = this.loaders;
    const entry: Entry = { state: 'loading', data: null, bytes: null, error: '' };
    this.entries.set(key, entry);
    const finish = (bytes: Uint8Array | null, err?: unknown) => {
      if (this.entries.get(key) !== entry) return;
      if (bytes) {
        try {
          entry.data = decodePlayerModel(bytes);
          entry.bytes = bytes;
          entry.state = 'ready';
        } catch (e) {
          err = e;
        }
      }
      if (entry.state !== 'ready') {
        entry.state = 'failed';
        entry.error = err instanceof Error ? err.message : err ? String(err) : 'not found';
        console.warn(`[models] ${key}: ${entry.error}`);
      }
      for (const l of this.loadListeners) l(key);
    };
    if (!loaders) return finish(null, 'no loaders');
    if (key.startsWith('builtin:')) {
      const id = key.slice(8);
      void this.loadBuiltins()
        .then(() => {
          const info = this.builtins.find((b) => b.id === id);
          if (!info) throw new Error(`no built-in model ${id}`);
          return loaders.builtinFile(info);
        })
        .then((b) => finish(b), (e) => finish(null, e));
    } else if (key.startsWith('data:')) {
      // Imported models come from storage; other players' arrive through putData.
      void loaders.userFile(key.slice(5)).then(
        (b) => finish(b, b ? undefined : 'waiting for the model data'),
        (e) => finish(null, e),
      );
    } else finish(null, 'bad key');
  }

  /** Forgets a failed entry so it can be tried again (after the data arrived). */
  retry(key: ModelKey): void {
    if (this.entries.get(key)?.state === 'failed') this.entries.delete(key);
  }

  /** Drops a key's data when nobody wears or previews it any more. */
  private collect(key: ModelKey): void {
    if (key === STEVE_KEY || key === this.localKey || this.pinned.has(key)) return;
    for (const k of this.remote.values()) if (k === key) return;
    if (!this.entries.delete(key)) return;
    for (const l of this.releaseListeners) l(key);
  }

  /** Unpins a preview key and frees it when unused. */
  unpin(key: ModelKey): void {
    this.pinned.delete(key);
    this.collect(key);
  }

  /** Forgets an imported model (Delete Model). */
  forgetUser(hash: string): void {
    this.user = this.user.filter((u) => u.hash !== hash);
    const key = `data:${hash}`;
    if (this.localKey === key) this.setLocal(STEVE_KEY);
    this.pinned.delete(key);
    this.collect(key);
  }
}

export const PlayerModels = new PlayerModelRegistry();
