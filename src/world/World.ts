import { Block } from '../block/Block';
import { BlockIds } from '../block/BlockIds';
import { BlockFluid } from '../block/BlockFluid';
import { Material } from '../block/Material';
import { AxisAlignedBB } from '../core/AxisAlignedBB';
import { Facing } from '../core/Facing';
import { JavaRandom } from '../core/JavaRandom';
import { MathHelper } from '../core/MathHelper';
import type { MovingObjectPosition } from '../core/MovingObjectPosition';
import { Vec3 } from '../core/Vec3';
import type { Entity } from '../entity/Entity';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { ItemStack } from '../item/ItemStack';
import { getBiome, type BiomeGenBase } from './biome/BiomeGenBase';
import { Chunk, EmptyChunk } from './Chunk';
import { EnumSkyBlock, SKY_BLOCK_DEFAULT, type IBlockAccess } from './IBlockAccess';
import type { IWorld } from './IWorld';
import type { IWorldAccess } from './IWorldAccess';
import { NextTickListEntry, TickScheduler } from './NextTickListEntry';
import { WorldProvider } from './WorldProvider';

const f = Math.fround;

/** WorldInfo: the saved state of a world (here kept only for the session). */
export class WorldInfo {
  worldName = 'New World';
  seed = 0n;
  terrainType = 'default';
  mapFeaturesEnabled = true;
  worldTime = 0;
  totalTime = 0;
  spawnX = 0;
  spawnY = 64;
  spawnZ = 0;
  raining = false;
  rainTime = 0;
  thundering = false;
  thunderTime = 0;
  gameRules: Record<string, boolean> = {
    doFireTick: true,
    mobGriefing: true,
    keepInventory: false,
    doMobSpawning: true,
    doMobLoot: true,
    doTileDrops: true,
    commandBlockOutput: true,
  };
}

/** Factory for dropped item entities (installed by the entity code; null = items vanish). */
export type ItemDropFactory = (w: World, x: number, y: number, z: number, stack: ItemStack) => Entity | null;

/**
 * The client world. There is no integrated server: this is authoritative and runs the
 * simulation (block updates, lighting, entities, weather, time).
 */
export class World implements IWorld, IBlockAccess {
  static itemDropFactory: ItemDropFactory | null = null;

  readonly isRemote = false;
  readonly rand = new JavaRandom();
  readonly provider = new WorldProvider();
  readonly worldInfo: WorldInfo;
  readonly worldAccesses: IWorldAccess[] = [];
  readonly loadedEntityList: Entity[] = [];
  protected unloadedEntityList: Entity[] = [];
  readonly playerEntities: EntityPlayer[] = [];
  readonly weatherEffects: Entity[] = [];
  /** Tile entities that tick (the tile-entity code fills this). */
  readonly loadedTileEntityList: { updateEntity?(): void; isInvalid?(): boolean }[] = [];
  skylightSubtracted = 0;
  protected updateLCG = new JavaRandom().nextInt();
  protected prevRainingStrength = 0;
  protected rainingStrength = 0;
  protected prevThunderingStrength = 0;
  protected thunderingStrength = 0;
  lastLightningBolt = 0;
  difficultySetting = 2;
  /** Pending scheduled block updates. */
  private readonly pendingTicks = new TickScheduler();
  private readonly lightUpdateBlockList = new Int32Array(32768);
  private readonly chunks = new Map<number, Chunk>();
  private readonly emptyChunk: EmptyChunk;
  private lastChunk: Chunk | null = null;
  private lastChunkKey = Number.NaN;
  private ambientTickCountdown: number;
  private readonly activeChunkSet = new Set<number>();
  private readonly collidingBoundingBoxes: AxisAlignedBB[] = [];
  /** Spawn hook for natural mob spawning (SpawnerAnimals; installed by the mob code). */
  mobSpawner: ((w: World) => void) | null = null;

  constructor(info: WorldInfo) {
    this.worldInfo = info;
    this.provider.terrainType = info.terrainType;
    this.emptyChunk = new EmptyChunk(this, 0, 0);
    this.ambientTickCountdown = this.rand.nextInt(12000);
    this.calculateInitialWeather();
  }

  // ------------------------------------------------------------------ chunks

  static chunkKey(cx: number, cz: number): number {
    return (cx + 0x200000) * 0x400000 + (cz + 0x200000);
  }

  chunkExists(cx: number, cz: number): boolean {
    return this.chunks.has(World.chunkKey(cx, cz));
  }

  getChunkFromChunkCoords(cx: number, cz: number): Chunk {
    const k = World.chunkKey(cx, cz);
    if (k === this.lastChunkKey && this.lastChunk) return this.lastChunk;
    const c = this.chunks.get(k);
    if (!c) return this.emptyChunk;
    this.lastChunk = c;
    this.lastChunkKey = k;
    return c;
  }

  getChunkFromBlockCoords(x: number, z: number): Chunk {
    return this.getChunkFromChunkCoords(x >> 4, z >> 4);
  }

  /** Adds a loaded chunk (from the generator or the in-memory store). */
  addChunk(chunk: Chunk): void {
    const k = World.chunkKey(chunk.xPosition, chunk.zPosition);
    this.chunks.set(k, chunk);
    this.lastChunk = null;
    this.lastChunkKey = Number.NaN;
    chunk.isChunkLoaded = true;
    for (const t of chunk.pendingTicks) this.scheduleBlockUpdate(t[0], t[1], t[2], t[3], t[4]);
    chunk.pendingTicks = [];
    for (const list of chunk.entityLists) for (const e of list) this.addLoadedEntity(e);
  }

  /** Removes a chunk; its entities and scheduled ticks are kept on the chunk. */
  removeChunk(cx: number, cz: number): Chunk | null {
    const k = World.chunkKey(cx, cz);
    const c = this.chunks.get(k);
    if (!c) return null;
    this.chunks.delete(k);
    this.lastChunk = null;
    this.lastChunkKey = Number.NaN;
    c.isChunkLoaded = false;
    for (const t of this.pendingTicks.removeInChunk(cx, cz)) {
      c.pendingTicks.push([t.xCoord, t.yCoord, t.zCoord, t.blockID, Math.max(0, t.scheduledTime - this.worldInfo.totalTime)]);
    }
    for (const list of c.entityLists) for (const e of list) if (!(e as unknown as EntityPlayer).isPlayerEntity) this.unloadedEntityList.push(e);
    return c;
  }

  getLoadedChunks(): IterableIterator<Chunk> {
    return this.chunks.values();
  }

  get loadedChunkCount(): number {
    return this.chunks.size;
  }

  // ------------------------------------------------------------------ block access

  getBlockId(x: number, y: number, z: number): number {
    if (x < -30000000 || z < -30000000 || x >= 30000000 || z >= 30000000 || y < 0 || y >= 256) return 0;
    const c = this.getChunkFromChunkCoords(x >> 4, z >> 4);
    const s = c.sections[y >> 4];
    return s ? s.blocks[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)] : 0;
  }

  getBlockMetadata(x: number, y: number, z: number): number {
    if (x < -30000000 || z < -30000000 || x >= 30000000 || z >= 30000000 || y < 0 || y >= 256) return 0;
    const c = this.getChunkFromChunkCoords(x >> 4, z >> 4);
    const s = c.sections[y >> 4];
    return s ? s.meta[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)] : 0;
  }

  blockGetRenderType(x: number, y: number, z: number): number {
    const b = Block.blocksList[this.getBlockId(x, y, z)];
    return b ? b.getRenderType() : -1;
  }

  isAirBlock(x: number, y: number, z: number): boolean {
    return this.getBlockId(x, y, z) === 0;
  }

  getBlockMaterial(x: number, y: number, z: number): Material {
    const id = this.getBlockId(x, y, z);
    return id === 0 ? Material.air : Block.blocksList[id]!.blockMaterial;
  }

  blockExists(x: number, y: number, z: number): boolean {
    return y >= 0 && y < 256 ? this.chunkExists(x >> 4, z >> 4) : false;
  }

  doChunksNearChunkExist(x: number, y: number, z: number, r: number): boolean {
    return this.checkChunksExist(x - r, y - r, z - r, x + r, y + r, z + r);
  }

  checkChunksExist(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
    if (y1 < 0 || y0 >= 256) return false;
    x0 >>= 4;
    z0 >>= 4;
    x1 >>= 4;
    z1 >>= 4;
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) if (!this.chunkExists(cx, cz)) return false;
    return true;
  }

  /** setBlock with flags: 1 = notify neighbours, 2 = send to client (re-render), 4 = no re-render. */
  setBlock(x: number, y: number, z: number, id: number, meta = 0, flags = 3): boolean {
    if (x < -30000000 || z < -30000000 || x >= 30000000 || z >= 30000000 || y < 0 || y >= 256) return false;
    if (id !== 0 && !Block.blocksList[id]) return false;
    const c = this.getChunkFromChunkCoords(x >> 4, z >> 4);
    let oldId = 0;
    if ((flags & 1) !== 0) oldId = c.getBlockID(x & 15, y, z & 15);
    const changed = c.setBlockIDWithMetadata(x & 15, y, z & 15, id, meta);
    this.updateAllLightTypes(x, y, z);
    if (changed) {
      if ((flags & 2) !== 0 && (!this.isRemote || (flags & 4) === 0)) this.markBlockForUpdate(x, y, z);
      if (!this.isRemote && (flags & 1) !== 0) this.notifyBlockChange(x, y, z, oldId);
    }
    return changed;
  }

  setBlockMetadataWithNotify(x: number, y: number, z: number, meta: number, flags: number): boolean {
    if (x < -30000000 || z < -30000000 || x >= 30000000 || z >= 30000000 || y < 0 || y >= 256) return false;
    const c = this.getChunkFromChunkCoords(x >> 4, z >> 4);
    const changed = c.setBlockMetadata(x & 15, y, z & 15, meta);
    if (changed) {
      const id = c.getBlockID(x & 15, y, z & 15);
      if ((flags & 2) !== 0 && (!this.isRemote || (flags & 4) === 0)) this.markBlockForUpdate(x, y, z);
      if (!this.isRemote && (flags & 1) !== 0) this.notifyBlockChange(x, y, z, id);
    }
    return changed;
  }

  setBlockToAir(x: number, y: number, z: number): boolean {
    return this.setBlock(x, y, z, 0, 0, 3);
  }

  destroyBlock(x: number, y: number, z: number, drop: boolean): boolean {
    const id = this.getBlockId(x, y, z);
    if (id <= 0) return false;
    const meta = this.getBlockMetadata(x, y, z);
    this.playAuxSFX(2001, x, y, z, id + (meta << 12));
    if (drop) Block.blocksList[id]!.dropBlockAsItem(this, x, y, z, meta, 0);
    return this.setBlock(x, y, z, 0, 0, 3);
  }

  markBlockForUpdate(x: number, y: number, z: number): void {
    for (const a of this.worldAccesses) a.markBlockForUpdate(x, y, z);
  }

  notifyBlockChange(x: number, y: number, z: number, id: number): void {
    this.notifyBlocksOfNeighborChange(x, y, z, id);
  }

  markBlocksDirtyVertical(x: number, z: number, y0: number, y1: number): void {
    if (y0 > y1) [y0, y1] = [y1, y0];
    if (!this.provider.hasNoSky) for (let y = y0; y <= y1; y++) this.updateLightByType(EnumSkyBlock.Sky, x, y, z);
    this.markBlockRangeForRenderUpdate(x, y0, z, x, y1, z);
  }

  markBlockRangeForRenderUpdate(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    for (const a of this.worldAccesses) a.markBlockRangeForRenderUpdate(x0, y0, z0, x1, y1, z1);
  }

  markBlockForRenderUpdate(x: number, y: number, z: number): void {
    for (const a of this.worldAccesses) a.markBlockForRenderUpdate(x, y, z);
  }

  notifyBlocksOfNeighborChange(x: number, y: number, z: number, id: number, exceptSide = -1): void {
    if (exceptSide !== 4) this.notifyBlockOfNeighborChange(x - 1, y, z, id);
    if (exceptSide !== 5) this.notifyBlockOfNeighborChange(x + 1, y, z, id);
    if (exceptSide !== 0) this.notifyBlockOfNeighborChange(x, y - 1, z, id);
    if (exceptSide !== 1) this.notifyBlockOfNeighborChange(x, y + 1, z, id);
    if (exceptSide !== 2) this.notifyBlockOfNeighborChange(x, y, z - 1, id);
    if (exceptSide !== 3) this.notifyBlockOfNeighborChange(x, y, z + 1, id);
  }

  notifyBlockOfNeighborChange(x: number, y: number, z: number, id: number): void {
    if (this.isRemote) return;
    const b = Block.blocksList[this.getBlockId(x, y, z)];
    b?.onNeighborBlockChange(this, x, y, z, id);
  }

  isBlockOpaqueCube(x: number, y: number, z: number): boolean {
    const b = Block.blocksList[this.getBlockId(x, y, z)];
    return b ? b.isOpaqueCube() : false;
  }

  isBlockNormalCube(x: number, y: number, z: number): boolean {
    return Block.isNormalCube(this.getBlockId(x, y, z));
  }

  /** func_85174_u: is the collision box a full cube. */
  isBlockFullCube(x: number, y: number, z: number): boolean {
    const id = this.getBlockId(x, y, z);
    const b = Block.blocksList[id];
    if (id === 0 || !b) return false;
    const bb = b.getCollisionBoundingBoxFromPool(this, x, y, z);
    return bb !== null && bb.getAverageEdgeLength() >= 1;
  }

  doesBlockHaveSolidTopSurface(x: number, y: number, z: number): boolean {
    const b = Block.blocksList[this.getBlockId(x, y, z)];
    return b ? b.hasSolidTopSurface(this.getBlockMetadata(x, y, z)) : false;
  }

  isBlockNormalCubeDefault(x: number, y: number, z: number, def: boolean): boolean {
    if (x < -30000000 || z < -30000000 || x >= 30000000 || z >= 30000000) return def;
    const c = this.getChunkFromChunkCoords(x >> 4, z >> 4);
    if (c.isEmpty()) return def;
    const b = Block.blocksList[this.getBlockId(x, y, z)];
    return b ? b.blockMaterial.isOpaque() && b.renderAsNormalBlock() : false;
  }

  isBlockProvidingPowerTo(x: number, y: number, z: number, side: number): number {
    const id = this.getBlockId(x, y, z);
    return id === 0 ? 0 : Block.blocksList[id]!.isProvidingStrongPower(this, x, y, z, side);
  }

  getBiomeGenForCoords(x: number, z: number): BiomeGenBase {
    const c = this.getChunkFromChunkCoords(x >> 4, z >> 4);
    return getBiome(c.biomes[((z & 15) << 4) | (x & 15)]);
  }

  getHeight(): number {
    return 256;
  }

  extendedLevelsInChunkCache(): boolean {
    return false;
  }

  canBlockSeeTheSky(x: number, y: number, z: number): boolean {
    return this.getChunkFromChunkCoords(x >> 4, z >> 4).canBlockSeeTheSky(x & 15, y, z & 15);
  }

  getHeightValue(x: number, z: number): number {
    if (x < -30000000 || z < -30000000 || x >= 30000000 || z >= 30000000) return 0;
    if (!this.chunkExists(x >> 4, z >> 4)) return 0;
    return this.getChunkFromChunkCoords(x >> 4, z >> 4).getHeightValue(x & 15, z & 15);
  }

  getChunkHeightMapMinimum(x: number, z: number): number {
    if (x < -30000000 || z < -30000000 || x >= 30000000 || z >= 30000000) return 0;
    if (!this.chunkExists(x >> 4, z >> 4)) return 0;
    return this.getChunkFromChunkCoords(x >> 4, z >> 4).heightMapMinimum;
  }

  getPrecipitationHeight(x: number, z: number): number {
    return this.getChunkFromBlockCoords(x, z).getPrecipitationHeight(x & 15, z & 15);
  }

  getTopSolidOrLiquidBlock(x: number, z: number): number {
    const c = this.getChunkFromBlockCoords(x, z);
    let y = c.getTopFilledSegment() + 15;
    x &= 15;
    z &= 15;
    for (; y > 0; y--) {
      const id = c.getBlockID(x, y, z);
      if (id !== 0 && Block.blocksList[id]!.blockMaterial.blocksMovement() && Block.blocksList[id]!.blockMaterial !== Material.leaves) return y + 1;
    }
    return -1;
  }

  getFirstUncoveredBlock(x: number, z: number): number {
    let y = 63;
    while (!this.isAirBlock(x, y + 1, z)) y++;
    return this.getBlockId(x, y, z);
  }

  // ------------------------------------------------------------------ light

  getFullBlockLightValue(x: number, y: number, z: number): number {
    if (y < 0) return 0;
    if (y >= 256) y = 255;
    return this.getChunkFromChunkCoords(x >> 4, z >> 4).getBlockLightValue(x & 15, y, z & 15, 0);
  }

  getBlockLightValue(x: number, y: number, z: number): number {
    return this.getBlockLightValue_do(x, y, z, true);
  }

  getBlockLightValue_do(x: number, y: number, z: number, useNeighbors: boolean): number {
    if (x < -30000000 || z < -30000000 || x >= 30000000 || z >= 30000000) return 15;
    if (useNeighbors && Block.useNeighborBrightness[this.getBlockId(x, y, z)]) {
      let v = this.getBlockLightValue_do(x, y + 1, z, false);
      const a = this.getBlockLightValue_do(x + 1, y, z, false);
      const b = this.getBlockLightValue_do(x - 1, y, z, false);
      const c = this.getBlockLightValue_do(x, y, z + 1, false);
      const d = this.getBlockLightValue_do(x, y, z - 1, false);
      if (a > v) v = a;
      if (b > v) v = b;
      if (c > v) v = c;
      if (d > v) v = d;
      return v;
    }
    if (y < 0) return 0;
    if (y >= 256) y = 255;
    return this.getChunkFromChunkCoords(x >> 4, z >> 4).getBlockLightValue(x & 15, y, z & 15, this.skylightSubtracted);
  }

  getSkyBlockTypeBrightness(type: EnumSkyBlock, x: number, y: number, z: number): number {
    if (this.provider.hasNoSky && type === EnumSkyBlock.Sky) return 0;
    if (y < 0) y = 0;
    if (y >= 256) return SKY_BLOCK_DEFAULT[type];
    if (x < -30000000 || z < -30000000 || x >= 30000000 || z >= 30000000) return SKY_BLOCK_DEFAULT[type];
    if (!this.chunkExists(x >> 4, z >> 4)) return SKY_BLOCK_DEFAULT[type];
    if (Block.useNeighborBrightness[this.getBlockId(x, y, z)]) {
      let v = this.getSavedLightValue(type, x, y + 1, z);
      const a = this.getSavedLightValue(type, x + 1, y, z);
      const b = this.getSavedLightValue(type, x - 1, y, z);
      const c = this.getSavedLightValue(type, x, y, z + 1);
      const d = this.getSavedLightValue(type, x, y, z - 1);
      if (a > v) v = a;
      if (b > v) v = b;
      if (c > v) v = c;
      if (d > v) v = d;
      return v;
    }
    return this.getChunkFromChunkCoords(x >> 4, z >> 4).getSavedLightValue(type, x & 15, y, z & 15);
  }

  getSavedLightValue(type: EnumSkyBlock, x: number, y: number, z: number): number {
    if (y < 0) y = 0;
    if (y >= 256) y = 255;
    if (x < -30000000 || z < -30000000 || x >= 30000000 || z >= 30000000) return SKY_BLOCK_DEFAULT[type];
    if (!this.chunkExists(x >> 4, z >> 4)) return SKY_BLOCK_DEFAULT[type];
    return this.getChunkFromChunkCoords(x >> 4, z >> 4).getSavedLightValue(type, x & 15, y, z & 15);
  }

  setLightValue(type: EnumSkyBlock, x: number, y: number, z: number, v: number): void {
    if (x < -30000000 || z < -30000000 || x >= 30000000 || z >= 30000000 || y < 0 || y >= 256) return;
    if (!this.chunkExists(x >> 4, z >> 4)) return;
    this.getChunkFromChunkCoords(x >> 4, z >> 4).setLightValue(type, x & 15, y, z & 15, v);
    for (const a of this.worldAccesses) a.markBlockForRenderUpdate(x, y, z);
  }

  getLightBrightnessForSkyBlocks(x: number, y: number, z: number, minBlock: number): number {
    const sky = this.getSkyBlockTypeBrightness(EnumSkyBlock.Sky, x, y, z);
    let block = this.getSkyBlockTypeBrightness(EnumSkyBlock.Block, x, y, z);
    if (block < minBlock) block = minBlock;
    return (sky << 20) | (block << 4);
  }

  getBrightness(x: number, y: number, z: number, min: number): number {
    let v = this.getBlockLightValue(x, y, z);
    if (v < min) v = min;
    return this.provider.lightBrightnessTable[v];
  }

  getLightBrightness(x: number, y: number, z: number): number {
    return this.provider.lightBrightnessTable[this.getBlockLightValue(x, y, z)];
  }

  isDaytime(): boolean {
    return this.skylightSubtracted < 4;
  }

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
      const v = this.getSavedLightValue(type, x + Facing.offsetsXForSide[s], y + Facing.offsetsYForSide[s], z + Facing.offsetsZForSide[s]) - op;
      if (v > light) light = v;
      if (light >= 14) return light;
    }
    return light;
  }

  /** Incremental light update around (x, y, z) (World.updateLightByType). */
  updateLightByType(type: EnumSkyBlock, x: number, y: number, z: number): void {
    if (!this.doChunksNearChunkExist(x, y, z, 17)) return;
    const list = this.lightUpdateBlockList;
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
        if (this.getSavedLightValue(type, ex, ey, ez) === level) {
          this.setLightValue(type, ex, ey, ez, 0);
          if (level > 0 && Math.abs(ex - x) + Math.abs(ey - y) + Math.abs(ez - z) < 17) {
            for (let s = 0; s < 6; s++) {
              const nx = ex + Facing.offsetsXForSide[s];
              const ny = ey + Facing.offsetsYForSide[s];
              const nz = ez + Facing.offsetsZForSide[s];
              const op = Math.max(1, Block.lightOpacity[this.getBlockId(nx, ny, nz)]);
              if (this.getSavedLightValue(type, nx, ny, nz) === level - op && write < list.length) {
                list[write++] = (nx - x + 32) | ((ny - y + 32) << 6) | ((nz - z + 32) << 12) | ((level - op) << 18);
              }
            }
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
      if (val > cur) {
        const room = write < list.length - 6;
        if (Math.abs(ex - x) + Math.abs(ey - y) + Math.abs(ez - z) < 17 && room) {
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
    }
  }

  // ------------------------------------------------------------------ ray tracing

  rayTraceBlocks(start: Vec3, end: Vec3): MovingObjectPosition | null {
    return this.rayTraceBlocks_do_do(start, end, false, false);
  }

  rayTraceBlocks_do(start: Vec3, end: Vec3, liquids: boolean): MovingObjectPosition | null {
    return this.rayTraceBlocks_do_do(start, end, liquids, false);
  }

  /** Voxel walk of the original (note: like Java, `start` is moved along the ray). */
  rayTraceBlocks_do_do(start: Vec3, end: Vec3, liquids: boolean, onlyCollidable: boolean): MovingObjectPosition | null {
    if (Number.isNaN(start.xCoord) || Number.isNaN(start.yCoord) || Number.isNaN(start.zCoord)) return null;
    if (Number.isNaN(end.xCoord) || Number.isNaN(end.yCoord) || Number.isNaN(end.zCoord)) return null;
    const ex = MathHelper.floor_double(end.xCoord);
    const ey = MathHelper.floor_double(end.yCoord);
    const ez = MathHelper.floor_double(end.zCoord);
    let bx = MathHelper.floor_double(start.xCoord);
    let by = MathHelper.floor_double(start.yCoord);
    let bz = MathHelper.floor_double(start.zCoord);
    const hit = (x: number, y: number, z: number): MovingObjectPosition | null => {
      const id = this.getBlockId(x, y, z);
      const meta = this.getBlockMetadata(x, y, z);
      const b = Block.blocksList[id];
      if ((!onlyCollidable || !b || b.getCollisionBoundingBoxFromPool(this, x, y, z) !== null) && id > 0 && b!.canCollideCheck(meta, liquids)) {
        return b!.collisionRayTrace(this, x, y, z, start, end);
      }
      return null;
    };
    const first = hit(bx, by, bz);
    if (first) return first;
    let steps = 200;
    while (steps-- >= 0) {
      if (Number.isNaN(start.xCoord) || Number.isNaN(start.yCoord) || Number.isNaN(start.zCoord)) return null;
      if (bx === ex && by === ey && bz === ez) return null;
      let stepX = true;
      let stepY = true;
      let stepZ = true;
      let nx = 999;
      let ny = 999;
      let nz = 999;
      if (ex > bx) nx = bx + 1;
      else if (ex < bx) nx = bx;
      else stepX = false;
      if (ey > by) ny = by + 1;
      else if (ey < by) ny = by;
      else stepY = false;
      if (ez > bz) nz = bz + 1;
      else if (ez < bz) nz = bz;
      else stepZ = false;
      let tx = 999;
      let ty = 999;
      let tz = 999;
      const dx = end.xCoord - start.xCoord;
      const dy = end.yCoord - start.yCoord;
      const dz = end.zCoord - start.zCoord;
      if (stepX) tx = (nx - start.xCoord) / dx;
      if (stepY) ty = (ny - start.yCoord) / dy;
      if (stepZ) tz = (nz - start.zCoord) / dz;
      let side: number;
      if (tx < ty && tx < tz) {
        side = ex > bx ? 4 : 5;
        start.xCoord = nx;
        start.yCoord += dy * tx;
        start.zCoord += dz * tx;
      } else if (ty < tz) {
        side = ey > by ? 0 : 1;
        start.xCoord += dx * ty;
        start.yCoord = ny;
        start.zCoord += dz * ty;
      } else {
        side = ez > bz ? 2 : 3;
        start.xCoord += dx * tz;
        start.yCoord += dy * tz;
        start.zCoord = nz;
      }
      bx = MathHelper.floor_double(start.xCoord);
      if (side === 5) bx--;
      by = MathHelper.floor_double(start.yCoord);
      if (side === 1) by--;
      bz = MathHelper.floor_double(start.zCoord);
      if (side === 3) bz--;
      const r = hit(bx, by, bz);
      if (r) return r;
    }
    return null;
  }

  // ------------------------------------------------------------------ sounds / particles

  playSoundAtEntity(e: Entity, name: string, volume: number, pitch: number): void {
    for (const a of this.worldAccesses) a.playSound(name, e.posX, e.posY - e.yOffset, e.posZ, volume, pitch);
  }

  playSoundEffect(x: number, y: number, z: number, name: string, volume: number, pitch: number): void {
    for (const a of this.worldAccesses) a.playSound(name, x, y, z, volume, pitch);
  }

  /** Client-only sound with optional distance delay (WorldClient.playSound). */
  playSound(x: number, y: number, z: number, name: string, volume: number, pitch: number, _distanceDelay: boolean): void {
    this.playSoundEffect(x, y, z, name, volume, pitch);
  }

  spawnParticle(name: string, x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    for (const a of this.worldAccesses) a.spawnParticle(name, x, y, z, vx, vy, vz);
  }

  /** Level events (2001 = block break effect with id + meta << 12, ...). */
  playAuxSFX(type: number, x: number, y: number, z: number, data: number): void {
    this.playAuxSFXAtEntity(null, type, x, y, z, data);
  }

  playAuxSFXAtEntity(player: EntityPlayer | null, type: number, x: number, y: number, z: number, data: number): void {
    for (const a of this.worldAccesses) a.playAuxSFX(player, type, x, y, z, data);
  }

  destroyBlockInWorldPartially(entityId: number, x: number, y: number, z: number, progress: number): void {
    for (const a of this.worldAccesses) a.destroyBlockPartially(entityId, x, y, z, progress);
  }

  addWorldAccess(a: IWorldAccess): void {
    this.worldAccesses.push(a);
  }

  removeWorldAccess(a: IWorldAccess): void {
    const i = this.worldAccesses.indexOf(a);
    if (i >= 0) this.worldAccesses.splice(i, 1);
  }

  // ------------------------------------------------------------------ entities

  spawnEntityInWorld(e: Entity): boolean {
    const cx = MathHelper.floor_double(e.posX / 16);
    const cz = MathHelper.floor_double(e.posZ / 16);
    const isPlayer = (e as unknown as EntityPlayer).isPlayerEntity === true;
    if (!isPlayer && !e.forceSpawn && !this.chunkExists(cx, cz)) return false;
    if (isPlayer) this.playerEntities.push(e as unknown as EntityPlayer);
    this.getChunkFromChunkCoords(cx, cz).addEntity(e);
    this.loadedEntityList.push(e);
    this.obtainEntitySkin(e);
    return true;
  }

  private addLoadedEntity(e: Entity): void {
    if (!this.loadedEntityList.includes(e)) {
      this.loadedEntityList.push(e);
      this.obtainEntitySkin(e);
    }
  }

  protected obtainEntitySkin(e: Entity): void {
    for (const a of this.worldAccesses) a.onEntityCreate(e);
  }

  protected releaseEntitySkin(e: Entity): void {
    for (const a of this.worldAccesses) a.onEntityDestroy(e);
  }

  removeEntity(e: Entity): void {
    if (e.riddenByEntity) e.riddenByEntity.mountEntity(null);
    if (e.ridingEntity) e.mountEntity(null);
    e.setDead();
    const i = this.playerEntities.indexOf(e as unknown as EntityPlayer);
    if (i >= 0) this.playerEntities.splice(i, 1);
  }

  dropItemStack(x: number, y: number, z: number, stack: ItemStack): void {
    if (!this.worldInfo.gameRules.doTileDrops) return;
    const e = World.itemDropFactory?.(this, x, y, z, stack);
    if (e) this.spawnEntityInWorld(e);
  }

  getCollidingBoundingBoxes(e: Entity | null, box: AxisAlignedBB): AxisAlignedBB[] {
    const list = this.collidingBoundingBoxes;
    list.length = 0;
    const x0 = MathHelper.floor_double(box.minX);
    const x1 = MathHelper.floor_double(box.maxX + 1);
    const y0 = MathHelper.floor_double(box.minY);
    const y1 = MathHelper.floor_double(box.maxY + 1);
    const z0 = MathHelper.floor_double(box.minZ);
    const z1 = MathHelper.floor_double(box.maxZ + 1);
    for (let x = x0; x < x1; x++) {
      for (let z = z0; z < z1; z++) {
        if (!this.blockExists(x, 64, z)) continue;
        for (let y = y0 - 1; y < y1; y++) {
          const b = Block.blocksList[this.getBlockId(x, y, z)];
          b?.addCollisionBoxesToList(this, x, y, z, box, list, e);
        }
      }
    }
    if (e) {
      const d = 0.25;
      for (const other of this.getEntitiesWithinAABBExcludingEntity(e, box.expand(d, d, d))) {
        let bb = other.getBoundingBox();
        if (bb && bb.intersectsWith(box)) list.push(bb);
        bb = e.getCollisionBox(other);
        if (bb && bb.intersectsWith(box)) list.push(bb);
      }
    }
    return list.slice();
  }

  getCollidingBlockBounds(box: AxisAlignedBB): AxisAlignedBB[] {
    const out: AxisAlignedBB[] = [];
    const x0 = MathHelper.floor_double(box.minX);
    const x1 = MathHelper.floor_double(box.maxX + 1);
    const y0 = MathHelper.floor_double(box.minY);
    const y1 = MathHelper.floor_double(box.maxY + 1);
    const z0 = MathHelper.floor_double(box.minZ);
    const z1 = MathHelper.floor_double(box.maxZ + 1);
    for (let x = x0; x < x1; x++) {
      for (let z = z0; z < z1; z++) {
        if (!this.blockExists(x, 64, z)) continue;
        for (let y = y0 - 1; y < y1; y++) Block.blocksList[this.getBlockId(x, y, z)]?.addCollisionBoxesToList(this, x, y, z, box, out, null);
      }
    }
    return out;
  }

  getEntitiesWithinAABBExcludingEntity(exclude: Entity | null, box: AxisAlignedBB, filter?: (e: Entity) => boolean): Entity[] {
    const out: Entity[] = [];
    const cx0 = MathHelper.floor_double((box.minX - 2) / 16);
    const cx1 = MathHelper.floor_double((box.maxX + 2) / 16);
    const cz0 = MathHelper.floor_double((box.minZ - 2) / 16);
    const cz1 = MathHelper.floor_double((box.maxZ + 2) / 16);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        if (this.chunkExists(cx, cz)) this.getChunkFromChunkCoords(cx, cz).getEntitiesWithinAABBForEntity(exclude, box, out, filter);
      }
    }
    return out;
  }

  /** getEntitiesWithinAABB(Class, box) with a type guard instead of a Class. */
  getEntitiesWithinAABB<T extends Entity>(guard: (e: Entity) => e is T, box: AxisAlignedBB): T[] {
    return this.getEntitiesWithinAABBExcludingEntity(null, box, guard) as T[];
  }

  checkNoEntityCollision(box: AxisAlignedBB, except: Entity | null = null): boolean {
    for (const e of this.getEntitiesWithinAABBExcludingEntity(null, box)) {
      if (!e.isDead && e.preventEntitySpawning && e !== except) return false;
    }
    return true;
  }

  canPlaceEntityOnSide(blockId: number, x: number, y: number, z: number, ignoreEntities: boolean, side: number, e: Entity | null, stack: ItemStack | null): boolean {
    const existingId = this.getBlockId(x, y, z);
    let existing = Block.blocksList[existingId];
    const block = Block.blocksList[blockId];
    if (!block) return false;
    let box = block.getCollisionBoundingBoxFromPool(this, x, y, z);
    if (ignoreEntities) box = null;
    if (box && !this.checkNoEntityCollision(box, e)) return false;
    if (
      existing &&
      (existingId === BlockIds.waterMoving ||
        existingId === BlockIds.waterStill ||
        existingId === BlockIds.lavaMoving ||
        existingId === BlockIds.lavaStill ||
        existingId === BlockIds.fire ||
        existing.blockMaterial.isReplaceable())
    ) {
      existing = null;
    }
    if (existing && existing.blockMaterial === Material.circuits && blockId === BlockIds.anvil) return true;
    return blockId > 0 && existing === null && block.canPlaceBlockOnSide(this, x, y, z, side, stack);
  }

  isAnyLiquid(box: AxisAlignedBB): boolean {
    let x0 = MathHelper.floor_double(box.minX);
    const x1 = MathHelper.floor_double(box.maxX + 1);
    let y0 = MathHelper.floor_double(box.minY);
    const y1 = MathHelper.floor_double(box.maxY + 1);
    let z0 = MathHelper.floor_double(box.minZ);
    const z1 = MathHelper.floor_double(box.maxZ + 1);
    if (box.minX < 0) x0--;
    if (box.minY < 0) y0--;
    if (box.minZ < 0) z0--;
    for (let x = x0; x < x1; x++)
      for (let y = y0; y < y1; y++)
        for (let z = z0; z < z1; z++) {
          const b = Block.blocksList[this.getBlockId(x, y, z)];
          if (b && b.blockMaterial.isLiquid()) return true;
        }
    return false;
  }

  isBoundingBoxBurning(box: AxisAlignedBB): boolean {
    const x0 = MathHelper.floor_double(box.minX);
    const x1 = MathHelper.floor_double(box.maxX + 1);
    const y0 = MathHelper.floor_double(box.minY);
    const y1 = MathHelper.floor_double(box.maxY + 1);
    const z0 = MathHelper.floor_double(box.minZ);
    const z1 = MathHelper.floor_double(box.maxZ + 1);
    if (!this.checkChunksExist(x0, y0, z0, x1, y1, z1)) return false;
    for (let x = x0; x < x1; x++)
      for (let y = y0; y < y1; y++)
        for (let z = z0; z < z1; z++) {
          const id = this.getBlockId(x, y, z);
          if (id === BlockIds.fire || id === BlockIds.lavaMoving || id === BlockIds.lavaStill) return true;
        }
    return false;
  }

  /** Applies liquid flow to an entity; returns whether it is in the material. */
  handleMaterialAcceleration(box: AxisAlignedBB, material: Material, e: Entity): boolean {
    const x0 = MathHelper.floor_double(box.minX);
    const x1 = MathHelper.floor_double(box.maxX + 1);
    const y0 = MathHelper.floor_double(box.minY);
    const y1 = MathHelper.floor_double(box.maxY + 1);
    const z0 = MathHelper.floor_double(box.minZ);
    const z1 = MathHelper.floor_double(box.maxZ + 1);
    if (!this.checkChunksExist(x0, y0, z0, x1, y1, z1)) return false;
    let inside = false;
    let flow = new Vec3(0, 0, 0);
    for (let x = x0; x < x1; x++)
      for (let y = y0; y < y1; y++)
        for (let z = z0; z < z1; z++) {
          const b = Block.blocksList[this.getBlockId(x, y, z)];
          if (b && b.blockMaterial === material) {
            const surface = f(y + 1 - BlockFluid.getFluidHeightPercent(this.getBlockMetadata(x, y, z)));
            if (y1 >= surface) {
              inside = true;
              b.velocityToAddToEntity(this, x, y, z, e, flow);
            }
          }
        }
    if (flow.lengthVector() > 0 && e.isPushedByWater()) {
      flow = flow.normalize();
      const s = 0.014;
      e.motionX += flow.xCoord * s;
      e.motionY += flow.yCoord * s;
      e.motionZ += flow.zCoord * s;
    }
    return inside;
  }

  isMaterialInBB(box: AxisAlignedBB, material: Material): boolean {
    const x0 = MathHelper.floor_double(box.minX);
    const x1 = MathHelper.floor_double(box.maxX + 1);
    const y0 = MathHelper.floor_double(box.minY);
    const y1 = MathHelper.floor_double(box.maxY + 1);
    const z0 = MathHelper.floor_double(box.minZ);
    const z1 = MathHelper.floor_double(box.maxZ + 1);
    for (let x = x0; x < x1; x++)
      for (let y = y0; y < y1; y++)
        for (let z = z0; z < z1; z++) {
          const b = Block.blocksList[this.getBlockId(x, y, z)];
          if (b && b.blockMaterial === material) return true;
        }
    return false;
  }

  isAABBInMaterial(box: AxisAlignedBB, material: Material): boolean {
    const x0 = MathHelper.floor_double(box.minX);
    const x1 = MathHelper.floor_double(box.maxX + 1);
    const y0 = MathHelper.floor_double(box.minY);
    const y1 = MathHelper.floor_double(box.maxY + 1);
    const z0 = MathHelper.floor_double(box.minZ);
    const z1 = MathHelper.floor_double(box.maxZ + 1);
    for (let x = x0; x < x1; x++)
      for (let y = y0; y < y1; y++)
        for (let z = z0; z < z1; z++) {
          const b = Block.blocksList[this.getBlockId(x, y, z)];
          if (b && b.blockMaterial === material) {
            const m = this.getBlockMetadata(x, y, z);
            let top = y + 1;
            if (m < 8) top = y + 1 - m / 8;
            if (top >= box.minY) return true;
          }
        }
    return false;
  }

  getClosestPlayer(x: number, y: number, z: number, maxDist: number): EntityPlayer | null {
    let best = -1;
    let found: EntityPlayer | null = null;
    for (const p of this.playerEntities) {
      const d = p.getDistanceSq(x, y, z);
      if ((maxDist < 0 || d < maxDist * maxDist) && (best === -1 || d < best)) {
        best = d;
        found = p;
      }
    }
    return found;
  }

  getClosestPlayerToEntity(e: Entity, maxDist: number): EntityPlayer | null {
    return this.getClosestPlayer(e.posX, e.posY, e.posZ, maxDist);
  }

  /** World.updateEntities: ticks weather effects and entities, removes dead ones. */
  updateEntities(): void {
    for (let i = 0; i < this.weatherEffects.length; i++) {
      const e = this.weatherEffects[i];
      e.ticksExisted++;
      e.onUpdate();
      if (e.isDead) this.weatherEffects.splice(i--, 1);
    }
    if (this.unloadedEntityList.length > 0) {
      const unload = new Set(this.unloadedEntityList);
      for (let i = this.loadedEntityList.length - 1; i >= 0; i--) if (unload.has(this.loadedEntityList[i])) this.loadedEntityList.splice(i, 1);
      for (const e of this.unloadedEntityList) this.releaseEntitySkin(e);
      this.unloadedEntityList = [];
    }
    for (let i = 0; i < this.loadedEntityList.length; i++) {
      const e = this.loadedEntityList[i];
      if (e.ridingEntity) {
        if (!e.ridingEntity.isDead && e.ridingEntity.riddenByEntity === e) continue;
        e.ridingEntity.riddenByEntity = null;
        e.ridingEntity = null;
      }
      if (!e.isDead) this.updateEntity(e);
      if (e.isDead) {
        if (e.addedToChunk && this.chunkExists(e.chunkCoordX, e.chunkCoordZ)) this.getChunkFromChunkCoords(e.chunkCoordX, e.chunkCoordZ).removeEntity(e);
        this.loadedEntityList.splice(i--, 1);
        this.releaseEntitySkin(e);
      }
    }
    for (let i = 0; i < this.loadedTileEntityList.length; i++) {
      const te = this.loadedTileEntityList[i];
      if (te.isInvalid?.()) this.loadedTileEntityList.splice(i--, 1);
      else te.updateEntity?.();
    }
  }

  updateEntity(e: Entity): void {
    this.updateEntityWithOptionalForce(e, true);
  }

  updateEntityWithOptionalForce(e: Entity, force: boolean): void {
    const x = MathHelper.floor_double(e.posX);
    const z = MathHelper.floor_double(e.posZ);
    const r = 32;
    if (force && !this.checkChunksExist(x - r, 0, z - r, x + r, 0, z + r) && !(e as unknown as EntityPlayer).isPlayerEntity) return;
    e.lastTickPosX = e.posX;
    e.lastTickPosY = e.posY;
    e.lastTickPosZ = e.posZ;
    e.prevRotationYaw = e.rotationYaw;
    e.prevRotationPitch = e.rotationPitch;
    if (force && (e.addedToChunk || (e as unknown as EntityPlayer).isPlayerEntity)) {
      if (e.ridingEntity) e.updateRidden();
      else {
        e.ticksExisted++;
        e.onUpdate();
      }
    }
    if (!Number.isFinite(e.posX)) e.posX = e.lastTickPosX;
    if (!Number.isFinite(e.posY)) e.posY = e.lastTickPosY;
    if (!Number.isFinite(e.posZ)) e.posZ = e.lastTickPosZ;
    if (!Number.isFinite(e.rotationPitch)) e.rotationPitch = e.prevRotationPitch;
    if (!Number.isFinite(e.rotationYaw)) e.rotationYaw = e.prevRotationYaw;
    const cx = MathHelper.floor_double(e.posX / 16);
    const cy = MathHelper.floor_double(e.posY / 16);
    const cz = MathHelper.floor_double(e.posZ / 16);
    if (!e.addedToChunk || e.chunkCoordX !== cx || e.chunkCoordY !== cy || e.chunkCoordZ !== cz) {
      if (e.addedToChunk && this.chunkExists(e.chunkCoordX, e.chunkCoordZ)) {
        this.getChunkFromChunkCoords(e.chunkCoordX, e.chunkCoordZ).removeEntityAtIndex(e, e.chunkCoordY);
      }
      if (this.chunkExists(cx, cz)) {
        e.addedToChunk = true;
        this.getChunkFromChunkCoords(cx, cz).addEntity(e);
      } else {
        e.addedToChunk = false;
      }
    }
    if (force && e.addedToChunk && e.riddenByEntity) {
      if (!e.riddenByEntity.isDead && e.riddenByEntity.ridingEntity === e) this.updateEntity(e.riddenByEntity);
      else {
        e.riddenByEntity.ridingEntity = null;
        e.riddenByEntity = null;
      }
    }
  }

  // ------------------------------------------------------------------ time, sky, weather

  getWorldTime(): number {
    return this.worldInfo.worldTime;
  }

  setWorldTime(t: number): void {
    this.worldInfo.worldTime = t;
  }

  getTotalWorldTime(): number {
    return this.worldInfo.totalTime;
  }

  getSeed(): bigint {
    return this.worldInfo.seed;
  }

  getCelestialAngle(pt: number): number {
    return this.provider.calculateCelestialAngle(this.worldInfo.worldTime, pt);
  }

  getCelestialAngleRadians(pt: number): number {
    return f(this.getCelestialAngle(pt) * f(Math.PI) * 2);
  }

  getMoonPhase(): number {
    return this.provider.getMoonPhase(this.worldInfo.worldTime);
  }

  calculateSkylightSubtracted(pt: number): number {
    const a = this.getCelestialAngle(pt);
    let v = f(1 - f(MathHelper.cos(f(a * f(Math.PI) * 2)) * 2 + 0.5));
    if (v < 0) v = 0;
    if (v > 1) v = 1;
    v = 1 - v;
    v = f(v * (1 - (this.getRainStrength(pt) * 5) / 16));
    v = f(v * (1 - (this.getWeightedThunderStrength(pt) * 5) / 16));
    v = 1 - v;
    return (v * 11) | 0;
  }

  getSunBrightness(pt: number): number {
    const a = this.getCelestialAngle(pt);
    let v = f(1 - f(MathHelper.cos(f(a * f(Math.PI) * 2)) * 2 + 0.2));
    if (v < 0) v = 0;
    if (v > 1) v = 1;
    v = 1 - v;
    v = f(v * (1 - (this.getRainStrength(pt) * 5) / 16));
    v = f(v * (1 - (this.getWeightedThunderStrength(pt) * 5) / 16));
    return f(v * 0.8 + 0.2);
  }

  getSkyColor(e: Entity, pt: number): Vec3 {
    const a = this.getCelestialAngle(pt);
    let b = f(MathHelper.cos(f(a * f(Math.PI) * 2)) * 2 + 0.5);
    if (b < 0) b = 0;
    if (b > 1) b = 1;
    const biome = this.getBiomeGenForCoords(MathHelper.floor_double(e.posX), MathHelper.floor_double(e.posZ));
    const c = biome.getSkyColorByTemp(biome.getFloatTemperature());
    let r = f(((c >> 16) & 255) / 255) * b;
    let g = f(((c >> 8) & 255) / 255) * b;
    let bl = f((c & 255) / 255) * b;
    const rain = this.getRainStrength(pt);
    if (rain > 0) {
      const grey = (r * 0.3 + g * 0.59 + bl * 0.11) * 0.6;
      const k = 1 - rain * 0.75;
      r = r * k + grey * (1 - k);
      g = g * k + grey * (1 - k);
      bl = bl * k + grey * (1 - k);
    }
    const thunder = this.getWeightedThunderStrength(pt);
    if (thunder > 0) {
      const grey = (r * 0.3 + g * 0.59 + bl * 0.11) * 0.2;
      const k = 1 - thunder * 0.75;
      r = r * k + grey * (1 - k);
      g = g * k + grey * (1 - k);
      bl = bl * k + grey * (1 - k);
    }
    if (this.lastLightningBolt > 0) {
      let l = this.lastLightningBolt - pt;
      if (l > 1) l = 1;
      l *= 0.45;
      r = r * (1 - l) + 0.8 * l;
      g = g * (1 - l) + 0.8 * l;
      bl = bl * (1 - l) + 1 * l;
    }
    return new Vec3(f(r), f(g), f(bl));
  }

  getCloudColour(pt: number): Vec3 {
    const a = this.getCelestialAngle(pt);
    let b = f(MathHelper.cos(f(a * f(Math.PI) * 2)) * 2 + 0.5);
    if (b < 0) b = 0;
    if (b > 1) b = 1;
    let r = 1;
    let g = 1;
    let bl = 1;
    const rain = this.getRainStrength(pt);
    if (rain > 0) {
      const grey = (r * 0.3 + g * 0.59 + bl * 0.11) * 0.6;
      const k = 1 - rain * 0.95;
      r = r * k + grey * (1 - k);
      g = g * k + grey * (1 - k);
      bl = bl * k + grey * (1 - k);
    }
    r *= b * 0.9 + 0.1;
    g *= b * 0.9 + 0.1;
    bl *= b * 0.85 + 0.15;
    const thunder = this.getWeightedThunderStrength(pt);
    if (thunder > 0) {
      const grey = (r * 0.3 + g * 0.59 + bl * 0.11) * 0.2;
      const k = 1 - thunder * 0.95;
      r = r * k + grey * (1 - k);
      g = g * k + grey * (1 - k);
      bl = bl * k + grey * (1 - k);
    }
    return new Vec3(f(r), f(g), f(bl));
  }

  getFogColor(pt: number): Vec3 {
    return this.provider.getFogColor(this.getCelestialAngle(pt), pt);
  }

  getStarBrightness(pt: number): number {
    const a = this.getCelestialAngle(pt);
    let v = f(1 - f(MathHelper.cos(f(a * f(Math.PI) * 2)) * 2 + 0.25));
    if (v < 0) v = 0;
    if (v > 1) v = 1;
    return f(v * v * 0.5);
  }

  getRainStrength(pt: number): number {
    return this.prevRainingStrength + (this.rainingStrength - this.prevRainingStrength) * pt;
  }

  setRainStrength(v: number): void {
    this.prevRainingStrength = v;
    this.rainingStrength = v;
  }

  getWeightedThunderStrength(pt: number): number {
    return (this.prevThunderingStrength + (this.thunderingStrength - this.prevThunderingStrength) * pt) * this.getRainStrength(pt);
  }

  isThundering(): boolean {
    return this.getWeightedThunderStrength(1) > 0.9;
  }

  isRaining(): boolean {
    return this.getRainStrength(1) > 0.2;
  }

  canLightningStrikeAt(x: number, y: number, z: number): boolean {
    if (!this.isRaining()) return false;
    if (!this.canBlockSeeTheSky(x, y, z)) return false;
    if (this.getPrecipitationHeight(x, z) > y) return false;
    const b = this.getBiomeGenForCoords(x, z);
    return b.getEnableSnow() ? false : b.canSpawnLightningBolt();
  }

  private calculateInitialWeather(): void {
    if (this.worldInfo.raining) {
      this.rainingStrength = 1;
      if (this.worldInfo.thundering) this.thunderingStrength = 1;
    }
  }

  protected updateWeather(): void {
    if (this.provider.hasNoSky) return;
    const info = this.worldInfo;
    let thunder = info.thunderTime;
    if (thunder <= 0) {
      info.thunderTime = info.thundering ? this.rand.nextInt(12000) + 3600 : this.rand.nextInt(168000) + 12000;
    } else {
      info.thunderTime = --thunder;
      if (thunder <= 0) info.thundering = !info.thundering;
    }
    let rain = info.rainTime;
    if (rain <= 0) {
      info.rainTime = info.raining ? this.rand.nextInt(12000) + 12000 : this.rand.nextInt(168000) + 12000;
    } else {
      info.rainTime = --rain;
      if (rain <= 0) info.raining = !info.raining;
    }
    this.prevRainingStrength = this.rainingStrength;
    this.rainingStrength = f(this.rainingStrength + (info.raining ? 0.01 : -0.01));
    if (this.rainingStrength < 0) this.rainingStrength = 0;
    if (this.rainingStrength > 1) this.rainingStrength = 1;
    this.prevThunderingStrength = this.thunderingStrength;
    this.thunderingStrength = f(this.thunderingStrength + (info.thundering ? 0.01 : -0.01));
    if (this.thunderingStrength < 0) this.thunderingStrength = 0;
    if (this.thunderingStrength > 1) this.thunderingStrength = 1;
  }

  toggleRain(): void {
    this.worldInfo.rainTime = 1;
  }

  isBlockFreezable(x: number, y: number, z: number): boolean {
    return this.canBlockFreeze(x, y, z, false);
  }

  isBlockFreezableNaturally(x: number, y: number, z: number): boolean {
    return this.canBlockFreeze(x, y, z, true);
  }

  canBlockFreeze(x: number, y: number, z: number, naturally: boolean): boolean {
    if (this.getBiomeGenForCoords(x, z).getFloatTemperature() > 0.15) return false;
    if (y >= 0 && y < 256 && this.getSavedLightValue(EnumSkyBlock.Block, x, y, z) < 10) {
      const id = this.getBlockId(x, y, z);
      if ((id === BlockIds.waterStill || id === BlockIds.waterMoving) && this.getBlockMetadata(x, y, z) === 0) {
        if (!naturally) return true;
        const surrounded =
          this.getBlockMaterial(x - 1, y, z) === Material.water &&
          this.getBlockMaterial(x + 1, y, z) === Material.water &&
          this.getBlockMaterial(x, y, z - 1) === Material.water &&
          this.getBlockMaterial(x, y, z + 1) === Material.water;
        if (!surrounded) return true;
      }
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

  // ------------------------------------------------------------------ ticking

  scheduleBlockUpdate(x: number, y: number, z: number, id: number, delay: number, priority = 0): void {
    const e = new NextTickListEntry(x, y, z, id);
    if (!this.checkChunksExist(x, y, z, x, y, z)) return;
    if (id > 0) {
      e.scheduledTime = delay + this.worldInfo.totalTime;
      e.priority = priority;
    }
    this.pendingTicks.add(e);
  }

  isBlockTickScheduled(x: number, y: number, z: number, id: number): boolean {
    return this.pendingTicks.contains(new NextTickListEntry(x, y, z, id));
  }

  /** Runs due scheduled updates (at most 1000 per tick, like WorldServer.tickUpdates). */
  tickUpdates(runAll: boolean): boolean {
    const now = this.worldInfo.totalTime;
    const due: NextTickListEntry[] = [];
    for (let n = 0; n < 1000; n++) {
      const top = this.pendingTicks.peek();
      if (!top || (!runAll && top.scheduledTime > now)) break;
      due.push(this.pendingTicks.poll()!);
    }
    for (const e of due) {
      if (this.checkChunksExist(e.xCoord, e.yCoord, e.zCoord, e.xCoord, e.yCoord, e.zCoord)) {
        const id = this.getBlockId(e.xCoord, e.yCoord, e.zCoord);
        if (id > 0 && Block.isAssociatedBlockID(id, e.blockID)) Block.blocksList[id]!.updateTick(this, e.xCoord, e.yCoord, e.zCoord, this.rand);
      } else {
        this.scheduleBlockUpdate(e.xCoord, e.yCoord, e.zCoord, e.blockID, 0);
      }
    }
    return this.pendingTicks.size > 0;
  }

  /** Active chunks around players, light checks, random block ticks, ice and snow. */
  protected tickBlocksAndAmbiance(): void {
    this.activeChunkSet.clear();
    for (const p of this.playerEntities) {
      const cx = MathHelper.floor_double(p.posX / 16);
      const cz = MathHelper.floor_double(p.posZ / 16);
      const r = 7;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) this.activeChunkSet.add(World.chunkKey(cx + dx, cz + dz));
    }
    if (this.ambientTickCountdown > 0) this.ambientTickCountdown--;
    if (this.playerEntities.length > 0) {
      const p = this.playerEntities[this.rand.nextInt(this.playerEntities.length)];
      const x = MathHelper.floor_double(p.posX) + this.rand.nextInt(11) - 5;
      const y = MathHelper.floor_double(p.posY) + this.rand.nextInt(11) - 5;
      const z = MathHelper.floor_double(p.posZ) + this.rand.nextInt(11) - 5;
      this.updateAllLightTypes(x, y, z);
    }
    for (const key of this.activeChunkSet) {
      const chunk = this.chunks.get(key);
      if (!chunk) continue;
      const bx = chunk.xPosition * 16;
      const bz = chunk.zPosition * 16;
      this.moodSoundAndLightCheck(bx, bz, chunk);
      chunk.updateSkylight();
      if (this.rand.nextInt(16) === 0) {
        this.updateLCG = (Math.imul(this.updateLCG, 3) + 1013904223) | 0;
        const r = this.updateLCG >> 2;
        const lx = r & 15;
        const lz = (r >> 8) & 15;
        const h = this.getPrecipitationHeight(lx + bx, lz + bz);
        if (this.isBlockFreezableNaturally(lx + bx, h - 1, lz + bz)) this.setBlock(lx + bx, h - 1, lz + bz, BlockIds.ice);
        if (this.isRaining() && this.canSnowAt(lx + bx, h, lz + bz)) this.setBlock(lx + bx, h, lz + bz, BlockIds.snow);
        if (this.isRaining() && this.getBiomeGenForCoords(lx + bx, lz + bz).canSpawnLightningBolt()) {
          const id = this.getBlockId(lx + bx, h - 1, lz + bz);
          if (id !== 0) Block.blocksList[id]?.fillWithRain(this, lx + bx, h - 1, lz + bz);
        }
      }
      for (const s of chunk.sections) {
        if (!s || !s.getNeedsRandomTick()) continue;
        for (let n = 0; n < 3; n++) {
          this.updateLCG = (Math.imul(this.updateLCG, 3) + 1013904223) | 0;
          const r = this.updateLCG >> 2;
          const lx = r & 15;
          const lz = (r >> 8) & 15;
          const ly = (r >> 16) & 15;
          const b = Block.blocksList[s.getExtBlockID(lx, ly, lz)];
          if (b && b.getTickRandomly()) b.updateTick(this, lx + bx, ly + s.yBase, lz + bz, this.rand);
        }
      }
    }
  }

  protected moodSoundAndLightCheck(bx: number, bz: number, chunk: Chunk): void {
    if (this.ambientTickCountdown === 0) {
      this.updateLCG = (Math.imul(this.updateLCG, 3) + 1013904223) | 0;
      const r = this.updateLCG >> 2;
      let x = r & 15;
      let z = (r >> 8) & 15;
      const y = (r >> 16) & 127;
      const id = chunk.getBlockID(x, y, z);
      x += bx;
      z += bz;
      if (id === 0 && this.getFullBlockLightValue(x, y, z) <= this.rand.nextInt(8) && this.getSavedLightValue(EnumSkyBlock.Sky, x, y, z) <= 0) {
        const p = this.getClosestPlayer(x + 0.5, y + 0.5, z + 0.5, 8);
        if (p && p.getDistanceSq(x + 0.5, y + 0.5, z + 0.5) > 4) {
          this.playSoundEffect(x + 0.5, y + 0.5, z + 0.5, 'ambient.cave.cave', 0.7, 0.8 + this.rand.nextFloat() * 0.2);
          this.ambientTickCountdown = this.rand.nextInt(12000) + 6000;
        }
      }
    }
    chunk.enqueueRelightChecks();
  }

  /** One game tick: weather, time, scheduled and random block updates (WorldServer.tick). */
  tick(): void {
    this.updateWeather();
    this.mobSpawner?.(this);
    const sub = this.calculateSkylightSubtracted(1);
    if (sub !== this.skylightSubtracted) this.skylightSubtracted = sub;
    this.worldInfo.totalTime++;
    this.worldInfo.worldTime++;
    this.tickUpdates(false);
    this.tickBlocksAndAmbiance();
  }

  /** WorldClient.doVoidFogParticles: random display ticks around the player. */
  doVoidFogParticles(px: number, py: number, pz: number): void {
    const r = 16;
    const rand = new JavaRandom();
    for (let i = 0; i < 1000; i++) {
      const x = px + this.rand.nextInt(r) - this.rand.nextInt(r);
      const y = py + this.rand.nextInt(r) - this.rand.nextInt(r);
      const z = pz + this.rand.nextInt(r) - this.rand.nextInt(r);
      const id = this.getBlockId(x, y, z);
      if (id === 0 && this.rand.nextInt(8) > y && this.provider.getWorldHasVoidParticles()) {
        this.spawnParticle('depthsuspend', x + this.rand.nextFloat(), y + this.rand.nextFloat(), z + this.rand.nextFloat(), 0, 0, 0);
      } else if (id > 0) {
        Block.blocksList[id]?.randomDisplayTick(this, x, y, z, rand);
      }
    }
  }

  getSpawnPoint(): { x: number; y: number; z: number } {
    return { x: this.worldInfo.spawnX, y: this.worldInfo.spawnY, z: this.worldInfo.spawnZ };
  }
}
