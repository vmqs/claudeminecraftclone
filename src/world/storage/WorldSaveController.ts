import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { TagCompound } from '../../item/ItemStack';
import type { ChunkProviderClient } from '../ChunkProviderClient';
import type { World } from '../World';
import { SaveFormat } from './SaveFormat';
import type { SaveHandler } from './SaveHandler';

/** What the controller needs from the game (Minecraft). */
export interface SaveHost {
  readonly loadingScreen: {
    resetProgressAndMessage(title: string): void;
    resetProgresAndWorkingMessage(message: string): void;
    setLoadingProgress(p: number): void;
    onNoMoreProgress(): void;
  };
  /** Shows a save failure to the player (chat line in game). */
  reportSaveError(message: string): void;
}

/**
 * The integrated server's saving, for the world being played (single player or LAN host; a
 * guest never saves the host's world):
 * - every 900 ticks, saveAllPlayerData + saveAllWorlds (MinecraftServer.tick), without a screen;
 * - when the game pauses, "Saving and pausing game..." (IntegratedServer.tickIntegrated);
 * - chunks as they unload (ChunkProviderClient → SaveHandler), compressed and written a few
 *   per tick;
 * - Save and Quit: every chunk and level.dat, with WorldServer.saveAllChunks' "Saving level" /
 *   "Saving chunks" progress until the browser has stored everything.
 */
export class WorldSaveController {
  handler: SaveHandler | null = null;
  private tickCounter = 0;
  private wasPaused = false;
  /** The Save and Quit in progress (opening a world waits for it). */
  closing: Promise<void> | null = null;

  /** The world and player of the last tick (for saving when the page is hidden). */
  private world: World | null = null;
  private player: EntityPlayer | null = null;

  constructor(private readonly host: SaveHost) {
    // Leaving the tab (or closing it) saves like pausing: the browser may never come back.
    if (typeof document !== 'undefined') {
      // The world list is read at start-up so the Singleplayer screen has it at once.
      void SaveFormat.instance.ensureLoaded();
      const save = (): void => {
        if (this.handler && this.world && !this.handler.closed) void this.handler.saveAll(this.world, this.player, true);
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') save();
      });
      window.addEventListener('pagehide', save);
    }
  }

  attach(handler: SaveHandler, provider: ChunkProviderClient): void {
    this.handler = handler;
    provider.saveHandler = handler;
    this.tickCounter = 0;
    this.wasPaused = false;
    handler.onError = (msg) => this.host.reportSaveError(msg);
  }

  /** Once per client tick while a world is open. */
  onTick(world: World | null, player: EntityPlayer | null, paused: boolean): void {
    const h = this.handler;
    this.world = world;
    this.player = player;
    if (!h || !world) return;
    if (paused && !this.wasPaused) void h.saveAll(world, player, false);
    this.wasPaused = paused;
    if (!paused && ++this.tickCounter % 900 === 0) void h.saveAll(world, player, false);
    h.pump(4);
  }

  /** The whole world on demand (save-all style), without a screen. */
  saveNow(world: World, player: EntityPlayer | null): Promise<void> {
    return this.handler ? this.handler.saveAll(world, player, true) : Promise.resolve();
  }

  /**
   * Save and Quit: the chunks are snapshotted now (the provider unloads every chunk into the
   * save) and written with level.dat and the player's tag (taken by the caller before the
   * player left the world, as writePlayerData ran before removeEntity) behind the "Saving
   * level" screen. Returns false when this world is not saved.
   */
  close(world: World, provider: ChunkProviderClient, playerTag: TagCompound | null, afterSaved: () => void): boolean {
    const h = this.handler;
    this.handler = null;
    this.world = null;
    this.player = null;
    if (!h || h.closed || provider.saveHandler !== h) return false;
    const ls = this.host.loadingScreen;
    ls.resetProgressAndMessage('Saving level');
    ls.resetProgresAndWorkingMessage('Saving chunks');
    ls.setLoadingProgress(0);
    const info = world.worldInfo;
    provider.suspend();
    const run = async (): Promise<void> => {
      try {
        await h.flush((p) => ls.setLoadingProgress(p));
        await h.saveLevel(info, playerTag);
      } catch (e) {
        console.error(e);
      }
      h.closed = true;
      if (SaveFormat.instance.currentFolder === h.folder) SaveFormat.instance.currentFolder = null;
      await SaveFormat.instance.noteWorld(h.folder);
    };
    this.closing = run().finally(() => {
      this.closing = null;
      ls.onNoMoreProgress();
      afterSaved();
    });
    return true;
  }

  /** Drops the world without saving more (Hardcore deletion). */
  discard(): void {
    if (this.handler) this.handler.closed = true;
    this.handler = null;
    this.world = null;
    this.player = null;
  }
}
