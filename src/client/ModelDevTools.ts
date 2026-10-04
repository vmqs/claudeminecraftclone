import { GuiAccountManager } from '../gui/GuiAccountManager';
import { customModelForKey, customModelStats } from '../render/entity/CustomPlayerModels';
import type { Minecraft } from './Minecraft';
import { importModelFiles } from './model/ModelImport';
import { PlayerModels, STEVE_KEY, type ModelKey } from './model/PlayerModels';

/**
 * Custom player model helpers on `window.mc.dev.models` (scripts/scenarios/models.json):
 * choose a model, wait until it is drawn, import files from URLs, give other players models,
 * and measure frame times.
 */
export class ModelDevTools {
  constructor(private readonly mc: Minecraft) {}

  /** A key from a key, a built-in id or a model name ('steve', 'john_marston', 'Trevor'...). */
  keyOf(nameOrKey: string): ModelKey {
    if (nameOrKey === STEVE_KEY || nameOrKey.startsWith('builtin:') || nameOrKey.startsWith('data:')) return nameOrKey;
    const b = PlayerModels.builtins.find((m) => m.id === nameOrKey || m.name.toLowerCase() === nameOrKey.toLowerCase());
    if (b) return `builtin:${b.id}`;
    const u = PlayerModels.user.find((m) => m.name.toLowerCase() === nameOrKey.toLowerCase());
    return u ? `data:${u.hash}` : `builtin:${nameOrKey}`;
  }

  /** Wears a model (as the Account Manager's button does). */
  async select(nameOrKey: string): Promise<ModelKey> {
    await PlayerModels.loadBuiltins();
    const key = this.keyOf(nameOrKey);
    PlayerModels.setLocal(key);
    const screen = this.mc.currentScreen;
    if (screen instanceof GuiAccountManager) screen.cycleModel(0);
    return key;
  }

  /** Resolves true once the model is on the GPU (false on failure or after `timeoutMs`). */
  async whenReady(nameOrKey?: string, timeoutMs = 60000): Promise<boolean> {
    await PlayerModels.loadBuiltins();
    const key = nameOrKey ? this.keyOf(nameOrKey) : PlayerModels.local;
    if (key === STEVE_KEY) return true;
    const end = performance.now() + timeoutMs;
    while (performance.now() < end) {
      if (customModelForKey(key)) return true;
      if (PlayerModels.stateOf(key) === 'failed') return false;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  }

  /** Another player's model by name (null: Steve). */
  setRemote(name: string, nameOrKey: string | null): void {
    PlayerModels.setRemote(name, nameOrKey ? this.keyOf(nameOrKey) : STEVE_KEY);
  }

  /**
   * Imports files fetched from URLs (through the open Account Manager when there is one, so its
   * message shows). Resolves with the outcome.
   */
  async importUrls(urls: string[]): Promise<Record<string, unknown>> {
    const files: { name: string; bytes: Uint8Array }[] = [];
    for (const u of urls) {
      const r = await fetch(u);
      if (!r.ok) return { ok: false, error: `${u}: HTTP ${r.status}` };
      files.push({ name: decodeURIComponent(u.split('/').pop() ?? 'model'), bytes: new Uint8Array(await r.arrayBuffer()) });
    }
    const screen = this.mc.currentScreen;
    if (screen instanceof GuiAccountManager) {
      const ok = await screen.useModelFiles(files);
      return { ok, key: PlayerModels.local };
    }
    const r = await importModelFiles(files);
    if (r.ok && r.key) PlayerModels.setLocal(r.key);
    return { ...r };
  }

  /** What is chosen, loaded and drawn. */
  state(): Record<string, unknown> {
    const remote: Record<string, string> = {};
    for (const n of PlayerModels.remoteNames()) remote[n] = PlayerModels.getRemote(n);
    return {
      local: PlayerModels.local,
      localName: PlayerModels.nameOf(PlayerModels.local),
      localState: PlayerModels.stateOf(PlayerModels.local),
      builtins: PlayerModels.builtins.map((b) => b.id),
      user: PlayerModels.user.map((u) => ({ hash: u.hash, name: u.name, size: u.size })),
      remote,
      gpu: customModelStats(),
    };
  }

  /** Average and worst frame time over `ms` of real frames (performance checks). */
  measureFrames(ms = 3000): Promise<{ frames: number; avgMs: number; maxMs: number }> {
    return new Promise((resolve) => {
      const times: number[] = [];
      let last = performance.now();
      const start = last;
      const step = () => {
        const now = performance.now();
        times.push(now - last);
        last = now;
        if (now - start < ms) requestAnimationFrame(step);
        else resolve({ frames: times.length, avgMs: times.reduce((a, b) => a + b, 0) / Math.max(1, times.length), maxMs: Math.max(...times) });
      };
      requestAnimationFrame(step);
    });
  }
}
