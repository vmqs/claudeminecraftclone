import { JavaRandom } from '../core/JavaRandom';
import type { World, WorldInfo } from '../world/World';
import { InventoryEnderChest } from '../world/tileentity/TileEntityEnderChest';
import { EnumGameType } from '../world/EnumGameType';
import { ChunkCoordinates } from './EntityLiving';
import { EntityPlayer } from './EntityPlayer';
import type { FoodStats } from './FoodStats';

/** What a player keeps in its save data beyond position and inventory (EntityPlayerMP's NBT). */
export interface PlayerSurvivalState {
  gameType: number;
  health: number;
  air: number;
  fallDistance: number;
  food: ReturnType<FoodStats['writeNBT']>;
  xpLevel: number;
  xpTotal: number;
  xpProgress: number;
  score: number;
  spawn: { x: number; y: number; z: number; forced: boolean } | null;
}

/**
 * The server's side of (re)spawning a player (EntityPlayerMP's constructor,
 * ServerConfigurationManager.respawnPlayer and EntityPlayer.verifyRespawnCoordinates). It only
 * touches the world and the player, so a host can run it for remote players too.
 */
export const PlayerSpawning = {
  /**
   * ItemInWorldManager.initializeGameType: a player without a mode of its own takes the world's
   * (the default game mode); its capabilities follow.
   */
  initializeGameType(p: EntityPlayer, info: WorldInfo): EnumGameType {
    if (p.gameType === EnumGameType.NOT_SET) p.gameType = EnumGameType.getByID(info.gameType);
    p.gameType.configurePlayerCapabilities(p.capabilities);
    return p.gameType;
  },

  /**
   * A new player stands on the ground within 10 blocks of the world spawn (exactly on it in an
   * Adventure world), then rises until nothing overlaps it.
   */
  placeAtWorldSpawn(p: EntityPlayer, w: World, rand: JavaRandom = new JavaRandom()): void {
    const info = w.worldInfo;
    let x = info.spawnX;
    let y = info.spawnY;
    let z = info.spawnZ;
    if (info.gameType !== EnumGameType.ADVENTURE.getID()) {
      // max(5, spawn protection 16 - 6) = 10
      const r = 10;
      x += rand.nextInt(r * 2) - r;
      z += rand.nextInt(r * 2) - r;
      y = w.getTopSolidOrLiquidBlock(x, z);
    }
    p.setLocationAndAngles(x + 0.5, y, z + 0.5, 0, 0);
    PlayerSpawning.moveOutOfBlocks(p, w);
  },

  moveOutOfBlocks(p: EntityPlayer, w: World): void {
    for (let i = 0; i < 256 && w.getCollidingBoundingBoxes(p, p.boundingBox).length > 0; i++) p.setPosition(p.posX, p.posY + 1, p.posZ);
  },

  /**
   * Where a bed (or forced /spawnpoint) lets the player respawn: next to an intact bed, or for a
   * forced spawn the spot itself if feet and head are free of solids and liquids; null otherwise.
   */
  verifyRespawnCoordinates(w: World, c: ChunkCoordinates, forced: boolean): ChunkCoordinates | null {
    return EntityPlayer.verifyRespawnCoordinates(w, c, forced);
  },

  /**
   * respawnPlayer: the new player inherits what survives death (clonePlayer), keeps the old
   * one's game mode, and appears at its bed when the bed is still there; a missing bed sends
   * "Your home bed was missing or obstructed" and the world spawn is used.
   */
  respawn(p: EntityPlayer, old: EntityPlayer, w: World, keepEverything = false): void {
    const bed = old.getBedLocation();
    const forced = old.isSpawnForced();
    p.clonePlayer(old, keepEverything);
    const enderFrom = InventoryEnderChest.forPlayer(old);
    const enderTo = InventoryEnderChest.forPlayer(p);
    for (let i = 0; i < enderFrom.getSizeInventory(); i++) enderTo.setInventorySlotContents(i, enderFrom.getStackInSlot(i));
    p.gameType = old.gameType;
    PlayerSpawning.initializeGameType(p, w.worldInfo);
    PlayerSpawning.placeAtWorldSpawn(p, w);
    if (bed) {
      const spot = PlayerSpawning.verifyRespawnCoordinates(w, bed, forced);
      if (spot) {
        p.setLocationAndAngles(Math.fround(spot.posX + 0.5), Math.fround(spot.posY + 0.1), Math.fround(spot.posZ + 0.5), 0, 0);
        p.setSpawnChunk(bed, forced);
      } else {
        p.addChatMessage('tile.bed.notValid');
      }
    }
    PlayerSpawning.moveOutOfBlocks(p, w);
  },

  /** writeEntityToNBT's survival fields. */
  captureState(p: EntityPlayer): PlayerSurvivalState {
    const bed = p.getBedLocation();
    return {
      gameType: p.gameType.getID(),
      health: p.getHealth(),
      air: p.getAir(),
      fallDistance: p.fallDistance,
      food: p.getFoodStats().writeNBT(),
      xpLevel: p.experienceLevel,
      xpTotal: p.experienceTotal,
      xpProgress: p.experience,
      score: p.getScore(),
      spawn: bed ? { x: bed.posX, y: bed.posY, z: bed.posZ, forced: p.isSpawnForced() } : null,
    };
  },

  /**
   * readEntityFromNBT's survival fields. A player saved dead comes back as a fresh one that only
   * keeps its game mode and bed (it respawned).
   */
  restoreState(p: EntityPlayer, s: PlayerSurvivalState, dead: boolean): void {
    if (s.gameType >= 0) p.gameType = EnumGameType.getByID(s.gameType);
    p.setSpawnChunk(s.spawn ? new ChunkCoordinates(s.spawn.x, s.spawn.y, s.spawn.z) : null, s.spawn?.forced ?? false);
    if (dead) return;
    p.setEntityHealth(s.health);
    p.setAir(s.air);
    p.fallDistance = s.fallDistance;
    p.getFoodStats().readNBT(s.food);
    p.experienceLevel = s.xpLevel;
    p.experienceTotal = s.xpTotal;
    p.experience = s.xpProgress;
    p.addScore(s.score - p.getScore());
  },

  /** The world's difficulty (setDifficultyForAllWorlds): the options' value, Hard in Hardcore. */
  applyDifficulty(w: World, optionsDifficulty: number): void {
    w.difficultySetting = w.worldInfo.hardcore ? 3 : optionsDifficulty;
  },
};
