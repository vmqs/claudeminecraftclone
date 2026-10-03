import type { TagCompound } from '../../item/ItemStack';
import type { WorldInfo } from '../World';
import { NBTError, readCompressedNBT, writeCompressedNBT } from './NBT';
import { IndexedDBBackend, MemoryBackend, type SaveBackend } from './SaveBackend';
import { SaveHandler } from './SaveHandler';
import { levelDatRoot, playerTagOf, worldInfoFromNBT, worldInfoToNBT } from './WorldInfoNBT';
import { NBT } from './NBT';

/** A row of the world list (SaveFormatComparator). */
export interface SaveSummary {
  fileName: string;
  displayName: string;
  lastTimePlayed: number;
  gameType: number;
  hardcore: boolean;
  cheatsEnabled: boolean;
  sizeOnDisk: number;
}

interface Entry {
  summary: SaveSummary;
  info: WorldInfo;
}

/** SaveFormatComparator: most recently played first, then by folder name. */
function compareSaves(a: SaveSummary, b: SaveSummary): number {
  if (a.lastTimePlayed !== b.lastTimePlayed) return b.lastTimePlayed - a.lastTimePlayed;
  return a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0;
}

/**
 * The saves folder (ISaveFormat / AnvilSaveConverter): lists worlds by their level.dat, renames
 * and deletes them, and opens a world's SaveHandler. Worlds are kept in IndexedDB, so they
 * survive reloading the page (the in-memory backend stands in where IndexedDB is missing).
 * The list is read once and kept up to date, so screens can draw it synchronously.
 */
export class SaveFormat {
  static instance = new SaveFormat(IndexedDBBackend.available() ? new IndexedDBBackend() : new MemoryBackend());

  private entries = new Map<string, Entry>();
  private loading: Promise<void> | null = null;
  loaded = false;
  /** Why the list could not be read (shown by the world list), if it failed. */
  loadError: string | null = null;
  /** The folder of the world being played (single player or LAN host). */
  currentFolder: string | null = null;
  /** Called after the list changed. */
  readonly listeners = new Set<() => void>();
  private persistRequested = false;

  constructor(readonly backend: SaveBackend) {}

  /** navigator.storage.persist(): asks the browser not to evict the saves (once). */
  requestPersistence(): void {
    if (this.persistRequested || !this.backend.persistent) return;
    this.persistRequested = true;
    try {
      void navigator.storage?.persist?.().catch(() => false);
    } catch {
      // Not supported.
    }
  }

  private changed(): void {
    for (const l of this.listeners) l();
  }

  /** Re-reads every level.dat (getSaveList). */
  refresh(): Promise<void> {
    this.loading = (async () => {
      const next = new Map<string, Entry>();
      try {
        for (const folder of await this.backend.listFolders()) {
          const e = await this.readEntry(folder);
          if (e) next.set(folder, e);
        }
        this.loadError = null;
      } catch (e) {
        this.loadError = e instanceof Error ? e.message : String(e);
      }
      this.entries = next;
      this.loaded = true;
      this.changed();
    })();
    return this.loading;
  }

  /** Reads the list the first time it is needed. */
  ensureLoaded(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    return this.loading ?? this.refresh();
  }

  private async readEntry(folder: string): Promise<Entry | null> {
    // getWorldData: level.dat, else level.dat_old; unreadable worlds are not listed.
    for (const name of ['level.dat', 'level.dat_old']) {
      try {
        const bytes = await this.backend.getFile(folder, name);
        if (!bytes) continue;
        const data = NBT.getCompoundTag(readCompressedNBT(bytes), 'Data');
        const info = worldInfoFromNBT(data);
        return {
          info,
          summary: {
            fileName: folder,
            displayName: info.worldName,
            lastTimePlayed: info.lastTimePlayed,
            gameType: info.gameType,
            hardcore: info.hardcore,
            cheatsEnabled: info.allowCommands,
            sizeOnDisk: Number(NBT.getLong(data, 'SizeOnDisk')),
          },
        };
      } catch (e) {
        console.warn(`Unreadable ${name} in ${folder}`, e instanceof NBTError ? e.message : e);
      }
    }
    return null;
  }

  getSaveList(): SaveSummary[] {
    return [...this.entries.values()].map((e) => e.summary).sort(compareSaves);
  }

  getWorldInfo(folder: string): WorldInfo | null {
    return this.entries.get(folder)?.info ?? null;
  }

  canLoadWorld(folder: string): boolean {
    return this.entries.has(folder);
  }

  /** A folder name nobody uses (GuiCreateWorld.makeUseableName appends dashes). */
  isFolderTaken(folder: string): boolean {
    const lower = folder.toLowerCase();
    for (const f of this.entries.keys()) if (f.toLowerCase() === lower) return true;
    return false;
  }

  /** renameWorld: changes LevelName in level.dat (the folder keeps its name). */
  async renameWorld(folder: string, name: string): Promise<void> {
    const e = this.entries.get(folder);
    if (e) {
      e.info.worldName = name;
      e.summary.displayName = name;
      this.changed();
    }
    const bytes = await this.backend.getFile(folder, 'level.dat');
    if (!bytes) return;
    const root = readCompressedNBT(bytes);
    const data = NBT.getCompoundTag(root, 'Data');
    NBT.setString(data, 'LevelName', name);
    await this.backend.putFiles(folder, new Map([['level.dat', writeCompressedNBT(root)]]));
  }

  /** Handlers of worlds opened this session, by folder (a deleted world stops saving). */
  private readonly handlers = new Map<string, SaveHandler>();

  /** deleteWorldDirectory: the world stops saving at once, then its data goes once pending writes ended. */
  async deleteWorldDirectory(folder: string): Promise<void> {
    const h = this.handlers.get(folder);
    if (h) {
      h.closed = true;
      this.handlers.delete(folder);
    }
    if (this.currentFolder === folder) this.currentFolder = null;
    this.entries.delete(folder);
    this.changed();
    if (h) await h.idle();
    await this.backend.deleteFolder(folder);
  }

  /** Lists (or updates) a world after its level.dat was written. */
  async noteWorld(folder: string): Promise<void> {
    const e = await this.readEntry(folder);
    if (e) this.entries.set(folder, e);
    else this.entries.delete(folder);
    this.changed();
  }

  /**
   * A new world's save (nothing is written until its first save). Whatever an old world left in
   * that folder goes first (the dev worlds reuse theirs; the create screen picks a new one).
   */
  createWorld(folder: string): SaveHandler {
    this.currentFolder = folder;
    const h = this.attach(new SaveHandler(this.backend, folder));
    h.runFirst(() => this.backend.deleteFolder(folder));
    h.lockSession();
    return h;
  }

  /**
   * Opens a saved world: its settings, the single player's tag and the saved chunk positions.
   * The player comes from level.dat's "Player", else from players/<username>.dat (a world
   * from a server: ServerConfigurationManager.readPlayerDataFromFile).
   */
  async openWorld(folder: string, username = ''): Promise<{ handler: SaveHandler; info: WorldInfo; player: TagCompound | null; data: Map<string, Uint8Array> }> {
    let data: TagCompound | null = null;
    for (const name of ['level.dat', 'level.dat_old']) {
      const bytes = await this.backend.getFile(folder, name);
      if (!bytes) continue;
      try {
        data = NBT.getCompoundTag(readCompressedNBT(bytes), 'Data');
        break;
      } catch (e) {
        if (name === 'level.dat_old') throw e;
      }
    }
    if (!data) throw new NBTError(`The world "${folder}" has no level.dat`);
    const info = worldInfoFromNBT(data);
    let player = playerTagOf(data);
    if (!player && username) {
      try {
        const bytes = await this.backend.getFile(folder, `players/${username}.dat`);
        if (bytes) player = readCompressedNBT(bytes);
      } catch {
        // An unreadable player file means a new player, as in the original.
      }
    }
    // data/ (maps, idcounts): read now, map items look them up synchronously.
    const dataFiles = new Map<string, Uint8Array>();
    for (const path of await this.backend.listFiles(folder)) {
      if (!path.startsWith('data/')) continue;
      const bytes = await this.backend.getFile(folder, path);
      if (bytes) dataFiles.set(path, bytes);
    }
    const handler = new SaveHandler(this.backend, folder, await this.backend.chunkPositions(folder));
    handler.lockSession();
    this.currentFolder = folder;
    return { handler: this.attach(handler), info, player, data: dataFiles };
  }

  private attach(h: SaveHandler): SaveHandler {
    this.requestPersistence();
    const old = this.handlers.get(h.folder);
    if (old && old !== h) old.closed = true;
    this.handlers.set(h.folder, h);
    const write = h.saveLevel.bind(h);
    // Every level.dat write refreshes the world's row in the list.
    h.saveLevel = async (info, player) => {
      await write(info, player);
      if (!h.closed) await this.noteWorld(h.folder);
    };
    return h;
  }

  /** Writes a level.dat for a world built elsewhere (import, tests). */
  async writeLevel(folder: string, info: WorldInfo, player: TagCompound | null): Promise<void> {
    await this.backend.putFiles(folder, new Map([['level.dat', writeCompressedNBT(levelDatRoot(worldInfoToNBT(info, player)))]]));
    await this.noteWorld(folder);
  }
}

/** "5/7/13 12:00 PM": java.text.SimpleDateFormat's default en_US pattern (M/d/yy h:mm a). */
export function formatSaveDate(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  const yy = String(d.getFullYear() % 100).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()}/${yy} ${h12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}
