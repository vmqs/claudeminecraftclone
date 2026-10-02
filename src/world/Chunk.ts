import { Block } from '../block/Block';
import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import { MathHelper } from '../core/MathHelper';
import type { Entity } from '../entity/Entity';
import { getBiome, type BiomeGenBase } from './biome/BiomeGenBase';
import { ChunkSection } from './ChunkSection';
import { EnumSkyBlock, SKY_BLOCK_DEFAULT } from './IBlockAccess';
import type { IWorld } from './IWorld';
import { Material } from '../block/Material';
import { isTileEntityProvider, type TileEntity } from './tileentity/TileEntity';
import type { EntitySpawnDescriptor } from './gen/WorldGenSpawning';

/** What a Chunk needs from its world (the client World, or the generation world in the worker). */
export interface ChunkHost extends IWorld {
  /** Adds tile entities to the ticking list (World.addTileEntity(Collection)). */
  addTileEntities(list: Iterable<TileEntity>): void;
  markBlocksDirtyVertical(x: number, z: number, y0: number, y1: number): void;
  markBlockForRenderUpdate(x: number, y: number, z: number): void;
  getChunkHeightMapMinimum(x: number, z: number): number;
  updateLightByType(type: EnumSkyBlock, x: number, y: number, z: number): void;
  updateAllLightTypes(x: number, y: number, z: number): void;
}

/**
 * A 16x256x16 column (Chunk). Light and height-map maintenance follow 1.5.2
 * (relightBlock, propagateSkylightOcclusion / updateSkylight_do "gap" lighting).
 */
export class Chunk {
  readonly sections: (ChunkSection | null)[] = new Array(16).fill(null);
  /** Lowest y with full sky light (index z << 4 | x). */
  readonly heightMap = new Int32Array(256);
  readonly biomes = new Uint8Array(256).fill(255);
  readonly precipitationHeightMap = new Int32Array(256).fill(-999);
  readonly updateSkylightColumns: boolean[] = new Array(256).fill(false);
  heightMapMinimum = 0;
  isChunkLoaded = false;
  isModified = false;
  /**
   * Changed by something other than the world's own ticking (players, entities, explosions,
   * commands); such chunks are kept in memory when unloaded. Set by World, see
   * World.runNaturally.
   */
  playerModified = false;
  hasEntities = false;
  isTerrainPopulated = true;
  private isGapLightingUpdated = false;
  readonly chunkTileEntityMap = new Map<number, TileEntity>();
  readonly entityLists: Entity[][] = Array.from({ length: 16 }, () => []);
  /**
   * Scheduled ticks waiting for the chunk to load: [x, y, z, blockId, delay, natural]. From the
   * generator they are natural (6th element missing or 1); ticks saved on unload keep their origin.
   */
  pendingTicks: number[][] = [];
  /** Animals placed by world generation (performWorldGenSpawning), spawned when it loads. */
  pendingSpawns: EntitySpawnDescriptor[] = [];
  private queuedLightChecks = 4096;

  constructor(
    readonly worldObj: ChunkHost,
    readonly xPosition: number,
    readonly zPosition: number,
  ) {}

  isAtLocation(x: number, z: number): boolean {
    return x === this.xPosition && z === this.zPosition;
  }

  getHeightValue(x: number, z: number): number {
    return this.heightMap[(z << 4) | x];
  }

  getTopFilledSegment(): number {
    for (let i = 15; i >= 0; i--) if (this.sections[i]) return this.sections[i]!.yBase;
    return 0;
  }

  getBlockStorageArray(): (ChunkSection | null)[] {
    return this.sections;
  }

  /** generateHeightMap: height map only, no light. */
  generateHeightMap(): void {
    const top = this.getTopFilledSegment();
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        this.precipitationHeightMap[x + (z << 4)] = -999;
        for (let y = top + 16 - 1; y > 0; y--) {
          if (Block.lightOpacity[this.getBlockID(x, y - 1, z)] !== 0) {
            this.heightMap[(z << 4) | x] = y;
            break;
          }
        }
      }
    }
    this.isModified = true;
  }

  /** generateSkylightMap: height map + straight-down sky light, then gap checks. */
  generateSkylightMap(): void {
    const top = this.getTopFilledSegment();
    this.heightMapMinimum = 2147483647;
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        this.precipitationHeightMap[x + (z << 4)] = -999;
        for (let y = top + 16 - 1; y > 0; y--) {
          if (this.getBlockLightOpacity(x, y - 1, z) !== 0) {
            this.heightMap[(z << 4) | x] = y;
            if (y < this.heightMapMinimum) this.heightMapMinimum = y;
            break;
          }
        }
        if (!this.worldObj.provider.hasNoSky) {
          let light = 15;
          let y = top + 16 - 1;
          do {
            light -= this.getBlockLightOpacity(x, y, z);
            if (light > 0) {
              const s = this.sections[y >> 4];
              if (s) {
                s.setExtSkylightValue(x, y & 15, z, light);
                this.worldObj.markBlockForRenderUpdate((this.xPosition << 4) + x, y, (this.zPosition << 4) + z);
              }
            }
            y--;
          } while (y > 0 && light > 0);
        }
      }
    }
    this.isModified = true;
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) this.propagateSkylightOcclusion(x, z);
  }

  private propagateSkylightOcclusion(x: number, z: number): void {
    this.updateSkylightColumns[x + z * 16] = true;
    this.isGapLightingUpdated = true;
  }

  private updateSkylight_do(): void {
    const w = this.worldObj;
    if (!w.doChunksNearChunkExist(this.xPosition * 16 + 8, 0, this.zPosition * 16 + 8, 16)) return;
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        if (!this.updateSkylightColumns[x + z * 16]) continue;
        this.updateSkylightColumns[x + z * 16] = false;
        const h = this.getHeightValue(x, z);
        const wx = this.xPosition * 16 + x;
        const wz = this.zPosition * 16 + z;
        let min = w.getChunkHeightMapMinimum(wx - 1, wz);
        const a = w.getChunkHeightMapMinimum(wx + 1, wz);
        const b = w.getChunkHeightMapMinimum(wx, wz - 1);
        const c = w.getChunkHeightMapMinimum(wx, wz + 1);
        if (a < min) min = a;
        if (b < min) min = b;
        if (c < min) min = c;
        this.checkSkylightNeighborHeight(wx, wz, min);
        this.checkSkylightNeighborHeight(wx - 1, wz, h);
        this.checkSkylightNeighborHeight(wx + 1, wz, h);
        this.checkSkylightNeighborHeight(wx, wz - 1, h);
        this.checkSkylightNeighborHeight(wx, wz + 1, h);
      }
    }
    this.isGapLightingUpdated = false;
  }

  private checkSkylightNeighborHeight(x: number, z: number, h: number): void {
    const nh = this.worldObj.getHeightValue(x, z);
    if (nh > h) this.updateSkylightNeighborHeight(x, z, h, nh + 1);
    else if (nh < h) this.updateSkylightNeighborHeight(x, z, nh, h + 1);
  }

  private updateSkylightNeighborHeight(x: number, z: number, y0: number, y1: number): void {
    if (y1 > y0 && this.worldObj.doChunksNearChunkExist(x, 0, z, 16)) {
      for (let y = y0; y < y1; y++) this.worldObj.updateLightByType(EnumSkyBlock.Sky, x, y, z);
      this.isModified = true;
    }
  }

  /** Re-derives the height map and sky light of one column after a change at y. */
  private relightBlock(x: number, y: number, z: number): void {
    const w = this.worldObj;
    const old = this.heightMap[(z << 4) | x] & 255;
    let h = old;
    if (y > old) h = y;
    while (h > 0 && this.getBlockLightOpacity(x, h - 1, z) === 0) h--;
    if (h === old) return;
    w.markBlocksDirtyVertical(x + this.xPosition * 16, z + this.zPosition * 16, h, old);
    this.heightMap[(z << 4) | x] = h;
    const wx = this.xPosition * 16 + x;
    const wz = this.zPosition * 16 + z;
    if (!w.provider.hasNoSky) {
      if (h < old) {
        for (let yy = h; yy < old; yy++) {
          const s = this.sections[yy >> 4];
          if (s) {
            s.setExtSkylightValue(x, yy & 15, z, 15);
            w.markBlockForRenderUpdate((this.xPosition << 4) + x, yy, (this.zPosition << 4) + z);
          }
        }
      } else {
        for (let yy = old; yy < h; yy++) {
          const s = this.sections[yy >> 4];
          if (s) {
            s.setExtSkylightValue(x, yy & 15, z, 0);
            w.markBlockForRenderUpdate((this.xPosition << 4) + x, yy, (this.zPosition << 4) + z);
          }
        }
      }
      let light = 15;
      let yy = h;
      while (yy > 0 && light > 0) {
        let op = this.getBlockLightOpacity(x, --yy, z);
        if (op === 0) op = 1;
        light -= op;
        if (light < 0) light = 0;
        const s = this.sections[yy >> 4];
        if (s) s.setExtSkylightValue(x, yy & 15, z, light);
      }
    }
    const nh = this.heightMap[(z << 4) | x];
    let lo = old;
    let hi = nh;
    if (nh < old) {
      lo = nh;
      hi = old;
    }
    if (nh < this.heightMapMinimum) this.heightMapMinimum = nh;
    if (!w.provider.hasNoSky) {
      this.updateSkylightNeighborHeight(wx - 1, wz, lo, hi);
      this.updateSkylightNeighborHeight(wx + 1, wz, lo, hi);
      this.updateSkylightNeighborHeight(wx, wz - 1, lo, hi);
      this.updateSkylightNeighborHeight(wx, wz + 1, lo, hi);
      this.updateSkylightNeighborHeight(wx, wz, lo, hi);
    }
    this.isModified = true;
  }

  getBlockLightOpacity(x: number, y: number, z: number): number {
    return Block.lightOpacity[this.getBlockID(x, y, z)];
  }

  getBlockID(x: number, y: number, z: number): number {
    if (y < 0 || y >> 4 >= 16) return 0;
    const s = this.sections[y >> 4];
    return s ? s.blocks[((y & 15) << 8) | (z << 4) | x] : 0;
  }

  getBlockMetadata(x: number, y: number, z: number): number {
    if (y < 0 || y >> 4 >= 16) return 0;
    const s = this.sections[y >> 4];
    return s ? s.meta[((y & 15) << 8) | (z << 4) | x] : 0;
  }

  /** Chunk.setBlockIDWithMetadata: calls breakBlock / onBlockAdded and keeps light in sync. */
  setBlockIDWithMetadata(x: number, y: number, z: number, id: number, meta: number): boolean {
    const col = (z << 4) | x;
    if (y >= this.precipitationHeightMap[col] - 1) this.precipitationHeightMap[col] = -999;
    const h = this.heightMap[col];
    const oldId = this.getBlockID(x, y, z);
    const oldMeta = this.getBlockMetadata(x, y, z);
    if (oldId === id && oldMeta === meta) return false;
    const w = this.worldObj;
    let s = this.sections[y >> 4];
    let createdAbove = false;
    if (!s) {
      if (id === 0) return false;
      s = this.sections[y >> 4] = new ChunkSection((y >> 4) << 4);
      createdAbove = y >= h;
    }
    const wx = this.xPosition * 16 + x;
    const wz = this.zPosition * 16 + z;
    if (oldId !== 0 && !w.isRemote) Block.blocksList[oldId]?.onSetBlockIDWithMetaData(w, wx, y, wz, oldMeta);
    s.setExtBlockID(x, y & 15, z, id);
    if (oldId !== 0 && !w.isRemote) Block.blocksList[oldId]?.breakBlock(w, wx, y, wz, oldId, oldMeta);
    if (s.getExtBlockID(x, y & 15, z) !== id) return false;
    s.setExtBlockMetadata(x, y & 15, z, meta);
    if (createdAbove) {
      this.generateSkylightMap();
    } else {
      if (Block.lightOpacity[id & 4095] > 0) {
        if (y >= h) this.relightBlock(x, y + 1, z);
      } else if (y === h - 1) {
        this.relightBlock(x, y, z);
      }
      this.propagateSkylightOcclusion(x, z);
    }
    const block = Block.blocksList[id];
    if (id !== 0 && block) {
      if (!w.isRemote) block.onBlockAdded(w, wx, y, wz);
      if (isTileEntityProvider(block)) {
        let te = this.getChunkBlockTileEntity(x, y, z);
        if (!te) {
          te = block.createNewTileEntity(w);
          w.setBlockTileEntity(wx, y, wz, te);
        }
        te?.updateContainingBlockInfo();
      }
    } else if (oldId > 0 && isTileEntityProvider(Block.blocksList[oldId])) {
      this.getChunkBlockTileEntity(x, y, z)?.updateContainingBlockInfo();
    }
    this.isModified = true;
    return true;
  }

  setBlockMetadata(x: number, y: number, z: number, meta: number): boolean {
    const s = this.sections[y >> 4];
    if (!s) return false;
    if (s.getExtBlockMetadata(x, y & 15, z) === meta) return false;
    this.isModified = true;
    s.setExtBlockMetadata(x, y & 15, z, meta);
    const id = s.getExtBlockID(x, y & 15, z);
    if (id > 0 && isTileEntityProvider(Block.blocksList[id])) {
      const te = this.getChunkBlockTileEntity(x, y, z);
      if (te) {
        te.updateContainingBlockInfo();
        te.blockMetadata = meta;
      }
    }
    return true;
  }

  getSavedLightValue(type: EnumSkyBlock, x: number, y: number, z: number): number {
    const s = this.sections[y >> 4];
    if (!s) return this.canBlockSeeTheSky(x, y, z) ? SKY_BLOCK_DEFAULT[type] : 0;
    if (type === EnumSkyBlock.Sky) return this.worldObj.provider.hasNoSky ? 0 : s.getExtSkylightValue(x, y & 15, z);
    return s.getExtBlocklightValue(x, y & 15, z);
  }

  setLightValue(type: EnumSkyBlock, x: number, y: number, z: number, v: number): void {
    let s = this.sections[y >> 4];
    if (!s) {
      s = this.sections[y >> 4] = new ChunkSection((y >> 4) << 4);
      this.generateSkylightMap();
    }
    this.isModified = true;
    if (type === EnumSkyBlock.Sky) {
      if (!this.worldObj.provider.hasNoSky) s.setExtSkylightValue(x, y & 15, z, v);
    } else {
      s.setExtBlocklightValue(x, y & 15, z, v);
    }
  }

  /** Combined light with the sky darkened by `skylightSubtracted`. */
  getBlockLightValue(x: number, y: number, z: number, subtracted: number): number {
    const s = this.sections[y >> 4];
    if (!s) return !this.worldObj.provider.hasNoSky && subtracted < 15 ? 15 - subtracted : 0;
    let sky = this.worldObj.provider.hasNoSky ? 0 : s.getExtSkylightValue(x, y & 15, z);
    sky -= subtracted;
    const block = s.getExtBlocklightValue(x, y & 15, z);
    return block > sky ? block : sky;
  }

  canBlockSeeTheSky(x: number, y: number, z: number): boolean {
    return y >= this.heightMap[(z << 4) | x];
  }

  // ------------------------------------------------------------------ entities

  addEntity(e: Entity): void {
    this.hasEntities = true;
    let cy = MathHelper.floor_double(e.posY / 16);
    if (cy < 0) cy = 0;
    if (cy >= 16) cy = 15;
    e.addedToChunk = true;
    e.chunkCoordX = this.xPosition;
    e.chunkCoordY = cy;
    e.chunkCoordZ = this.zPosition;
    this.entityLists[cy].push(e);
  }

  removeEntity(e: Entity): void {
    this.removeEntityAtIndex(e, e.chunkCoordY);
  }

  removeEntityAtIndex(e: Entity, cy: number): void {
    if (cy < 0) cy = 0;
    if (cy >= 16) cy = 15;
    const list = this.entityLists[cy];
    const i = list.indexOf(e);
    if (i >= 0) list.splice(i, 1);
  }

  getEntitiesWithinAABBForEntity(exclude: Entity | null, box: AxisAlignedBB, out: Entity[], filter?: (e: Entity) => boolean): void {
    let y0 = MathHelper.floor_double((box.minY - 2) / 16);
    let y1 = MathHelper.floor_double((box.maxY + 2) / 16);
    if (y0 < 0) {
      y0 = 0;
      y1 = Math.max(y0, y1);
    }
    if (y1 >= 16) {
      y1 = 15;
      y0 = Math.min(y0, y1);
    }
    for (let cy = y0; cy <= y1; cy++) {
      for (const e of this.entityLists[cy]) {
        if (e !== exclude && e.boundingBox.intersectsWith(box) && (!filter || filter(e))) {
          out.push(e);
          const parts = e.getParts();
          if (parts) for (const p of parts) if (p !== exclude && p.boundingBox.intersectsWith(box) && (!filter || filter(p))) out.push(p);
        }
      }
    }
  }

  // ------------------------------------------------------------------ tile entities

  static teKey(x: number, y: number, z: number): number {
    return (y << 8) | (z << 4) | x;
  }

  /** The tile entity at a position, created on demand for container blocks without one. */
  getChunkBlockTileEntity(x: number, y: number, z: number): TileEntity | null {
    const k = Chunk.teKey(x, y, z);
    let te = this.chunkTileEntityMap.get(k);
    if (!te) {
      const block = Block.blocksList[this.getBlockID(x, y, z)];
      if (!block || !block.hasTileEntity() || !isTileEntityProvider(block)) return null;
      this.worldObj.setBlockTileEntity(this.xPosition * 16 + x, y, this.zPosition * 16 + z, block.createNewTileEntity(this.worldObj));
      te = this.chunkTileEntityMap.get(k);
    }
    if (te && te.isInvalid()) {
      this.chunkTileEntityMap.delete(k);
      return null;
    }
    return te ?? null;
  }

  /** Adds a tile entity at its own coordinates (loading); ticked once the chunk is loaded. */
  addTileEntity(te: TileEntity): void {
    this.setChunkBlockTileEntity(te.xCoord - this.xPosition * 16, te.yCoord, te.zCoord - this.zPosition * 16, te);
    if (this.isChunkLoaded) this.worldObj.addTileEntities([te]);
  }

  /** Stores a tile entity if the block there provides one (replacing and invalidating the old one). */
  setChunkBlockTileEntity(x: number, y: number, z: number, te: TileEntity): void {
    te.setWorldObj(this.worldObj);
    te.xCoord = this.xPosition * 16 + x;
    te.yCoord = y;
    te.zCoord = this.zPosition * 16 + z;
    const id = this.getBlockID(x, y, z);
    if (id === 0 || !isTileEntityProvider(Block.blocksList[id])) return;
    const k = Chunk.teKey(x, y, z);
    this.chunkTileEntityMap.get(k)?.invalidate();
    te.validate();
    this.chunkTileEntityMap.set(k, te);
  }

  removeChunkBlockTileEntity(x: number, y: number, z: number): void {
    if (!this.isChunkLoaded) return;
    const k = Chunk.teKey(x, y, z);
    const te = this.chunkTileEntityMap.get(k);
    this.chunkTileEntityMap.delete(k);
    te?.invalidate();
  }

  // ------------------------------------------------------------------ misc

  getPrecipitationHeight(x: number, z: number): number {
    const i = x | (z << 4);
    let h = this.precipitationHeightMap[i];
    if (h === -999) {
      let y = this.getTopFilledSegment() + 15;
      h = -1;
      while (y > 0 && h === -1) {
        const id = this.getBlockID(x, y, z);
        const m = id === 0 ? Material.air : Block.blocksList[id]!.blockMaterial;
        if (!m.blocksMovement() && !m.isLiquid()) y--;
        else h = y + 1;
      }
      this.precipitationHeightMap[i] = h;
    }
    return h;
  }

  /** Runs pending "gap" sky-light checks (called each tick for active chunks). */
  updateSkylight(): void {
    if (this.isGapLightingUpdated && !this.worldObj.provider.hasNoSky) this.updateSkylight_do();
  }

  getAreLevelsEmpty(y0: number, y1: number): boolean {
    if (y0 < 0) y0 = 0;
    if (y1 >= 256) y1 = 255;
    for (let y = y0; y <= y1; y += 16) {
      const s = this.sections[y >> 4];
      if (s && !s.isEmpty()) return false;
    }
    return true;
  }

  getBiomeGenForWorldCoords(x: number, z: number): BiomeGenBase {
    return getBiome(this.biomes[(z << 4) | x]);
  }

  isEmpty(): boolean {
    return false;
  }

  /** Light re-checks spread over ticks (Chunk.enqueueRelightChecks). */
  resetRelightChecks(): void {
    this.queuedLightChecks = 0;
  }

  enqueueRelightChecks(): void {
    const w = this.worldObj;
    for (let n = 0; n < 8; n++) {
      if (this.queuedLightChecks >= 4096) return;
      const sy = this.queuedLightChecks % 16;
      const lx = ((this.queuedLightChecks / 16) | 0) % 16;
      const lz = (this.queuedLightChecks / 256) | 0;
      this.queuedLightChecks++;
      const wx = (this.xPosition << 4) + lx;
      const wz = (this.zPosition << 4) + lz;
      for (let dy = 0; dy < 16; dy++) {
        const y = (sy << 4) + dy;
        const s = this.sections[sy];
        if ((!s && (dy === 0 || dy === 15 || lx === 0 || lx === 15 || lz === 0 || lz === 15)) || (s && s.getExtBlockID(lx, dy, lz) === 0)) {
          if (Block.lightValue[w.getBlockId(wx, y - 1, wz)] > 0) w.updateAllLightTypes(wx, y - 1, wz);
          if (Block.lightValue[w.getBlockId(wx, y + 1, wz)] > 0) w.updateAllLightTypes(wx, y + 1, wz);
          if (Block.lightValue[w.getBlockId(wx - 1, y, wz)] > 0) w.updateAllLightTypes(wx - 1, y, wz);
          if (Block.lightValue[w.getBlockId(wx + 1, y, wz)] > 0) w.updateAllLightTypes(wx + 1, y, wz);
          if (Block.lightValue[w.getBlockId(wx, y, wz - 1)] > 0) w.updateAllLightTypes(wx, y, wz - 1);
          if (Block.lightValue[w.getBlockId(wx, y, wz + 1)] > 0) w.updateAllLightTypes(wx, y, wz + 1);
          w.updateAllLightTypes(wx, y, wz);
        }
      }
    }
  }
}

/** The blank chunk returned for unloaded positions (EmptyChunk). */
export class EmptyChunk extends Chunk {
  override isEmpty(): boolean {
    return true;
  }
  override setBlockIDWithMetadata(): boolean {
    return false;
  }
  override setBlockMetadata(): boolean {
    return false;
  }
  override setLightValue(): void {}
  override getSavedLightValue(): number {
    return 0;
  }
  override getBlockLightValue(): number {
    return 0;
  }
  override canBlockSeeTheSky(): boolean {
    return false;
  }
  override addEntity(): void {}
  override generateSkylightMap(): void {}
}
