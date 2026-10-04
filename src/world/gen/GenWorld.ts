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
import type { TagCompound } from '../../item/ItemStack';
import type { EntitySpawnDescriptor } from './WorldGenSpawning';
import type { WorldProviderInfo } from '../IWorld';
import type { BiomeSource } from './ChunkProviderGenerate';

/** Facing offsets (down, up, north, south, west, east) and World.lightUpdateBlockList. */
const SIDE_X = [0, 0, 0, 0, -1, 1];
const SIDE_Y = [-1, 1, 0, 0, 0, 0];
const SIDE_Z = [0, 0, -1, 1, 0, 0];
const lightUpdateBlockList = new Int32Array(32768);
/** Width of GenWorld's chunk cache grid (a power of two). */
const GRID = 64;

/**
 * The world-generation worker's world: a set of chunks being generated and populated. It
 * implements just enough of IWorld for terrain features and block callbacks. Light is kept up to
 * date during population as in the original (it decides where some features go); the light sent
 * with a finished chunk is recomputed on finalization.
 */
export class GenWorld implements ChunkHost {
  readonly isRemote = false;
  readonly rand = new JavaRandom(0n);
  /** The provider flags of the dimension being generated (WorldGenServer sets the Nether's or the End's). */
  provider: WorldProviderInfo = { dimensionId: 0, isHellWorld: false, hasNoSky: false };
  readonly chunks = new Map<number, Chunk>();
  scheduledUpdatesAreImmediate = false;
  /** WorldProvider.getAverageGroundLevel of this world (64, or 4 for superflat). */
  averageGroundLevel = 64;
  /**
   * Generated tile entities as NBT (chest and dispenser contents, spawner mobs), by chunk key and
   * Chunk.teKey. They travel with the chunk payload; the main thread loads them through
   * TileEntity.createAndLoadEntity once the block classes exist.
   */
  readonly tileTags = new Map<number, Map<number, TagCompound>>();
  /**
   * Called for a chunk that is not present while a feature reads or writes it (the original
   * loads or generates it then); returns the chunk or undefined.
   */
  missingChunk: ((cx: number, cz: number) => Chunk | undefined) | null = null;
  /**
   * Block changes made through setBlock / setBlockMetadataWithNotify, counted per chunk in the
   * same direct-mapped grid as the chunk cache (chunks 64 apart share a counter, which can only
   * make a change look bigger).
   */
  readonly blockWrites = new Uint32Array(GRID * GRID);

  /** Block writes counted so far for chunk (cx, cz) (see blockWrites). */
  writesIn(cx: number, cz: number): number {
    return this.blockWrites[((cx & (GRID - 1)) * GRID) | (cz & (GRID - 1))];
  }

  constructor(readonly biomeSource: BiomeSource) {}

  static key(cx: number, cz: number): number {
    return (cx + 0x200000) * 0x400000 + (cz + 0x200000);
  }

  /** The chunk coordinates of a key. */
  static unkey(k: number): [number, number] {
    return [Math.floor(k / 0x400000) - 0x200000, (k % 0x400000) - 0x200000];
  }

  /** The last chunk looked up (keys are not small integers, so Map lookups are slow). */
  private lastCx = 0x7fffffff;
  private lastCz = 0x7fffffff;
  private lastChunk: Chunk | undefined = undefined;
  /**
   * A direct-mapped cache of chunks by (cx & 63, cz & 63), checked against the chunk's
   * coordinates; entries are cleared when their chunk leaves the working set.
   */
  private readonly grid: (Chunk | undefined)[] = new Array<Chunk | undefined>(GRID * GRID).fill(undefined);

  /** The loaded chunk (cx, cz), or undefined; never loads one. */
  loadedChunk(cx: number, cz: number): Chunk | undefined {
    if (cx === this.lastCx && cz === this.lastCz) return this.lastChunk;
    const gi = ((cx & (GRID - 1)) * GRID) | (cz & (GRID - 1));
    let c = this.grid[gi];
    if (c === undefined || c.xPosition !== cx || c.zPosition !== cz) {
      c = this.chunks.get(GenWorld.key(cx, cz));
      if (!c) return undefined;
      this.grid[gi] = c;
    }
    this.lastCx = cx;
    this.lastCz = cz;
    this.lastChunk = c;
    return c;
  }

  /** The last chunk range checkChunksExist found loaded (min cx, min cz, max cx, max cz). */
  private readonly lastExisting = new Int32Array([1, 1, 0, 0]);

  /** Removes a chunk from the working set. */
  unloadChunk(k: number): void {
    const c = this.chunks.get(k);
    if (c) {
      const gi = ((c.xPosition & (GRID - 1)) * GRID) | (c.zPosition & (GRID - 1));
      if (this.grid[gi] === c) this.grid[gi] = undefined;
    }
    this.chunks.delete(k);
    this.lastExisting.set([1, 1, 0, 0]);
    this.lastCx = this.lastCz = 0x7fffffff;
    this.lastChunk = undefined;
  }

  chunkAt(x: number, z: number): Chunk | undefined {
    const c = this.loadedChunk(x >> 4, z >> 4);
    if (c || !this.missingChunk) return c;
    return this.missingChunk(x >> 4, z >> 4);
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
    const ax = x0 >> 4;
    const az = z0 >> 4;
    const bx = x1 >> 4;
    const bz = z1 >> 4;
    // Chunks only leave the working set through unloadChunk, so a positive answer stays valid.
    const ok = this.lastExisting;
    if (ok[0] <= ax && ok[1] <= az && ok[2] >= bx && ok[3] >= bz) return true;
    for (let cx = ax; cx <= bx; cx++) for (let cz = az; cz <= bz; cz++) if (!this.loadedChunk(cx, cz)) return false;
    ok[0] = ax;
    ok[1] = az;
    ok[2] = bx;
    ok[3] = bz;
    return true;
  }
  doChunksNearChunkExist(x: number, y: number, z: number, r: number): boolean {
    return this.checkChunksExist(x - r, y - r, z - r, x + r, y + r, z + r);
  }

  setBlock(x: number, y: number, z: number, id: number, meta = 0, flags = 3): boolean {
    if (y < 0 || y >= 256) return false;
    if (id !== 0 && !Block.blocksList[id]) return false;
    const c = this.chunkAt(x, z);
    if (!c) return false;
    const changed = c.setBlockIDWithMetadata(x & 15, y, z & 15, id, meta);
    if (changed) this.countWrite(c);
    this.updateAllLightTypes(x, y, z);
    if (changed && (flags & 1) !== 0) this.notifyBlocksOfNeighborChange(x, y, z, id);
    return changed;
  }
  setBlockMetadataWithNotify(x: number, y: number, z: number, meta: number, flags: number): boolean {
    const c = this.chunkAt(x, z);
    if (!c || y < 0 || y >= 256) return false;
    const changed = c.setBlockMetadata(x & 15, y, z & 15, meta);
    if (changed) this.countWrite(c);
    if (changed && (flags & 1) !== 0) this.notifyBlocksOfNeighborChange(x, y, z, this.getBlockId(x, y, z));
    return changed;
  }
  private countWrite(c: Chunk): void {
    this.blockWrites[((c.xPosition & (GRID - 1)) * GRID) | (c.zPosition & (GRID - 1))]++;
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
  /** World.getSavedLightValue: the default (sky 15, block 0) where no chunk is loaded; never loads one. */
  getSavedLightValue(type: EnumSkyBlock, x: number, y: number, z: number): number {
    if (y < 0) y = 0;
    if (y >= 256) y = 255;
    const c = this.loadedChunk(x >> 4, z >> 4);
    return c ? c.getSavedLightValue(type, x & 15, y, z & 15) : type === EnumSkyBlock.Sky ? 15 : 0;
  }
  setLightValue(type: EnumSkyBlock, x: number, y: number, z: number, v: number): void {
    if (y < 0 || y >= 256) return;
    this.loadedChunk(x >> 4, z >> 4)?.setLightValue(type, x & 15, y, z & 15, v);
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
  /**
   * World.updateAllLightTypes. Like the original, every block change during population updates
   * light incrementally, but only where all chunks within 17 blocks are loaded; elsewhere just the
   * column sky light of Chunk.relightBlock changes. Features such as flowers, snow and lake grass
   * read this light, so it decides where they generate.
   */
  updateAllLightTypes(x: number, y: number, z: number): void {
    if (!this.provider.hasNoSky) this.updateLightByType(EnumSkyBlock.Sky, x, y, z);
    this.updateLightByType(EnumSkyBlock.Block, x, y, z);
  }

  private computeLightValue(x: number, y: number, z: number, type: EnumSkyBlock): number {
    if (type === EnumSkyBlock.Sky && this.canBlockSeeTheSky(x, y, z)) return 15;
    const id = this.getBlockId(x, y, z);
    let light = type === EnumSkyBlock.Sky ? 0 : Block.lightValue[id];
    let op = Block.lightOpacity[id];
    if (op >= 15 && Block.lightValue[id] > 0) op = 1;
    if (op < 1) op = 1;
    if (op >= 15) return 0;
    if (light >= 14) return light;
    for (let s = 0; s < 6; s++) {
      const v = this.getSavedLightValue(type, x + SIDE_X[s], y + SIDE_Y[s], z + SIDE_Z[s]) - op;
      if (v > light) light = v;
      if (light >= 14) return light;
    }
    return light;
  }

  /** World.updateLightByType: darkens then re-brightens up to 17 blocks around (x, y, z). */
  updateLightByType(type: EnumSkyBlock, x: number, y: number, z: number): void {
    if (!this.doChunksNearChunkExist(x, y, z, 17)) return;
    const list = lightUpdateBlockList;
    let read = 0;
    let write = 0;
    const saved = this.getSavedLightValue(type, x, y, z);
    const computed = this.computeLightValue(x, y, z, type);
    if (computed > saved) {
      list[write++] = 133152;
    } else if (computed < saved) {
      list[write++] = 133152 | (saved << 18);
      while (read < write) {
        const e = list[read++];
        const ex = (e & 63) - 32 + x;
        const ey = ((e >> 6) & 63) - 32 + y;
        const ez = ((e >> 12) & 63) - 32 + z;
        const level = (e >> 18) & 15;
        if (this.getSavedLightValue(type, ex, ey, ez) !== level) continue;
        this.setLightValue(type, ex, ey, ez, 0);
        if (level <= 0 || Math.abs(ex - x) + Math.abs(ey - y) + Math.abs(ez - z) >= 17) continue;
        for (let s = 0; s < 6; s++) {
          const nx = ex + SIDE_X[s];
          const ny = ey + SIDE_Y[s];
          const nz = ez + SIDE_Z[s];
          const op = Math.max(1, Block.lightOpacity[this.getBlockId(nx, ny, nz)]);
          if (this.getSavedLightValue(type, nx, ny, nz) === level - op && write < list.length) {
            list[write++] = (nx - x + 32) | ((ny - y + 32) << 6) | ((nz - z + 32) << 12) | ((level - op) << 18);
          }
        }
      }
      read = 0;
    }
    while (read < write) {
      const e = list[read++];
      const ex = (e & 63) - 32 + x;
      const ey = ((e >> 6) & 63) - 32 + y;
      const ez = ((e >> 12) & 63) - 32 + z;
      const cur = this.getSavedLightValue(type, ex, ey, ez);
      const val = this.computeLightValue(ex, ey, ez, type);
      if (val === cur) continue;
      this.setLightValue(type, ex, ey, ez, val);
      if (val <= cur || Math.abs(ex - x) + Math.abs(ey - y) + Math.abs(ez - z) >= 17 || write >= list.length - 6) continue;
      const base = (ey - y + 32) << 6;
      const zb = (ez - z + 32) << 12;
      if (this.getSavedLightValue(type, ex - 1, ey, ez) < val) list[write++] = ex - 1 - x + 32 + base + zb;
      if (this.getSavedLightValue(type, ex + 1, ey, ez) < val) list[write++] = ex + 1 - x + 32 + base + zb;
      if (this.getSavedLightValue(type, ex, ey - 1, ez) < val) list[write++] = ex - x + 32 + ((ey - 1 - y + 32) << 6) + zb;
      if (this.getSavedLightValue(type, ex, ey + 1, ez) < val) list[write++] = ex - x + 32 + ((ey + 1 - y + 32) << 6) + zb;
      if (this.getSavedLightValue(type, ex, ey, ez - 1) < val) list[write++] = ex - x + 32 + base + ((ez - 1 - z + 32) << 12);
      if (this.getSavedLightValue(type, ex, ey, ez + 1) < val) list[write++] = ex - x + 32 + base + ((ez + 1 - z + 32) << 12);
    }
  }

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
  /** GenTileEntitySink: remembers generated tile-entity NBT for the chunk payload. */
  setGenTileEntity(x: number, y: number, z: number, tag: TagCompound): void {
    if (y < 0 || y >= 256) return;
    const k = GenWorld.key(x >> 4, z >> 4);
    let m = this.tileTags.get(k);
    if (!m) this.tileTags.set(k, (m = new Map()));
    m.set(Chunk.teKey(x & 15, y, z & 15), tag);
  }

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
