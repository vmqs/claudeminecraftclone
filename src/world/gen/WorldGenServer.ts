import { BlockIds } from '../../block/BlockIds';
import { JavaRandom } from '../../core/JavaRandom';
import type { TagCompound } from '../../item/ItemStack';
import { Chunk } from '../Chunk';
import type { ChunkPayload, SectionPayload } from '../../workers/worldgenProtocol';
import { BONUS_CHEST_CONTENT } from './ChestLoot';
import { ChunkProviderFlat } from './ChunkProviderFlat';
import { type ChunkGenerator, ChunkProviderGenerate } from './ChunkProviderGenerate';
import { WorldGeneratorBonusChest } from './feature/WorldGeneratorBonusChest';
import { computeChunkLight } from './GenLighting';
import { GenStore } from './GenStore';
import { DimensionGenerators } from './DimensionGenerators';
import { GenWorld } from './GenWorld';
import './nether/ChunkProviderHell';
import { chunkFromTerrain, type TerrainChunk, toTerrainChunk } from './TerrainChunk';
import { SPAWN_BIOMES } from './WorldChunkManager';

export interface WorldGenOptions {
  seed: bigint;
  /** 'default', 'flat', 'largeBiomes' (or 'default_1_1'). */
  worldType: string;
  mapFeatures: boolean;
  /** Superflat preset (FlatGeneratorInfo string); null for the default preset. */
  generatorOptions?: string | null;
  bonusChest?: boolean;
  /**
   * Chunk radius of the spawn area generated in the original's order at world creation
   * (MinecraftServer.initialWorldChunkLoad uses 12, i.e. 25x25 chunks); 0 disables it.
   */
  initialRadius?: number;
  /** The dimension generated (0 overworld, -1 the Nether, 1 the End: DimensionGenerators). */
  dimension?: number;
}

const key = GenWorld.key;

/**
 * The integrated server's world generation, run inside the world-generation worker: terrain,
 * population and lighting of chunks on request, the spawn search, the bonus chest, and the
 * structure queries. Every chunk is generated and populated once; chunks leaving the working
 * set are kept compressed in a GenStore, like the original's region files.
 */
export class WorldGenServer {
  readonly provider: ChunkGenerator;
  readonly world: GenWorld;
  private readonly store = new GenStore();
  private readonly populated = new Set<number>();
  /** Terrain made ahead by the terrain worker, not yet taken into the world. */
  private readonly prefetched = new Map<number, TerrainChunk>();
  /** Chunks the original's ChunkProviderServer would hold while creating the world. */
  private readonly vanillaLoaded = new Set<number>();
  private vanillaMode = false;
  private populating = 0;
  spawn: [number, number, number] | null = null;

  constructor(readonly options: WorldGenOptions) {
    const seed = options.seed;
    const other = options.dimension ? DimensionGenerators.create(options.dimension, seed, options.mapFeatures) : null;
    this.provider =
      other ??
      (options.worldType === 'flat' ? new ChunkProviderFlat(seed, options.generatorOptions ?? null, options.mapFeatures) : new ChunkProviderGenerate(seed, options.mapFeatures, options.worldType));
    this.world = new GenWorld(this.provider.biomeSource);
    if (other) this.world.provider = { ...other.providerInfo };
    this.world.averageGroundLevel = this.provider.getAverageGroundLevel();
    this.world.missingChunk = (cx, cz) => (this.populating > 0 ? this.loadForFeature(cx, cz) : undefined);
  }

  // ------------------------------------------------------------------ chunks

  /** The chunk with its raw terrain (generated, or restored from the store). */
  ensureTerrain(cx: number, cz: number): Chunk {
    const w = this.world;
    const k = key(cx, cz);
    let c = w.chunks.get(k);
    if (c) return c;
    const restored = this.store.take(k, w, cx, cz);
    if (restored) {
      c = restored.chunk;
      w.chunks.set(k, c);
      if (restored.tiles.length > 0) {
        const m = new Map<number, TagCompound>();
        for (const t of restored.tiles) m.set(Chunk.teKey(Number(t.x) & 15, Number(t.y), Number(t.z) & 15), t);
        w.tileTags.set(k, m);
      }
      return c;
    }
    const pre = this.prefetched.get(k);
    if (pre) {
      // Terrain made by the terrain worker: identical to provideTerrain here.
      this.prefetched.delete(k);
      this.provider.recordStructures!(cx, cz);
      c = chunkFromTerrain(w, pre);
    } else {
      c = chunkFromTerrain(w, toTerrainChunk(cx, cz, this.provider.provideChunk(cx, cz)));
    }
    w.chunks.set(k, c);
    return c;
  }

  /** Whether the generator's terrain can be made elsewhere (the terrain worker). */
  get canPrefetchTerrain(): boolean {
    return this.provider.provideTerrain !== undefined && this.provider.recordStructures !== undefined;
  }

  /** Whether chunk terrain is at hand (generated, stored or prefetched). */
  hasTerrain(cx: number, cz: number): boolean {
    const k = key(cx, cz);
    return this.world.chunks.has(k) || this.store.has(k) || this.prefetched.has(k);
  }

  /**
   * Terrain made ahead by the terrain worker. It is only taken into the world when generation
   * asks for that chunk, so what is loaded (which gates light updates) never depends on timing.
   */
  offerTerrain(t: TerrainChunk): void {
    if (!this.hasTerrain(t.cx, t.cz)) this.prefetched.set(key(t.cx, t.cz), t);
  }

  /** Makes a chunk's terrain here ahead of need (like the terrain worker would). */
  prefetchTerrain(cx: number, cz: number): void {
    if (this.hasTerrain(cx, cz)) return;
    this.prefetched.set(key(cx, cz), toTerrainChunk(cx, cz, this.provider.provideTerrain!(cx, cz)));
  }

  /** The chunks whose terrain finalizeChunk(cx, cz) will need and that are not at hand yet. */
  missingTerrainFor(cx: number, cz: number, out: [number, number][] = []): [number, number][] {
    const seen = new Set<number>();
    const want = (x: number, z: number) => {
      const k = key(x, z);
      if (seen.has(k)) return;
      seen.add(k);
      if (!this.hasTerrain(x, z)) out.push([x, z]);
    };
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) want(cx + dx, cz + dz);
    for (let dx = -2; dx <= 1; dx++) {
      for (let dz = -2; dz <= 1; dz++) {
        if (this.populated.has(key(cx + dx, cz + dz))) continue;
        for (let ex = 0; ex <= 1; ex++) for (let ez = 0; ez <= 1; ez++) want(cx + dx + ex, cz + dz + ez);
      }
    }
    return out;
  }

  /** A chunk a feature touches outside the populated area (the original loads it then). */
  private loadForFeature(cx: number, cz: number): Chunk {
    const c = this.ensureTerrain(cx, cz);
    if (this.vanillaMode) this.vanillaLoaded.add(key(cx, cz));
    return c;
  }

  isPopulated(cx: number, cz: number): boolean {
    return this.populated.has(key(cx, cz));
  }

  /** ChunkProviderServer.populate: decorates the area (cx*16+8 .. cx*16+23) once. */
  ensurePopulated(cx: number, cz: number): void {
    const k = key(cx, cz);
    if (this.populated.has(k)) return;
    for (let dx = 0; dx <= 1; dx++) for (let dz = 0; dz <= 1; dz++) this.ensureTerrain(cx + dx, cz + dz);
    this.populated.add(k);
    this.populating++;
    try {
      this.provider.populate(this.world, cx, cz);
    } finally {
      this.populating--;
    }
  }

  /**
   * ChunkProviderServer.loadChunk + Chunk.populateChunk while the world is being created: the
   * chunk is generated and every 2x2 group it completes is populated, in the original's order.
   */
  private vanillaLoad(cx: number, cz: number): Chunk {
    const k = key(cx, cz);
    const c = this.ensureTerrain(cx, cz);
    if (this.vanillaLoaded.has(k)) return c;
    this.vanillaLoaded.add(k);
    const exists = (x: number, z: number) => this.vanillaLoaded.has(key(x, z));
    const pop = (x: number, z: number) => this.ensurePopulated(x, z);
    const done = (x: number, z: number) => this.populated.has(key(x, z));
    if (!done(cx, cz) && exists(cx + 1, cz + 1) && exists(cx, cz + 1) && exists(cx + 1, cz)) pop(cx, cz);
    if (exists(cx - 1, cz) && !done(cx - 1, cz) && exists(cx - 1, cz + 1) && exists(cx, cz + 1) && exists(cx - 1, cz + 1)) pop(cx - 1, cz);
    if (exists(cx, cz - 1) && !done(cx, cz - 1) && exists(cx + 1, cz - 1) && exists(cx + 1, cz - 1) && exists(cx + 1, cz)) pop(cx, cz - 1);
    if (exists(cx - 1, cz - 1) && !done(cx - 1, cz - 1) && exists(cx, cz - 1) && exists(cx - 1, cz)) pop(cx - 1, cz - 1);
    return c;
  }

  /**
   * The finished chunk (cx, cz): population has run for every chunk that writes into it
   * ((cx-1..cx, cz-1..cz)) and its light is computed from the populated 3x3 neighbourhood.
   */
  finalizeChunk(cx: number, cz: number, keepLight = false): ChunkPayload {
    for (let dx = -2; dx <= 1; dx++) for (let dz = -2; dz <= 1; dz++) this.ensurePopulated(cx + dx, cz + dz);
    const around: Chunk[] = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) around.push(this.ensureTerrain(cx + dx, cz + dz));
    const c = around[4];
    const sections: SectionPayload[] = [];
    if (keepLight) {
      // The light goes into the payload only; the chunk keeps the light population maintained.
      const bySy: (SectionPayload | null)[] = [];
      for (const s of c.sections) {
        if (!s || s.isEmpty()) {
          bySy.push(null);
          continue;
        }
        const p = { y: s.yBase, blocks: s.blocks.slice(), meta: s.meta.slice(), skyLight: new Uint8Array(4096), blockLight: new Uint8Array(4096) };
        bySy.push(p);
        sections.push(p);
      }
      computeChunkLight(around, c, (sy) => bySy[sy]);
    } else {
      computeChunkLight(around, c);
      for (const s of c.sections) {
        if (!s || s.isEmpty()) continue;
        sections.push({ y: s.yBase, blocks: s.blocks.slice(), meta: s.meta.slice(), skyLight: s.skyLight.slice(), blockLight: s.blockLight.slice() });
      }
    }
    const ticks = c.pendingTicks.filter((t) => t[0] >> 4 === cx && t[2] >> 4 === cz);
    const tileEntities = this.collectTileEntities(c);
    const entities = c.pendingSpawns.filter((d) => Math.floor(d.x) >> 4 === cx && Math.floor(d.z) >> 4 === cz);
    return { type: 'chunk', cx, cz, sections, heightMap: c.heightMap.slice(), biomes: c.biomes.slice(), pendingTicks: ticks, tileEntities, entities };
  }

  /** Generated tile-entity tags (for blocks still there) plus tile entities the blocks created. */
  private collectTileEntities(c: Chunk): TagCompound[] {
    const out: TagCompound[] = [];
    const tags = this.world.tileTags.get(key(c.xPosition, c.zPosition));
    if (tags) {
      for (const [k, t] of tags) {
        const id = c.getBlockID(k & 15, k >> 8, (k >> 4) & 15);
        if (TILE_BLOCKS[String(t.id)]?.includes(id) ?? id !== 0) out.push(structuredClone(t));
      }
    }
    for (const te of c.chunkTileEntityMap.values()) {
      if (te.isInvalid()) continue;
      if (tags?.has(Chunk.teKey(te.xCoord & 15, te.yCoord, te.zCoord & 15))) continue;
      const t: TagCompound = {};
      te.writeToNBT(t);
      out.push(t);
    }
    return out;
  }

  /**
   * Whether chunk (cx, cz) can be finalized while the spawn area is still loading without
   * changing anything the rest of the spawn area does: every population that writes into its 3x3
   * neighbourhood (and the ring around that) has run, so nothing is generated, populated or
   * loaded by finalizing it, and finalizeChunk(cx, cz, true) leaves the chunks' light alone.
   */
  canFinalizeEarly(cx: number, cz: number): boolean {
    for (let dx = -3; dx <= 2; dx++) for (let dz = -3; dz <= 2; dz++) if (!this.populated.has(key(cx + dx, cz + dz))) return false;
    return true;
  }

  /** Block writes into the 3x3 chunks around (cx, cz) so far (GenWorld.blockWrites). */
  neighbourhoodWrites(cx: number, cz: number): number {
    let n = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) n += this.world.writesIn(cx + dx, cz + dz);
    return n;
  }

  // ------------------------------------------------------------------ spawn

  /** World.getFirstUncoveredBlock (loading chunks like the original while it searches). */
  private getFirstUncoveredBlock(x: number, z: number): number {
    this.vanillaLoad(x >> 4, z >> 4);
    const w = this.world;
    let y = 63;
    while (!w.isAirBlock(x, y + 1, z)) y++;
    return w.getBlockId(x, y, z);
  }

  /**
   * WorldServer.createSpawnPosition, the bonus chest, then MinecraftServer.initialWorldChunkLoad
   * (the spawn area generated and populated in the original order).
   */
  createSpawnPosition(): [number, number, number] {
    const spawn = this.findSpawnPoint();
    for (const [cx, cz] of this.spawnAreaOrder()) this.loadSpawnAreaChunk(cx, cz);
    this.finishSpawnArea();
    return spawn;
  }

  /** WorldServer.createSpawnPosition and the bonus chest; the spawn area loads afterwards. */
  findSpawnPoint(): [number, number, number] {
    this.vanillaMode = true;
    const rand = new JavaRandom(this.options.seed);
    const allowed = SPAWN_BIOMES;
    const pos = this.provider.biomeSource.findBiomePosition(0, 0, 256, allowed, rand);
    let x = 0;
    let z = 0;
    const y = this.provider.getAverageGroundLevel();
    if (pos) [x, z] = pos;
    let tries = 0;
    while (this.getFirstUncoveredBlock(x, z) !== BlockIds.grass) {
      x += rand.nextInt(64) - rand.nextInt(64);
      z += rand.nextInt(64) - rand.nextInt(64);
      if (++tries === 1000) break;
    }
    this.spawn = [x, y, z];
    if (this.options.bonusChest) this.createBonusChest(x, z);
    return this.spawn;
  }

  /** The chunks of MinecraftServer.initialWorldChunkLoad, in its order. */
  spawnAreaOrder(): [number, number][] {
    const [x, , z] = this.spawn!;
    const r = this.options.initialRadius ?? 12;
    const out: [number, number][] = [];
    for (let dx = -r * 16; dx <= r * 16; dx += 16) for (let dz = -r * 16; dz <= r * 16; dz += 16) out.push([(x + dx) >> 4, (z + dz) >> 4]);
    return out;
  }

  /** One step of the spawn-area load (call in spawnAreaOrder order). */
  loadSpawnAreaChunk(cx: number, cz: number): void {
    this.vanillaLoad(cx, cz);
  }

  finishSpawnArea(): void {
    this.vanillaMode = false;
  }

  /** WorldServer.createBonusChest (the original uses the world's unseeded random here). */
  private createBonusChest(sx: number, sz: number): void {
    const rand = new JavaRandom();
    const gen = new WorldGeneratorBonusChest(BONUS_CHEST_CONTENT, 10);
    const w = this.world;
    this.populating++;
    try {
      for (let i = 0; i < 10; i++) {
        const x = sx + rand.nextInt(6) - rand.nextInt(6);
        const z = sz + rand.nextInt(6) - rand.nextInt(6);
        this.vanillaLoad(x >> 4, z >> 4);
        const y = w.getTopSolidOrLiquidBlock(x, z) + 1;
        if (gen.generate(w, rand, x, y, z)) break;
      }
    } finally {
      this.populating--;
    }
  }

  // ------------------------------------------------------------------ structures

  /** ChunkProviderGenerate.findClosestStructure ("Stronghold"); null when there is none. */
  findClosestStructure(name: string, x: number, y: number, z: number): [number, number, number] | null {
    return this.provider.findClosestStructure?.(name, x, y, z) ?? null;
  }

  // ------------------------------------------------------------------ memory

  /** Moves chunks farther than `radius` from (pcx, pcz) into the compressed store. */
  evict(pcx: number, pcz: number, radius: number, keep: (k: number) => boolean): void {
    const w = this.world;
    for (const [k, c] of w.chunks) {
      if (Math.max(Math.abs(c.xPosition - pcx), Math.abs(c.zPosition - pcz)) <= radius || keep(k)) continue;
      this.store.put(k, c, w.tileTags.get(k));
      w.tileTags.delete(k);
      w.unloadChunk(k);
    }
  }

  /** Drops prefetched terrain farther than `radius` from (pcx, pcz) (it can be made again). */
  dropPrefetched(pcx: number, pcz: number, radius: number, keep?: (cx: number, cz: number) => boolean): void {
    for (const [k, t] of this.prefetched) if (Math.max(Math.abs(t.cx - pcx), Math.abs(t.cz - pcz)) > radius && !keep?.(t.cx, t.cz)) this.prefetched.delete(k);
  }

  stats(): { live: number; stored: number; storedBytes: number; populated: number } {
    return { live: this.world.chunks.size, stored: this.store.size, storedBytes: this.store.storedBytes, populated: this.populated.size };
  }
}

/** Block ids a generated tile-entity tag may belong to. */
const TILE_BLOCKS: Record<string, number[]> = {
  Chest: [BlockIds.chest, BlockIds.chestTrapped],
  Trap: [BlockIds.dispenser],
  MobSpawner: [BlockIds.mobSpawner],
};
