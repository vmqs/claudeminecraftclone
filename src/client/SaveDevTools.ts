import { GuiMainMenu } from '../gui/GuiMainMenu';
import { GuiSelectWorld } from '../gui/GuiSelectWorld';
import { SaveFormat, type SaveSummary } from '../world/storage/SaveFormat';
import { exportWorld, importWorld } from '../world/storage/WorldTransfer';
import type { Minecraft } from './Minecraft';

/**
 * `mc.dev.saves`: world saving for automation (scripts/scenarios/persistence.json).
 * list() / ready() read the saved worlds, saveNow() writes the open world, quit() is Save and
 * Quit to Title (resolves once everything is stored), open(folder) is Play Selected World,
 * exportZip(folder) / importZip(bytes) go through the .zip format, roundTrip(folder) exports a
 * world and imports it as a new one.
 */
export class SaveDevTools {
  constructor(private readonly mc: Minecraft) {}

  get format(): SaveFormat {
    return SaveFormat.instance;
  }

  /** Resolves once the saved worlds were read. */
  async ready(): Promise<SaveSummary[]> {
    await SaveFormat.instance.ensureLoaded();
    return this.list();
  }

  list(): SaveSummary[] {
    return SaveFormat.instance.getSaveList();
  }

  /** The open world's save: chunks stored, queued, last error, current folder. */
  state(): { folder: string | null; saved: number; pending: number; error: string | null; closing: boolean; persistent: boolean } {
    const h = this.mc.saveController.handler;
    return {
      folder: SaveFormat.instance.currentFolder,
      saved: h?.savedChunkCount ?? 0,
      pending: h?.pendingCount ?? 0,
      error: h?.error ?? null,
      closing: this.mc.saveController.closing !== null,
      persistent: SaveFormat.instance.backend.persistent,
    };
  }

  /** Saves the open world now (every loaded chunk, level.dat with the player). */
  async saveNow(): Promise<void> {
    const w = this.mc.theWorld;
    if (w) await this.mc.saveController.saveNow(w, this.mc.thePlayer);
  }

  /** Save and Quit to Title; resolves when the world is stored. */
  async quit(): Promise<void> {
    this.mc.loadWorld(null);
    this.mc.displayGuiScreen(new GuiMainMenu());
    await this.mc.saveController.closing;
  }

  /** Play Selected World. */
  async open(folder: string): Promise<boolean> {
    await SaveFormat.instance.ensureLoaded();
    const info = SaveFormat.instance.getWorldInfo(folder);
    if (!info) return false;
    this.mc.displayGuiScreen(null);
    this.mc.launchIntegratedServer(folder, info.worldName, null);
    return true;
  }

  async exportZip(folder: string): Promise<Uint8Array> {
    return exportWorld(SaveFormat.instance, folder);
  }

  async importZip(bytes: Uint8Array | number[], name = 'world.zip'): Promise<string> {
    const r = await importWorld(SaveFormat.instance, bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes), name);
    return r.folder;
  }

  /** Export + import through the world list's code (with its progress screens); the new folder. */
  async roundTrip(folder: string): Promise<string | null> {
    const screen = new GuiSelectWorld(new GuiMainMenu());
    this.mc.displayGuiScreen(screen);
    const zip = await screen.runExport(folder);
    if (!zip) return null;
    return screen.runImport(zip, folder + '.zip');
  }

  /** Deletes every saved world (fresh start for a scenario). */
  async deleteAll(): Promise<void> {
    await SaveFormat.instance.ensureLoaded();
    for (const s of SaveFormat.instance.getSaveList()) await SaveFormat.instance.deleteWorldDirectory(s.fileName);
  }
}
