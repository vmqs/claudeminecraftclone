import { BlockIds } from '../../block/BlockIds';
import { JavaRandom } from '../../core/JavaRandom';
import type { TagCompound } from '../../item/ItemStack';
import { Chunk } from '../Chunk';
import { ChunkSection } from '../ChunkSection';
import type { ChunkPayload, SectionPayload } from '../../workers/worldgenProtocol';
import { BONUS_CHEST_CONTENT } from './ChestLoot';
import { ChunkProviderFlat } from './ChunkProviderFlat';
import { type ChunkGenerator, ChunkProviderGenerate } from './ChunkProviderGenerate';
import { WorldGeneratorBonusChest } from './feature/WorldGeneratorBonusChest';
import { computeChunkLight } from './GenLighting';
import { GenStore } from './GenStore';
import { GenWorld } from './GenWorld';
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
  /** Chunks the original's ChunkProviderServer would hold while creating the world. */
  private readonly vanillaLoaded = new Set<number>();
  private vanillaMode = false;
  private populating = 0;
  spawn: [number, number, number] | null = null;

  constructor(readonly options: WorldGenOptions) {
    const seed = options.seed;
    this.provider =
      options.worldType === 'flat' ? new ChunkProviderFlat(seed, options.generatorOptions ?? null, options.mapFeatures) : new ChunkProviderGenerate(seed, options.mapFeatures, options.worldType);
    this.world = new GenWorld(this.provider.biomeSource);
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
    const gen = this.provider.provideChunk(cx, cz);
    c = new Chunk(w, cx, cz);
    const src = gen.blocks;
    const meta = gen.meta;
    for (let sy = 0; sy < 8; sy++) {
      let s: ChunkSection | null = null;
      for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
          const base = (x << 11) | (z << 7) | (sy << 4);
          for (let y = 0; y < 16; y++) {
            const id = src[base + y];
            if (id === 0) continue;
            if (!s) s = new ChunkSection(sy << 4);
            s.blocks[(y << 8) | (z << 4) | x] = id;
            if (meta && meta[base + y] !== 0) s.setExtBlockMetadata(x, y, z, meta[base + y]);
          }
        }
      }
      if (s) {
        s.recount();
        c.sections[sy] = s;
      }
    }
    c.biomes.set(gen.biomes);
    w.chunks.set(k, c);
    c.generateSkylightMap();
    return c;
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
  finalizeChunk(cx: number, cz: number): ChunkPayload {
    for (let dx = -2; dx <= 1; dx++) for (let dz = -2; dz <= 1; dz++) this.ensurePopulated(cx + dx, cz + dz);
    const around: Chunk[] = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) around.push(this.ensureTerrain(cx + dx, cz + dz));
    const c = around[4];
    computeChunkLight(around, c);
    const sections: SectionPayload[] = [];
    for (const s of c.sections) {
      if (!s || s.isEmpty()) continue;
      sections.push({ y: s.yBase, blocks: s.blocks.slice(), meta: s.meta.slice(), skyLight: s.skyLight.slice(), blockLight: s.blockLight.slice() });
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
    const r = this.options.initialRadius ?? 12;
    for (let dx = -r * 16; dx <= r * 16; dx += 16) for (let dz = -r * 16; dz <= r * 16; dz += 16) this.vanillaLoad((x + dx) >> 4, (z + dz) >> 4);
    this.vanillaMode = false;
    return this.spawn;
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
      w.chunks.delete(k);
    }
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
