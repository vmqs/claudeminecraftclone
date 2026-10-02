import { CommandGameMode } from '../../command/CommandGameMode';
import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { ItemStack } from '../../item/ItemStack';
import type { ChunkProviderClient } from '../ChunkProviderClient';
import type { World, WorldInfo } from '../World';

/** What level.dat's Player tag would hold for the single player. */
export interface PlayerSnapshot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  mainInventory: (ItemStack | null)[];
  armorInventory: (ItemStack | null)[];
  currentItem: number;
  isFlying: boolean;
  dead: boolean;
  /** EnumGameType id (playerGameType). */
  gameType: number;
  health: number;
  air: number;
  experience: number;
  experienceLevel: number;
  experienceTotal: number;
  /** The player's FoodStats object, when the player class has one (the survival port). */
  foodStats: unknown;
}

/** Player state that the survival port may add; copied when present. */
interface SurvivalFields {
  foodStats?: unknown;
}

/** One world of the session (a save folder). */
export interface SaveEntry {
  fileName: string;
  info: WorldInfo;
  /** The world and its chunk store while nobody plays it; null once loaded or for a world never left. */
  world: World | null;
  provider: ChunkProviderClient | null;
  player: PlayerSnapshot | null;
}

/** A row of the world list (SaveFormatComparator). */
export interface SaveSummary {
  fileName: string;
  displayName: string;
  lastTimePlayed: number;
  gameType: number;
  hardcore: boolean;
  cheatsEnabled: boolean;
}

/**
 * The worlds of this session (ISaveFormat / SaveFormatOld). Nothing reaches the disk: leaving a
 * world suspends it here, with its player-modified chunks, entities and the player, and Play
 * picks it up again. Reloading the page forgets every world.
 */
export class SaveFormatMemory {
  static readonly instance = new SaveFormatMemory();
  private readonly saves = new Map<string, SaveEntry>();
  /** The folder of the world being played. */
  currentFolder: string | null = null;

  getSaveList(): SaveSummary[] {
    const list: SaveSummary[] = [];
    for (const e of this.saves.values()) {
      list.push({
        fileName: e.fileName,
        displayName: e.info.worldName,
        lastTimePlayed: e.info.lastTimePlayed,
        gameType: e.info.gameType,
        hardcore: e.info.hardcore,
        cheatsEnabled: e.info.allowCommands,
      });
    }
    // Most recently played first, then by folder name.
    return list.sort((a, b) => (a.lastTimePlayed !== b.lastTimePlayed ? b.lastTimePlayed - a.lastTimePlayed : a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0));
  }

  getWorldInfo(folder: string): WorldInfo | null {
    return this.saves.get(folder)?.info ?? null;
  }

  canLoadWorld(folder: string): boolean {
    return this.saves.has(folder);
  }

  renameWorld(folder: string, name: string): void {
    const e = this.saves.get(folder);
    if (e) e.info.worldName = name;
  }

  deleteWorldDirectory(folder: string): boolean {
    const e = this.saves.get(folder);
    if (!e) return false;
    e.provider?.dispose();
    this.saves.delete(folder);
    return true;
  }

  /** A new world was created: list it right away (WorldInfo is written before the server starts). */
  create(folder: string, info: WorldInfo): void {
    info.lastTimePlayed = Date.now();
    this.saves.set(folder, { fileName: folder, info, world: null, provider: null, player: null });
    this.currentFolder = folder;
  }

  /**
   * Leaving the world (the integrated server's save on shutdown): the chunks go into the
   * provider's in-memory store, the worker stops and the player is remembered.
   */
  saveAndSuspend(world: World, provider: ChunkProviderClient, player: EntityPlayer | null): boolean {
    const folder = this.currentFolder;
    const e = folder === null ? undefined : this.saves.get(folder);
    this.currentFolder = null;
    if (!e || e.info !== world.worldInfo) return false;
    if (player) {
      e.player = {
        x: player.posX,
        y: player.posY - player.yOffset,
        z: player.posZ,
        yaw: player.rotationYaw,
        pitch: player.rotationPitch,
        mainInventory: player.inventory.mainInventory.slice(),
        armorInventory: player.inventory.armorInventory.slice(),
        currentItem: player.inventory.currentItem,
        isFlying: player.capabilities.isFlying,
        dead: player.getHealth() <= 0,
        gameType: CommandGameMode.gameTypeOf(player),
        health: player.getHealth(),
        air: player.getAir(),
        experience: player.experience,
        experienceLevel: player.experienceLevel,
        experienceTotal: player.experienceTotal,
        foodStats: (player as unknown as SurvivalFields).foodStats,
      };
      world.removeEntity(player);
      if (player.addedToChunk && world.chunkExists(player.chunkCoordX, player.chunkCoordZ)) world.getChunkFromChunkCoords(player.chunkCoordX, player.chunkCoordZ).removeEntity(player);
      const i = world.loadedEntityList.indexOf(player);
      if (i >= 0) world.loadedEntityList.splice(i, 1);
    }
    provider.suspend();
    // Drops the unloaded chunks' entities and tile entities from the world's lists.
    world.updateEntities();
    e.world = world;
    e.provider = provider;
    e.info.lastTimePlayed = Date.now();
    return true;
  }

  /** Takes a suspended world out of the list for playing (the caller makes a new chunk provider). */
  resume(folder: string): SaveEntry | null {
    const e = this.saves.get(folder);
    if (!e || !e.world || !e.provider) return null;
    this.currentFolder = folder;
    e.info.lastTimePlayed = Date.now();
    return e;
  }

  /** The suspended world is running again. */
  markResumed(e: SaveEntry): void {
    e.world = null;
    e.provider = null;
  }

  /** Puts the saved player back (EntityPlayerMP reading its NBT). */
  static restorePlayer(p: EntityPlayer, s: PlayerSnapshot): void {
    p.setLocationAndAngles(s.x, s.y, s.z, s.yaw, s.pitch);
    p.prevRotationYaw = s.yaw;
    p.prevRotationPitch = s.pitch;
    for (let i = 0; i < s.mainInventory.length && i < p.inventory.mainInventory.length; i++) p.inventory.mainInventory[i] = s.mainInventory[i];
    for (let i = 0; i < s.armorInventory.length && i < p.inventory.armorInventory.length; i++) p.inventory.armorInventory[i] = s.armorInventory[i];
    p.inventory.currentItem = s.currentItem;
    CommandGameMode.applyGameType(p, s.gameType);
    p.capabilities.isFlying = s.isFlying && p.capabilities.allowFlying;
    p.setEntityHealth(s.health);
    p.prevHealth = s.health;
    p.setAir(s.air);
    p.experience = s.experience;
    p.experienceLevel = s.experienceLevel;
    p.experienceTotal = s.experienceTotal;
    if (s.foodStats !== undefined && 'foodStats' in p) (p as unknown as SurvivalFields).foodStats = s.foodStats;
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
