import { strToU8, zipSync } from 'fflate';
import { importTexturePackBytes, type PackImportResult } from '../assets/PackFiles';
import { GuiControls } from '../gui/GuiControls';
import { GuiTexturePacks } from '../gui/GuiTexturePacks';
import { GameSettings } from './GameSettings';
import { KeyBinding } from './KeyBinding';
import type { Minecraft } from './Minecraft';

/** Recolours an image: channels rotated (r,g,b -> b,r,g) so a test pack is easy to see. */
async function recoloured(mc: Minecraft, path: string, size?: number): Promise<Uint8Array | null> {
  const bmp = await mc.resources.getImageBitmap(path, 'vanilla');
  if (!bmp) return null;
  const w = size ?? bmp.width;
  const h = size ?? bmp.height;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
    d[i] = b;
    d[i + 1] = r;
    d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
  return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
}

/** A 64x64 pack.png: a checkerboard with a border. */
async function packIcon(): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(64, 64);
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    ctx.fillStyle = (x + y) % 2 ? '#3a7bd5' : '#f4c430';
    ctx.fillRect(x * 8, y * 8, 8, 8);
  }
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 60, 60);
  return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
}

/** Textures the test packs recolour: [1.5.2 path, 1.6+ path]. */
const TEST_TEXTURES: [string, string][] = [
  ['textures/blocks/grass_top.png', 'block/grass_block_top.png'],
  ['textures/blocks/grass_side.png', 'block/grass_block_side.png'],
  ['textures/blocks/dirt.png', 'block/dirt.png'],
  ['textures/blocks/stone.png', 'block/stone.png'],
  ['textures/blocks/stonebrick.png', 'block/cobblestone.png'],
  ['textures/blocks/wood.png', 'block/oak_planks.png'],
  ['textures/blocks/tree_side.png', 'block/oak_log.png'],
  ['textures/blocks/sand.png', 'block/sand.png'],
  ['textures/blocks/leaves.png', 'block/oak_leaves.png'],
  ['gui/gui.png', 'gui/widgets.png'],
];

/**
 * `mc.dev.controls`: key bindings, the sprint and zoom keys, the Controls screen's scroll and
 * the texture pack importer (with generated test packs, since automation has no file picker).
 */
export class ControlsDevTools {
  constructor(private readonly mc: Minecraft) {}

  /** Every binding: name, LWJGL code and key name. */
  bindings(): { name: string; code: number; key: string }[] {
    const gs = this.mc.gameSettings;
    return gs.keyBindings.map((k, i) => ({ name: gs.getKeyBindingDescription(i), code: k.keyCode, key: GameSettings.getKeyDisplayString(k.keyCode) }));
  }

  /** Rebinds by description ("Zoom", "Hotbar Slot 1", ...) or key.* id. */
  bind(name: string, code: number): boolean {
    const gs = this.mc.gameSettings;
    const i = gs.keyBindings.findIndex((k, n) => k.keyDescription === name || gs.getKeyBindingDescription(n) === name);
    if (i < 0) return false;
    gs.setKeyBinding(i, code);
    KeyBinding.resetKeyBindingArrayAndHash();
    return true;
  }

  /** Zoom, smooth camera, sprint and the current item. */
  state(): { zoom: boolean; smoothCamera: boolean; sprinting: boolean; toggleSprint: boolean; sprintToggledOn: boolean; currentItem: number; controlsScroll: number | null } {
    const mc = this.mc;
    const gs = mc.gameSettings;
    const s = mc.currentScreen;
    return {
      zoom: mc.entityRenderer.zoom.active,
      smoothCamera: gs.smoothCamera,
      sprinting: mc.thePlayer?.isSprinting() ?? false,
      toggleSprint: gs.toggleSprint,
      sprintToggledOn: gs.sprintToggledOn,
      currentItem: mc.thePlayer?.inventory.currentItem ?? -1,
      controlsScroll: s instanceof GuiControls ? s.getScroll() : null,
    };
  }

  /** Scrolls an open Controls screen to a row. */
  scrollControls(row: number): number | null {
    const s = this.mc.currentScreen;
    if (!(s instanceof GuiControls)) return null;
    s.setScroll(row);
    return s.getScroll();
  }

  /** The pack list: id, name, compatible, layout, selected. */
  packs(): { id: string | null; name: string; user: boolean; compatible: boolean; layout: string; selected: boolean }[] {
    const rm = this.mc.resources;
    const list = [{ id: null as string | null, name: 'Default', user: false, compatible: true, layout: 'classic', selected: rm.selectedPack === null }];
    for (const p of rm.packs) list.push({ id: p.id, name: p.name, user: p.user === true, compatible: p.compatible !== false, layout: p.layout ?? 'classic', selected: rm.selectedPack === p.id });
    return list;
  }

  /** A generated texture pack .zip: 'classic' (1.5 layout) or 'modern' (1.6+ resource pack). */
  async makeTestPack(kind: 'classic' | 'modern' = 'classic'): Promise<Uint8Array> {
    const files: Record<string, Uint8Array> = { 'pack.png': await packIcon() };
    for (const [classic, modern] of TEST_TEXTURES) {
      const data = await recoloured(this.mc, classic);
      if (!data) continue;
      if (kind === 'classic') files['Test Pack/' + classic] = data;
      else files['assets/minecraft/textures/' + modern] = data;
    }
    if (kind === 'classic') {
      files['Test Pack/pack.txt'] = strToU8('A recoloured test pack\nMade by mc.dev.controls');
      files['Test Pack/pack.png'] = files['pack.png'];
      delete files['pack.png'];
    } else {
      files['pack.mcmeta'] = strToU8(JSON.stringify({ pack: { pack_format: 15, description: 'A 1.20 style test pack' } }));
    }
    return zipSync(files);
  }

  /** Imports a pack from bytes, an array of byte values or base64, and refreshes an open pack screen. */
  async importPack(name: string, data: Uint8Array | number[] | string): Promise<PackImportResult> {
    const bytes = typeof data === 'string' ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0)) : data instanceof Uint8Array ? data : Uint8Array.from(data);
    const result = await importTexturePackBytes(this.mc.resources, name, bytes);
    const s = this.mc.currentScreen;
    if (s instanceof GuiTexturePacks) s.refreshPacks();
    return result;
  }

  /** makeTestPack + importPack. */
  async importTestPack(kind: 'classic' | 'modern' = 'classic'): Promise<PackImportResult> {
    return this.importPack(kind === 'classic' ? 'Test Pack.zip' : 'Modern Test Pack.zip', await this.makeTestPack(kind));
  }

  /** Selects a pack by id or name (null or 'default' for Default) like clicking it; resolves after the textures reloaded. */
  async selectPack(idOrName: string | null): Promise<string | null> {
    const rm = this.mc.resources;
    const id = idOrName === null || idOrName === 'default' ? null : (rm.packs.find((p) => p.id === idOrName || p.name === idOrName)?.id ?? null);
    const before = rm.selectedPack;
    const listeners = this.mc.renderEngine.reloadListeners;
    let done!: () => void;
    const reloaded = new Promise<void>((resolve) => (done = resolve));
    const onReload = () => done();
    listeners.push(onReload);
    try {
      await rm.selectPack(id);
      await this.mc.fontRenderer.readFontData(rm);
      this.mc.renderGlobal.loadRenderers();
      if (rm.selectedPack !== before) await reloaded;
    } finally {
      listeners.splice(listeners.indexOf(onReload), 1);
    }
    return rm.selectedPack;
  }

  /** Deletes an imported pack. */
  async removePack(id: string): Promise<void> {
    await this.mc.resources.removeUserPack(id);
    const s = this.mc.currentScreen;
    if (s instanceof GuiTexturePacks) s.refreshPacks();
  }
}
