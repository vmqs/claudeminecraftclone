import type { JavaRandom } from '../core/JavaRandom';
import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { Entity } from '../entity/Entity';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { ItemStack } from '../item/ItemStack';
import type { EnumSkyBlock, IBlockAccess } from './IBlockAccess';
import type { TileEntity } from './tileentity/TileEntity';

export interface WorldProviderInfo {
  dimensionId: number;
  isHellWorld: boolean;
  hasNoSky: boolean;
}

/**
 * What block and item behaviour may call on a world. Implemented by the client World
 * (main thread) and by the world-generation worker's GenWorld, so block code stays
 * worker-safe. Methods that make no sense during generation (sounds, particles,
 * entities) are no-ops there.
 */
export interface IWorld extends IBlockAccess {
  readonly isRemote: boolean;
  readonly rand: JavaRandom;
  readonly provider: WorldProviderInfo;

  setBlock(x: number, y: number, z: number, id: number, meta?: number, flags?: number): boolean;
  setBlockMetadataWithNotify(x: number, y: number, z: number, meta: number, flags: number): boolean;
  setBlockToAir(x: number, y: number, z: number): boolean;
  destroyBlock(x: number, y: number, z: number, dropItems: boolean): boolean;
  blockExists(x: number, y: number, z: number): boolean;
  checkChunksExist(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean;
  doChunksNearChunkExist(x: number, y: number, z: number, radius: number): boolean;

  /** `exceptSide` skips the neighbour on that side (World.notifyBlocksOfNeighborChange with a side). */
  notifyBlocksOfNeighborChange(x: number, y: number, z: number, blockId: number, exceptSide?: number): void;
  notifyBlockOfNeighborChange(x: number, y: number, z: number, blockId: number): void;
  markBlockForUpdate(x: number, y: number, z: number): void;
  markBlockRangeForRenderUpdate(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void;
  /** `priority` orders updates due in the same tick (func_82740_a); lower runs first. */
  scheduleBlockUpdate(x: number, y: number, z: number, blockId: number, delay: number, priority?: number): void;
  isBlockTickScheduled(x: number, y: number, z: number, blockId: number): boolean;

  getBlockLightValue(x: number, y: number, z: number): number;
  getFullBlockLightValue(x: number, y: number, z: number): number;
  getSavedLightValue(type: EnumSkyBlock, x: number, y: number, z: number): number;
  canBlockSeeTheSky(x: number, y: number, z: number): boolean;
  getHeightValue(x: number, z: number): number;
  getPrecipitationHeight(x: number, z: number): number;
  getTopSolidOrLiquidBlock(x: number, z: number): number;
  isBlockNormalCubeDefault(x: number, y: number, z: number, def: boolean): boolean;
  isBlockFreezable(x: number, y: number, z: number): boolean;
  canSnowAt(x: number, y: number, z: number): boolean;
  canLightningStrikeAt(x: number, y: number, z: number): boolean;
  isRaining(): boolean;
  getWorldTime(): number;
  getTotalWorldTime(): number;

  playSoundEffect(x: number, y: number, z: number, name: string, volume: number, pitch: number): void;
  playSound(x: number, y: number, z: number, name: string, volume: number, pitch: number, distanceDelay: boolean): void;
  playAuxSFX(type: number, x: number, y: number, z: number, data: number): void;
  spawnParticle(name: string, x: number, y: number, z: number, vx: number, vy: number, vz: number): void;

  getBlockTileEntity(x: number, y: number, z: number): TileEntity | null;
  setBlockTileEntity(x: number, y: number, z: number, te: TileEntity | null): void;
  removeBlockTileEntity(x: number, y: number, z: number): void;
  /** A tile entity's contents changed (marks the chunk modified). */
  updateTileEntityChunkAndDoNothing(x: number, y: number, z: number, te: TileEntity): void;
  /** func_96440_m: tells comparators next to (x, y, z) that the container changed. */
  notifyComparatorsOfChange(x: number, y: number, z: number, blockId: number): void;

  spawnEntityInWorld(entity: Entity): boolean;
  /** Drops an item stack as an entity (Block.dropBlockAsItem_do); a no-op while generating. */
  dropItemStack(x: number, y: number, z: number, stack: ItemStack): void;
  getEntitiesWithinAABBExcludingEntity(exclude: Entity | null, box: AxisAlignedBB): Entity[];
  getCollidingBoundingBoxes(entity: Entity, box: AxisAlignedBB): AxisAlignedBB[];
  checkNoEntityCollision(box: AxisAlignedBB, except?: Entity | null): boolean;
  /** World.canPlaceEntityOnSide: can block `blockId` be placed at (x, y, z) against `side`. */
  canPlaceEntityOnSide(blockId: number, x: number, y: number, z: number, ignoreEntities: boolean, side: number, entity: Entity | null, stack: ItemStack | null): boolean;

  // Optional: what only the client World provides (block behaviour calls these with ?.).
  /** WorldServer.addBlockEvent: queued and delivered to Block.onBlockEventReceived at the end of the tick. */
  addBlockEvent?(x: number, y: number, z: number, blockId: number, eventId: number, param: number): void;
  /** Level event caused by a player (doors: 1003 open, 1006 close). */
  playAuxSFXAtEntity?(player: EntityPlayer | null, type: number, x: number, y: number, z: number, data: number): void;
  /** A jukebox starts (or, with null, stops) a record. */
  playRecord?(name: string | null, x: number, y: number, z: number): void;
  isDaytime?(): boolean;
  /** Redstone power reaching (x, y, z); absent while redstone logic is out of scope. */
  isBlockIndirectlyGettingPowered?(x: number, y: number, z: number): boolean;
  readonly playerEntities?: readonly EntityPlayer[];
  getClosestPlayer?(x: number, y: number, z: number, maxDist: number): EntityPlayer | null;
  /** Redstone: the strongest power reaching (x, y, z) through `side` (getIndirectPowerLevelTo). */
  getIndirectPowerLevelTo?(x: number, y: number, z: number, side: number): number;
  /** Redstone: whether (x, y, z) gives power through `side` (getIndirectPowerOutput). */
  getIndirectPowerOutput?(x: number, y: number, z: number, side: number): boolean;
  /** A new, not yet spawned item entity (EntityItem constructor); null when items are not installed. */
  createItemEntity?(x: number, y: number, z: number, stack: ItemStack): Entity | null;
}
