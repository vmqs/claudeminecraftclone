import { Block, materialOf } from '../../block/Block';
import { BlockIds } from '../../block/BlockIds';
import { Material } from '../../block/Material';
import type { AxisAlignedBB } from '../../core/AxisAlignedBB';
import { JavaRandom } from '../../core/JavaRandom';
import type { Entity } from '../../entity/Entity';
import type { ItemStack } from '../../item/ItemStack';
import { getBiome, type BiomeGenBase } from '../biome/BiomeGenBase';
import { Chunk, type ChunkHost } from '../Chunk';
import { EnumSkyBlock } from '../IBlockAccess';
import type { TileEntity } from '../tileentity/TileEntity';
import type { EntitySpawnDescriptor } from './WorldGenSpawning';
import type { WorldProviderInfo } from '../IWorld';
import type { BiomeSource } from './ChunkProviderGenerate';

/** Records population writes that land in another chunk, so regenerating it can replay them. */
export interface WriteLog {
  seq: number;
  ops: number[];
}

/**
 * The world-generation worker's world: a set of chunks being generated and populated. It
 * implements just enough of IWorld for terrain features and block callbacks. Lighting during
 * population is only the per-column skylight; the final light is computed on finalization.
 */
export class GenWorld implements ChunkHost {
  readonly isRemote = false;
  readonly rand = new JavaRandom(0n);
  readonly provider: WorldProviderInfo = { dimensionId: 0, isHellWorld: false, hasNoSky: false };
  readonly chunks = new Map<number, Chunk>();
  scheduledUpdatesAreImmediate = false;
  /** Chunk key of the chunk currently being populated (or null). */
  populatingKey: number | null = null;
  /** target chunk key -> source chunk key -> logged writes [x, y, z, id, meta, seq]... */
  readonly foreignWrites = new Map<number, Map<number, number[]>>();
  private writeSeq = 0;

  constructor(readonly biomeSource: BiomeSource) {}

  static key(cx: number, cz: number): number {
    return (cx + 0x200000) * 0x400000 + (cz + 0x200000);
  }

  chunkAt(x: number, z: number): Chunk | undefined {
    return this.chunks.get(GenWorld.key(x >> 4, z >> 4));
  }

  // ---------------------------------------------------------------- block access
  getBlockId(x: number, y: number, z: number): number {
    if (y < 0 || y >= 256) return 0;
    const c = this.chunkAt(x, z);
    return c ? c.getBlockID(x & 15, y, z & 15) : 0;
  }
  getBlockMetadata(x: number, y: number, z: number): number {
    if (y < 0 || y >= 256) return 0;
    const c = this.chunkAt(x, z);
    return c ? c.getBlockMetadata(x & 15, y, z & 15) : 0;
  }
  getBlockMaterial(x: number, y: number, z: number): Material {
    return materialOf(this.getBlockId(x, y, z));
  }
  isAirBlock(x: number, y: number, z: number): boolean {
    return this.getBlockId(x, y, z) === 0;
  }
  isBlockOpaqueCube(x: number, y: number, z: number): boolean {
    const b = Block.blocksList[this.getBlockId(x, y, z)];
    return b ? b.isOpaqueCube() : false;
  }
  isBlockNormalCube(x: number, y: number, z: number): boolean {
    return Block.isNormalCube(this.getBlockId(x, y, z));
  }
  isBlockNormalCubeDefault(x: number, y: number, z: number, def: boolean): boolean {
    if (!this.chunkAt(x, z)) return def;
    return this.isBlockNormalCube(x, y, z);
  }
  doesBlockHaveSolidTopSurface(x: number, y: number, z: number): boolean {
    const b = Block.blocksList[this.getBlockId(x, y, z)];
    return b ? b.hasSolidTopSurface(this.getBlockMetadata(x, y, z)) : false;
  }
  isBlockProvidingPowerTo(): number {
    return 0;
  }
  getBiomeGenForCoords(x: number, z: number): BiomeGenBase {
    const c = this.chunkAt(x, z);
    if (c) {
      const id = c.biomes[((z & 15) << 4) | (x & 15)];
      if (id !== 255) return getBiome(id);
    }
    return this.biomeSource.getBiomeGenAt(x, z);
  }
  getHeight(): number {
    return 256;
  }
  extendedLevelsInChunkCache(): boolean {
    return false;
  }
  blockExists(x: number, y: number, z: number): boolean {
    return y >= 0 && y < 256 && this.chunkAt(x, z) !== undefined;
  }
  checkChunksExist(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
    if (y1 < 0 || y0 >= 256) return false;
    for (let cx = x0 >> 4; cx <= x1 >> 4; cx++) for (let cz = z0 >> 4; cz <= z1 >> 4; cz++) if (!this.chunks.has(GenWorld.key(cx, cz))) return false;
    return true;
  }
  doChunksNearChunkExist(x: number, y: number, z: number, r: number): boolean {
    return this.checkChunksExist(x - r, y - r, z - r, x + r, y + r, z + r);
  }

  setBlock(x: number, y: number, z: number, id: number, meta = 0, flags = 3): boolean {
    if (y < 0 || y >= 256) return false;
    if (id !== 0 && !Block.blocksList[id]) return false;
    const cx = x >> 4;
    const cz = z >> 4;
    const key = GenWorld.key(cx, cz);
    const c = this.chunks.get(key);
    if (!c) return false;
    if (this.populatingKey !== null && this.populatingKey !== key) {
      let bySource = this.foreignWrites.get(key);
      if (!bySource) this.foreignWrites.set(key, (bySource = new Map()));
      let ops = bySource.get(this.populatingKey);
      if (!ops) bySource.set(this.populatingKey, (ops = []));
      ops.push(x, y, z, id, meta, this.writeSeq++);
    }
    const changed = c.setBlockIDWithMetadata(x & 15, y, z & 15, id, meta);
    if (changed && (flags & 1) !== 0) this.notifyBlocksOfNeighborChange(x, y, z, id);
    return changed;
  }
  setBlockMetadataWithNotify(x: number, y: number, z: number, meta: number, flags: number): boolean {
    const c = this.chunkAt(x, z);
    if (!c || y < 0 || y >= 256) return false;
    const changed = c.setBlockMetadata(x & 15, y, z & 15, meta);
    if (changed && (flags & 1) !== 0) this.notifyBlocksOfNeighborChange(x, y, z, this.getBlockId(x, y, z));
    return changed;
  }
  setBlockToAir(x: number, y: number, z: number): boolean {
    return this.setBlock(x, y, z, 0, 0, 3);
  }
  destroyBlock(x: number, y: number, z: number): boolean {
    return this.setBlock(x, y, z, 0, 0, 3);
  }
  notifyBlocksOfNeighborChange(x: number, y: number, z: number, id: number): void {
    this.notifyBlockOfNeighborChange(x - 1, y, z, id);
    this.notifyBlockOfNeighborChange(x + 1, y, z, id);
    this.notifyBlockOfNeighborChange(x, y - 1, z, id);
    this.notifyBlockOfNeighborChange(x, y + 1, z, id);
    this.notifyBlockOfNeighborChange(x, y, z - 1, id);
    this.notifyBlockOfNeighborChange(x, y, z + 1, id);
  }
  notifyBlockOfNeighborChange(x: number, y: number, z: number, id: number): void {
    const b = Block.blocksList[this.getBlockId(x, y, z)];
    if (b) b.onNeighborBlockChange(this, x, y, z, id);
  }
  markBlockForUpdate(): void {}
  markBlockRangeForRenderUpdate(): void {}
  markBlocksDirtyVertical(): void {}
  markBlockForRenderUpdate(): void {}

  /** Ticks queued while generating travel with the chunk to the main thread. */
  scheduleBlockUpdate(x: number, y: number, z: number, id: number, delay: number): void {
    // While populating (falling sand), updates run at once unless the block opts out
    // (fluids and fire: isUpdateTickImmediate), which then wait one tick on the main thread.
    if (this.scheduledUpdatesAreImmediate && id > 0) {
      if (Block.blocksList[id]?.isUpdateTickImmediate()) {
        if (this.checkChunksExist(x, y, z, x, y, z) && this.getBlockId(x, y, z) === id) Block.blocksList[id]!.updateTick(this, x, y, z, this.rand);
        return;
      }
      delay = 1;
    }
    const c = this.chunkAt(x, z);
    if (c) c.pendingTicks.push([x, y, z, id, delay]);
  }
  isBlockTickScheduled(): boolean {
    return false;
  }

  // ---------------------------------------------------------------- light
  getSavedLightValue(type: EnumSkyBlock, x: number, y: number, z: number): number {
    if (y < 0) y = 0;
    if (y >= 256) y = 255;
    const c = this.chunkAt(x, z);
    return c ? c.getSavedLightValue(type, x & 15, y, z & 15) : type === EnumSkyBlock.Sky ? 15 : 0;
  }
  getFullBlockLightValue(x: number, y: number, z: number): number {
    if (y < 0) return 0;
    if (y >= 256) y = 255;
    const c = this.chunkAt(x, z);
    return c ? c.getBlockLightValue(x & 15, y, z & 15, 0) : 15;
  }
  getBlockLightValue(x: number, y: number, z: number): number {
    return this.getFullBlockLightValue(x, y, z);
  }
  getLightBrightnessForSkyBlocks(x: number, y: number, z: number, min: number): number {
    const sky = this.getSavedLightValue(EnumSkyBlock.Sky, x, y, z);
    let block = this.getSavedLightValue(EnumSkyBlock.Block, x, y, z);
    if (block < min) block = min;
    return (sky << 20) | (block << 4);
  }
  getBrightness(x: number, y: number, z: number): number {
    return this.getFullBlockLightValue(x, y, z) / 15;
  }
  getLightBrightness(x: number, y: number, z: number): number {
    return this.getFullBlockLightValue(x, y, z) / 15;
  }
  canBlockSeeTheSky(x: number, y: number, z: number): boolean {
    const c = this.chunkAt(x, z);
    return c ? c.canBlockSeeTheSky(x & 15, y, z & 15) : true;
  }
  getHeightValue(x: number, z: number): number {
    const c = this.chunkAt(x, z);
    return c ? c.getHeightValue(x & 15, z & 15) : 0;
  }
  getChunkHeightMapMinimum(x: number, z: number): number {
    const c = this.chunkAt(x, z);
    return c ? c.heightMapMinimum : 0;
  }
  getPrecipitationHeight(x: number, z: number): number {
    const c = this.chunkAt(x, z);
    return c ? c.getPrecipitationHeight(x & 15, z & 15) : 0;
  }
  getTopSolidOrLiquidBlock(x: number, z: number): number {
    const c = this.chunkAt(x, z);
    if (!c) return -1;
    let y = c.getTopFilledSegment() + 15;
    for (; y > 0; y--) {
      const id = c.getBlockID(x & 15, y, z & 15);
      const b = Block.blocksList[id];
      if (id !== 0 && b && b.blockMaterial.blocksMovement() && b.blockMaterial !== Material.leaves) return y + 1;
    }
    return -1;
  }
  updateLightByType(): void {}
  updateAllLightTypes(): void {}

  isBlockFreezable(x: number, y: number, z: number): boolean {
    if (this.getBiomeGenForCoords(x, z).getFloatTemperature() > 0.15) return false;
    if (y >= 0 && y < 256 && this.getSavedLightValue(EnumSkyBlock.Block, x, y, z) < 10) {
      const id = this.getBlockId(x, y, z);
      if ((id === BlockIds.waterStill || id === BlockIds.waterMoving) && this.getBlockMetadata(x, y, z) === 0) return true;
    }
    return false;
  }
  canSnowAt(x: number, y: number, z: number): boolean {
    if (this.getBiomeGenForCoords(x, z).getFloatTemperature() > 0.15) return false;
    if (y >= 0 && y < 256 && this.getSavedLightValue(EnumSkyBlock.Block, x, y, z) < 10) {
      const below = this.getBlockId(x, y - 1, z);
      const here = this.getBlockId(x, y, z);
      const snow = Block.blocksList[BlockIds.snow];
      if (here === 0 && snow && snow.canPlaceBlockAt(this, x, y, z) && below !== 0 && below !== BlockIds.ice && Block.blocksList[below]!.blockMaterial.blocksMovement()) {
        return true;
      }
    }
    return false;
  }
  canLightningStrikeAt(): boolean {
    return false;
  }
  isRaining(): boolean {
    return false;
  }
  getWorldTime(): number {
    return 0;
  }
  getTotalWorldTime(): number {
    return 0;
  }

  // ---------------------------------------------------------------- no-ops while generating
  playSoundEffect(): void {}
  playSound(): void {}
  playAuxSFX(): void {}
  spawnParticle(): void {}
  spawnEntityInWorld(_e: Entity): boolean {
    return false;
  }
  dropItemStack(_x: number, _y: number, _z: number, _s: ItemStack): void {}

  /** World-generation animals travel with the chunk they stand in. */
  recordSpawn(d: EntitySpawnDescriptor): void {
    this.chunkAt(Math.floor(d.x), Math.floor(d.z))?.pendingSpawns.push(d);
  }

  // ---------------------------------------------------------------- tile entities (not ticked here)
  /** Tile entities placed while generating travel with the chunk payload as descriptors. */
  getBlockTileEntity(x: number, y: number, z: number): TileEntity | null {
    if (y < 0 || y >= 256) return null;
    return this.chunkAt(x, z)?.getChunkBlockTileEntity(x & 15, y, z & 15) ?? null;
  }
  setBlockTileEntity(x: number, y: number, z: number, te: TileEntity | null): void {
    if (te && !te.isInvalid()) this.chunkAt(x, z)?.setChunkBlockTileEntity(x & 15, y, z & 15, te);
  }
  removeBlockTileEntity(x: number, y: number, z: number): void {
    const c = this.chunkAt(x, z);
    if (!c) return;
    const k = Chunk.teKey(x & 15, y, z & 15);
    c.chunkTileEntityMap.get(k)?.invalidate();
    c.chunkTileEntityMap.delete(k);
  }
  addTileEntities(): void {}
  updateTileEntityChunkAndDoNothing(): void {}
  notifyComparatorsOfChange(): void {}
  getEntitiesWithinAABBExcludingEntity(): Entity[] {
    return [];
  }
  getCollidingBoundingBoxes(_e: Entity, _box: AxisAlignedBB): AxisAlignedBB[] {
    return [];
  }
  checkNoEntityCollision(): boolean {
    return true;
  }
  canPlaceEntityOnSide(blockId: number, x: number, y: number, z: number, _ignore: boolean, side: number, _e: Entity | null, stack: ItemStack | null): boolean {
    const existing = Block.blocksList[this.getBlockId(x, y, z)];
    const b = Block.blocksList[blockId];
    if (existing && (existing.blockID === BlockIds.waterMoving || existing.blockID === BlockIds.waterStill || existing.blockMaterial.isReplaceable())) {
      // fall through: replaceable
    } else if (existing) {
      return false;
    }
    return blockId > 0 && !!b && b.canPlaceBlockOnSide(this, x, y, z, side, stack);
  }
}
