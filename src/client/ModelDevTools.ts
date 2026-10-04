import { GuiAccountManager } from '../gui/GuiAccountManager';
import { customModelForKey, customModelStats } from '../render/entity/CustomPlayerModels';
import type { Minecraft } from './Minecraft';
import { exportLog, exportModel, type ExportKind } from './model/ModelExport';
import { importModelFiles, turnUserModel } from './model/ModelImport';
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

  /**
   * Imports files given as bytes, text or base64 (automation has no file picker), through the
   * open Account Manager when there is one. Resolves with the outcome.
   */
  async importFiles(files: { name: string; bytes?: Uint8Array; text?: string; base64?: string }[]): Promise<Record<string, unknown>> {
    const list = files.map((f) => {
      let bytes = f.bytes;
      if (!bytes && f.text !== undefined) bytes = new TextEncoder().encode(f.text);
      if (!bytes && f.base64 !== undefined) bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
      return { name: f.name, bytes: bytes ?? new Uint8Array(0) };
    });
    const screen = this.mc.currentScreen;
    if (screen instanceof GuiAccountManager) {
      const ok = await screen.useModelFiles(list);
      return { ok, key: PlayerModels.local, status: (screen as unknown as { status: string }).status };
    }
    const r = await importModelFiles(list);
    if (r.ok && r.key) PlayerModels.setLocal(r.key);
    return { ...r };
  }

  /**
   * A test model as files: an OBJ person of boxes (T-pose arms, toes forward, lying in Z-up and
   * facing -X like a careless export), its MTL and a PNG texture with a skin-coloured head, a
   * `color` shirt and blue trousers.
   */
  async testModelFiles(color = '#d02020'): Promise<{ name: string; bytes: Uint8Array }[]> {
    const boxes: [number[], number[], string][] = [
      [[-22, 0, -7], [-3, 88, 7], 'legs'],
      [[3, 0, -7], [22, 88, 7], 'legs'],
      [[-22, 0, 7], [-3, 8, 26], 'shoes'],
      [[3, 0, 7], [22, 8, 26], 'shoes'],
      [[-22, 88, -11], [22, 148, 11], 'shirt'],
      [[-6, 148, -6], [6, 154, 6], 'skin'],
      [[-11, 154, -12], [11, 180, 12], 'skin'],
      [[-90, 136, -6], [-24, 148, 6], 'shirt'],
      [[24, 136, -6], [90, 148, 6], 'shirt'],
    ];
    // Texture cells (u0, v0) in a 4x1 strip: skin, shirt, legs, shoes.
    const cell: Record<string, number> = { skin: 0, shirt: 1, legs: 2, shoes: 3 };
    const canvas = new OffscreenCanvas(64, 16);
    const ctx = canvas.getContext('2d')!;
    const fills = ['#e0b090', color, '#2040a0', '#302010'];
    fills.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(i * 16, 0, 16, 16);
    });
    // Eyes on the face cell's upper half.
    ctx.fillStyle = '#000000';
    ctx.fillRect(4, 5, 2, 2);
    ctx.fillRect(10, 5, 2, 2);
    const png = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
    const lines = ['mtllib person.mtl', 'usemtl body'];
    let base = 1;
    let vt = 1;
    boxes.forEach(([mn, mx, kind], i) => {
      lines.push(`g part${i}`);
      for (let k = 0; k < 8; k++) {
        const p = [k & 1 ? mx[0] : mn[0], k & 2 ? mx[1] : mn[1], k & 4 ? mx[2] : mn[2]];
        // Facing -X with Z up (a proper rotation of the +Z-facing, Y-up person).
        lines.push(`v ${-p[2]} ${-p[0]} ${p[1]}`);
      }
      const u0 = cell[kind] / 4 + 0.01;
      const u1 = (cell[kind] + 1) / 4 - 0.01;
      lines.push(`vt ${u0} 0.05`, `vt ${u1} 0.05`, `vt ${u1} 0.95`, `vt ${u0} 0.95`);
      for (const f of [
        [0, 2, 3, 1],
        [4, 5, 7, 6],
        [0, 1, 5, 4],
        [2, 6, 7, 3],
        [0, 4, 6, 2],
        [1, 3, 7, 5],
      ])
        lines.push(`f ${f.map((v, j) => `${v + base}/${vt + j}`).join(' ')}`);
      base += 8;
      vt += 4;
    });
    const enc = new TextEncoder();
    return [
      { name: 'Test Person.obj', bytes: enc.encode(lines.join('\n')) },
      { name: 'person.mtl', bytes: enc.encode('newmtl body\nKd 1 1 1\nmap_Kd person.png\n') },
      { name: 'person.png', bytes: png },
    ];
  }

  /** Turn Around for the worn imported model; resolves with its new key (null: not imported). */
  async turnAround(): Promise<string | null> {
    const key = PlayerModels.local;
    return key.startsWith('data:') ? turnUserModel(key.slice(5)) : null;
  }

  /**
   * Export .mcpm / Export .glb for the worn model (through the open Account Manager when there is
   * one, so its message shows); `download` false skips the browser download. Resolves with the
   * outcome; `lastExport()` describes the file.
   */
  async exportModel(kind: ExportKind, download = true): Promise<Record<string, unknown>> {
    const screen = this.mc.currentScreen;
    if (download && screen instanceof GuiAccountManager) {
      const ok = await screen.exportChosen(kind);
      return { ok, status: (screen as unknown as { status: string }).status };
    }
    return { ...(await exportModel(PlayerModels.local, kind, download ? undefined : () => {})) };
  }

  /** The last exported file: kind, name, size, its first bytes (hex) and, with `withBytes`, the bytes. */
  lastExport(withBytes = false): Record<string, unknown> | null {
    const e = exportLog.last;
    if (!e) return null;
    const head = Array.from(e.bytes.subarray(0, 4), (b) => b.toString(16).padStart(2, '0')).join('');
    return { kind: e.kind, file: e.file, size: e.bytes.length, head, ...(withBytes ? { bytes: e.bytes } : {}) };
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
