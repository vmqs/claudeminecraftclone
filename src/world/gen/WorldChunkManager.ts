import type { JavaRandom } from '../../core/JavaRandom';
import { Biomes, getBiome, type BiomeGenBase } from '../biome/BiomeGenBase';
import type { BiomeSource } from './ChunkProviderGenerate';
import type { GenLayer } from './layer/GenLayer';
import { initializeAllBiomeGenerators } from './layer/GenLayers';

const CACHE_LIMIT = 4096;

/** WorldChunkManager.getBiomesToSpawnIn: where createSpawnPosition looks for the world spawn. */
export const SPAWN_BIOMES: readonly BiomeGenBase[] = [
  Biomes.forest,
  Biomes.plains,
  Biomes.taiga,
  Biomes.taigaHills,
  Biomes.forestHills,
  Biomes.jungle,
  Biomes.jungleHills,
];

/**
 * WorldChunkManager: biomes of the Default and Large Biomes world types from the GenLayer
 * stack, with BiomeCache's per-chunk cache of the 1:1 layer.
 */
export class WorldChunkManager implements BiomeSource {
  private readonly genBiomes: GenLayer;
  private readonly biomeIndexLayer: GenLayer;
  /** chunk key -> 256 biome ids (x + z * 16), least recently used first. */
  private readonly cache = new Map<number, Uint8Array>();
  readonly biomesToSpawnIn = SPAWN_BIOMES;

  constructor(seed: bigint, worldType: string) {
    [this.genBiomes, this.biomeIndexLayer] = initializeAllBiomeGenerators(seed, worldType);
  }

  /** The 256 biome ids of chunk (cx, cz), cached. */
  getChunkBiomeIds(cx: number, cz: number): Uint8Array {
    const k = (cx + 0x200000) * 0x400000 + (cz + 0x200000);
    let ids = this.cache.get(k);
    if (ids) {
      this.cache.delete(k);
      this.cache.set(k, ids);
      return ids;
    }
    const raw = this.biomeIndexLayer.getInts(cx << 4, cz << 4, 16, 16);
    ids = new Uint8Array(256);
    for (let i = 0; i < 256; i++) ids[i] = raw[i];
    this.cache.set(k, ids);
    if (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
    return ids;
  }

  getBiomeGenAt(x: number, z: number): BiomeGenBase {
    return getBiome(this.getChunkBiomeIds(x >> 4, z >> 4)[(x & 15) | ((z & 15) << 4)]);
  }

  /** The 1:4 layer (terrain shaping, structure placement and spawn search). */
  getBiomesForGeneration(x: number, z: number, w: number, h: number): BiomeGenBase[] {
    const ints = this.genBiomes.getInts(x, z, w, h);
    const out: BiomeGenBase[] = new Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = getBiome(ints[i]);
    return out;
  }

  /** getBiomeGenAt(array, x, z, w, h, cacheFlag): the 1:1 layer. */
  loadBlockGeneratorData(x: number, z: number, w: number, h: number): BiomeGenBase[] {
    const out: BiomeGenBase[] = new Array(w * h);
    if (w === 16 && h === 16 && (x & 15) === 0 && (z & 15) === 0) {
      const ids = this.getChunkBiomeIds(x >> 4, z >> 4);
      for (let i = 0; i < 256; i++) out[i] = getBiome(ids[i]);
      return out;
    }
    const ints = this.biomeIndexLayer.getInts(x, z, w, h);
    for (let i = 0; i < w * h; i++) out[i] = getBiome(ints[i]);
    return out;
  }

  /** areBiomesViable: every 1:4 cell within `radius` of (x, z) is one of `allowed`. */
  areBiomesViable(x: number, z: number, radius: number, allowed: readonly BiomeGenBase[]): boolean {
    const x0 = (x - radius) >> 2;
    const z0 = (z - radius) >> 2;
    const w = ((x + radius) >> 2) - x0 + 1;
    const h = ((z + radius) >> 2) - z0 + 1;
    const ints = this.genBiomes.getInts(x0, z0, w, h);
    for (let i = 0; i < w * h; i++) if (!allowed.includes(getBiome(ints[i]))) return false;
    return true;
  }

  /** findBiomePosition: a random allowed 1:4 cell within `range` of (x, z) (reservoir pick), or null. */
  findBiomePosition(x: number, z: number, range: number, allowed: readonly BiomeGenBase[], rand: JavaRandom): [number, number] | null {
    const x0 = (x - range) >> 2;
    const z0 = (z - range) >> 2;
    const w = ((x + range) >> 2) - x0 + 1;
    const h = ((z + range) >> 2) - z0 + 1;
    const ints = this.genBiomes.getInts(x0, z0, w, h);
    let pos: [number, number] | null = null;
    let n = 0;
    for (let i = 0; i < w * h; i++) {
      const bx = (x0 + (i % w)) << 2;
      const bz = (z0 + Math.trunc(i / w)) << 2;
      if (allowed.includes(getBiome(ints[i])) && (pos === null || rand.nextInt(n + 1) === 0)) {
        pos = [bx, bz];
        n++;
      }
    }
    return pos;
  }
}
