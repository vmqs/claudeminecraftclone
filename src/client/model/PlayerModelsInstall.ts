import { ModelStore } from './ModelStore';
import { PlayerModels, type BuiltinModelInfo } from './PlayerModels';

/** Largest built-in model file fetched. */
const MAX_BUILTIN_BYTES = 16 * 1024 * 1024;

async function fetchBytes(url: string, max: number): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const buf = await r.arrayBuffer();
  if (buf.byteLength > max) throw new Error(`${url} is too large`);
  return new Uint8Array(buf);
}

/**
 * Connects the player-model registry to the browser: the local player, the built-in models
 * served from public/models/, the imported ones from IndexedDB and the saved choice.
 */
export function installPlayerModels(mc: { readonly thePlayer: object | null }): void {
  PlayerModels.localPlayer = () => mc.thePlayer;
  PlayerModels.loaders = {
    async builtinIndex(): Promise<BuiltinModelInfo[]> {
      const bytes = await fetchBytes('models/index.json', 64 * 1024);
      const json = JSON.parse(new TextDecoder().decode(bytes)) as { models?: BuiltinModelInfo[] };
      return Array.isArray(json.models) ? json.models : [];
    },
    builtinFile(info: BuiltinModelInfo): Promise<Uint8Array> {
      return fetchBytes(`models/${info.file.split('/').map(encodeURIComponent).join('/')}`, MAX_BUILTIN_BYTES);
    },
    async userFile(hash: string): Promise<Uint8Array | null> {
      return (await ModelStore.open()).get(hash);
    },
  };
  PlayerModels.restore();
  void PlayerModels.loadBuiltins();
  void refreshUserModels();
}

/** Reads the imported models' list from storage. */
export async function refreshUserModels(): Promise<void> {
  try {
    const store = await ModelStore.open();
    PlayerModels.user = (await store.list()).map((m) => ({ hash: m.hash, name: m.name, credits: m.credits, size: m.size, added: m.added }));
  } catch (e) {
    console.warn('[models] could not list imported models', e);
  }
}
