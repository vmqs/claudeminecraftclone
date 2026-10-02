import { Biomes } from '../../biome/BiomeGenBase';
import { GenLayer, GenLayerCache } from './GenLayer';

const OCEAN = Biomes.ocean.biomeID;
const PLAINS = Biomes.plains.biomeID;
const DESERT = Biomes.desert.biomeID;
const EXTREME_HILLS = Biomes.extremeHills.biomeID;
const FOREST = Biomes.forest.biomeID;
const TAIGA = Biomes.taiga.biomeID;
const SWAMPLAND = Biomes.swampland.biomeID;
const RIVER = Biomes.river.biomeID;
const FROZEN_OCEAN = Biomes.frozenOcean.biomeID;
const FROZEN_RIVER = Biomes.frozenRiver.biomeID;
const ICE_PLAINS = Biomes.icePlains.biomeID;
const ICE_MOUNTAINS = Biomes.iceMountains.biomeID;
const MUSHROOM_ISLAND = Biomes.mushroomIsland.biomeID;
const MUSHROOM_SHORE = Biomes.mushroomIslandShore.biomeID;
const BEACH = Biomes.beach.biomeID;
const DESERT_HILLS = Biomes.desertHills.biomeID;
const FOREST_HILLS = Biomes.forestHills.biomeID;
const TAIGA_HILLS = Biomes.taigaHills.biomeID;
const EXTREME_HILLS_EDGE = Biomes.extremeHillsEdge.biomeID;
const JUNGLE = Biomes.jungle.biomeID;
const JUNGLE_HILLS = Biomes.jungleHills.biomeID;

/** The 1:4096 starting layer: land with probability 1/10, and land at the origin. */
export class GenLayerIsland extends GenLayer {
  getInts(x: number, z: number, w: number, h: number): Int32Array {
    const out = new Int32Array(w * h);
    for (let k = 0; k < h; k++) {
      for (let i = 0; i < w; i++) {
        this.initChunkSeed(x + i, z + k);
        out[i + k * w] = this.nextInt(10) === 0 ? 1 : 0;
      }
    }
    if (x > -w && x <= 0 && z > -h && z <= 0) out[-x + -z * w] = 1;
    return out;
  }
}

/** Doubles the resolution; the new cells copy a random corner (GenLayerZoom / FuzzyZoom). */
export class GenLayerZoom extends GenLayer {
  constructor(seed: number, parent: GenLayer) {
    super(seed);
    this.parent = parent;
  }

  getInts(x: number, z: number, w: number, h: number): Int32Array {
    const px = x >> 1;
    const pz = z >> 1;
    const pw = (w >> 1) + 3;
    const ph = (h >> 1) + 3;
    const p = this.parent!.getInts(px, pz, pw, ph);
    const rowW = pw << 1;
    const tmp = new Int32Array(rowW * (ph << 1));
    for (let k = 0; k < ph - 1; k++) {
      let idx = (k << 1) * rowW;
      let a = p[(k + 0) * pw];
      let b = p[(k + 1) * pw];
      for (let i = 0; i < pw - 1; i++) {
        this.initChunkSeed((i + px) << 1, (k + pz) << 1);
        const c = p[i + 1 + (k + 0) * pw];
        const d = p[i + 1 + (k + 1) * pw];
        tmp[idx] = a;
        tmp[idx++ + rowW] = this.choose2(a, b);
        tmp[idx] = this.choose2(a, c);
        tmp[idx++ + rowW] = this.choose4(a, c, b, d);
        a = c;
        b = d;
      }
    }
    const out = new Int32Array(w * h);
    for (let k = 0; k < h; k++) {
      const src = (k + (z & 1)) * rowW + (x & 1);
      out.set(tmp.subarray(src, src + w), k * w);
    }
    return out;
  }

  protected choose2(a: number, b: number): number {
    return this.nextInt(2) === 0 ? a : b;
  }

  /** modeOrRandom: the most common of four values, else a random one. */
  protected choose4(a: number, b: number, c: number, d: number): number {
    if (b === c && c === d) return b;
    if (a === b && a === c) return a;
    if (a === b && a === d) return a;
    if (a === c && a === d) return a;
    if (a === b && c !== d) return a;
    if (a === c && b !== d) return a;
    if (a === d && b !== c) return a;
    if (b === a && c !== d) return b;
    if (b === c && a !== d) return b;
    if (b === d && a !== c) return b;
    if (c === a && b !== d) return c;
    if (c === b && a !== d) return c;
    if (c === d && a !== b) return c;
    if (d === a && b !== c) return c;
    if (d === b && a !== c) return c;
    if (d === c && a !== b) return c;
    const r = this.nextInt(4);
    return r === 0 ? a : r === 1 ? b : r === 2 ? c : d;
  }

  /** magnify: `count` zoom layers with seeds seed, seed + 1, ... */
  static magnify(seed: number, parent: GenLayer, count: number): GenLayer {
    let l = parent;
    for (let i = 0; i < count; i++) l = new GenLayerZoom(seed + i, l);
    return l;
  }
}

/** Zoom whose diagonal cell is a pure random corner. */
export class GenLayerFuzzyZoom extends GenLayerZoom {
  protected override choose4(a: number, b: number, c: number, d: number): number {
    const r = this.nextInt(4);
    return r === 0 ? a : r === 1 ? b : r === 2 ? c : d;
  }
}

/** Base for the 3x3-neighbourhood layers: fetches the area grown by one cell on every side. */
abstract class GenLayerNeighbours extends GenLayer {
  constructor(seed: number, parent: GenLayer) {
    super(seed);
    this.parent = parent;
  }
}

/** Grows and erodes land at coastlines. */
export class GenLayerAddIsland extends GenLayerNeighbours {
  getInts(x: number, z: number, w: number, h: number): Int32Array {
    const pw = w + 2;
    const p = this.parent!.getInts(x - 1, z - 1, pw, h + 2);
    const out = new Int32Array(w * h);
    for (let k = 0; k < h; k++) {
      for (let i = 0; i < w; i++) {
        const nw = p[i + 0 + (k + 0) * pw];
        const ne = p[i + 2 + (k + 0) * pw];
        const sw = p[i + 0 + (k + 2) * pw];
        const se = p[i + 2 + (k + 2) * pw];
        const c = p[i + 1 + (k + 1) * pw];
        this.initChunkSeed(i + x, k + z);
        let v: number;
        if (c !== 0 || (nw === 0 && ne === 0 && sw === 0 && se === 0)) {
          if (c > 0 && (nw === 0 || ne === 0 || sw === 0 || se === 0)) {
            if (this.nextInt(5) === 0) v = c === ICE_PLAINS ? FROZEN_OCEAN : 0;
            else v = c;
          } else {
            v = c;
          }
        } else {
          let n = 1;
          let pick = 1;
          if (nw !== 0 && this.nextInt(n++) === 0) pick = nw;
          if (ne !== 0 && this.nextInt(n++) === 0) pick = ne;
          if (sw !== 0 && this.nextInt(n++) === 0) pick = sw;
          if (se !== 0 && this.nextInt(n++) === 0) pick = se;
          if (this.nextInt(3) === 0) v = pick;
          else v = pick === ICE_PLAINS ? FROZEN_OCEAN : 0;
        }
        out[i + k * w] = v;
      }
    }
    return out;
  }
}

/** Marks one land cell in five as snowy (ice plains). */
export class GenLayerAddSnow extends GenLayerNeighbours {
  getInts(x: number, z: number, w: number, h: number): Int32Array {
    const pw = w + 2;
    const p = this.parent!.getInts(x - 1, z - 1, pw, h + 2);
    const out = new Int32Array(w * h);
    for (let k = 0; k < h; k++) {
      for (let i = 0; i < w; i++) {
        const c = p[i + 1 + (k + 1) * pw];
        this.initChunkSeed(i + x, k + z);
        out[i + k * w] = c === 0 ? 0 : this.nextInt(5) === 0 ? ICE_PLAINS : 1;
      }
    }
    return out;
  }
}

/** Rare mushroom islands in open ocean. */
export class GenLayerAddMushroomIsland extends GenLayerNeighbours {
  getInts(x: number, z: number, w: number, h: number): Int32Array {
    const pw = w + 2;
    const p = this.parent!.getInts(x - 1, z - 1, pw, h + 2);
    const out = new Int32Array(w * h);
    for (let k = 0; k < h; k++) {
      for (let i = 0; i < w; i++) {
        const nw = p[i + 0 + (k + 0) * pw];
        const ne = p[i + 2 + (k + 0) * pw];
        const sw = p[i + 0 + (k + 2) * pw];
        const se = p[i + 2 + (k + 2) * pw];
        const c = p[i + 1 + (k + 1) * pw];
        this.initChunkSeed(i + x, k + z);
        out[i + k * w] = c === 0 && nw === 0 && ne === 0 && sw === 0 && se === 0 && this.nextInt(100) === 0 ? MUSHROOM_ISLAND : c;
      }
    }
    return out;
  }
}

/** Random river seeds (2 or 3) on land. */
export class GenLayerRiverInit extends GenLayerNeighbours {
  getInts(x: number, z: number, w: number, h: number): Int32Array {
    const p = this.parent!.getInts(x, z, w, h);
    const out = new Int32Array(w * h);
    for (let k = 0; k < h; k++) {
      for (let i = 0; i < w; i++) {
        this.initChunkSeed(i + x, k + z);
        out[i + k * w] = p[i + k * w] > 0 ? this.nextInt(2) + 2 : 0;
      }
    }
    return out;
  }
}

/** Rivers along the borders between river-seed regions (-1 = no river). */
export class GenLayerRiver extends GenLayerNeighbours {
  getInts(x: number, z: number, w: number, h: number): Int32Array {
    const pw = w + 2;
    const p = this.parent!.getInts(x - 1, z - 1, pw, h + 2);
    const out = new Int32Array(w * h);
    for (let k = 0; k < h; k++) {
      for (let i = 0; i < w; i++) {
        const west = p[i + 0 + (k + 1) * pw];
        const east = p[i + 2 + (k + 1) * pw];
        const north = p[i + 1 + (k + 0) * pw];
        const south = p[i + 1 + (k + 2) * pw];
        const c = p[i + 1 + (k + 1) * pw];
        out[i + k * w] =
          c !== 0 && west !== 0 && east !== 0 && north !== 0 && south !== 0 && c === west && c === north && c === east && c === south ? -1 : RIVER;
      }
    }
    return out;
  }
}

/** Removes single-cell noise along straight edges. */
export class GenLayerSmooth extends GenLayerNeighbours {
  getInts(x: number, z: number, w: number, h: number): Int32Array {
    const pw = w + 2;
    const p = this.parent!.getInts(x - 1, z - 1, pw, h + 2);
    const out = new Int32Array(w * h);
    for (let k = 0; k < h; k++) {
      for (let i = 0; i < w; i++) {
        const west = p[i + 0 + (k + 1) * pw];
        const east = p[i + 2 + (k + 1) * pw];
        const north = p[i + 1 + (k + 0) * pw];
        const south = p[i + 1 + (k + 2) * pw];
        let c = p[i + 1 + (k + 1) * pw];
        if (west === east && north === south) {
          this.initChunkSeed(i + x, k + z);
          c = this.nextInt(2) === 0 ? west : north;
        } else {
          if (west === east) c = west;
          if (north === south) c = north;
        }
        out[i + k * w] = c;
      }
    }
    return out;
  }
}

/** Turns land into biomes (snowy land becomes taiga or ice plains). */
export class GenLayerBiome extends GenLayerNeighbours {
  private readonly allowedBiomes: number[];

  constructor(seed: number, parent: GenLayer, worldType: string) {
    super(seed, parent);
    this.allowedBiomes =
      worldType === 'default_1_1' ? [DESERT, FOREST, EXTREME_HILLS, SWAMPLAND, PLAINS, TAIGA] : [DESERT, FOREST, EXTREME_HILLS, SWAMPLAND, PLAINS, TAIGA, JUNGLE];
  }

  getInts(x: number, z: number, w: number, h: number): Int32Array {
    const p = this.parent!.getInts(x, z, w, h);
    const out = new Int32Array(w * h);
    const n = this.allowedBiomes.length;
    for (let k = 0; k < h; k++) {
      for (let i = 0; i < w; i++) {
        this.initChunkSeed(i + x, k + z);
        const c = p[i + k * w];
        let v: number;
        if (c === 0) v = 0;
        else if (c === MUSHROOM_ISLAND) v = c;
        else if (c === 1) v = this.allowedBiomes[this.nextInt(n)];
        else {
          const b = this.allowedBiomes[this.nextInt(n)];
          v = b === TAIGA ? b : ICE_PLAINS;
        }
        out[i + k * w] = v;
      }
    }
    return out;
  }
}

/** Hills variants in the middle of a uniform biome. */
export class GenLayerHills extends GenLayerNeighbours {
  getInts(x: number, z: number, w: number, h: number): Int32Array {
    const pw = w + 2;
    const p = this.parent!.getInts(x - 1, z - 1, pw, h + 2);
    const out = new Int32Array(w * h);
    for (let k = 0; k < h; k++) {
      for (let i = 0; i < w; i++) {
        this.initChunkSeed(i + x, k + z);
        const c = p[i + 1 + (k + 1) * pw];
        if (this.nextInt(3) === 0) {
          let hill = c;
          if (c === DESERT) hill = DESERT_HILLS;
          else if (c === FOREST) hill = FOREST_HILLS;
          else if (c === TAIGA) hill = TAIGA_HILLS;
          else if (c === PLAINS) hill = FOREST;
          else if (c === ICE_PLAINS) hill = ICE_MOUNTAINS;
          else if (c === JUNGLE) hill = JUNGLE_HILLS;
          if (hill === c) {
            out[i + k * w] = c;
          } else {
            const north = p[i + 1 + k * pw];
            const east = p[i + 2 + (k + 1) * pw];
            const west = p[i + (k + 1) * pw];
            const south = p[i + 1 + (k + 2) * pw];
            out[i + k * w] = north === c && east === c && west === c && south === c ? hill : c;
          }
        } else {
          out[i + k * w] = c;
        }
      }
    }
    return out;
  }
}

/** Beaches, mushroom shores and extreme-hills edges. */
export class GenLayerShore extends GenLayerNeighbours {
  getInts(x: number, z: number, w: number, h: number): Int32Array {
    const pw = w + 2;
    const p = this.parent!.getInts(x - 1, z - 1, pw, h + 2);
    const out = new Int32Array(w * h);
    for (let k = 0; k < h; k++) {
      for (let i = 0; i < w; i++) {
        this.initChunkSeed(i + x, k + z);
        const c = p[i + 1 + (k + 1) * pw];
        const north = p[i + 1 + k * pw];
        const east = p[i + 2 + (k + 1) * pw];
        const west = p[i + (k + 1) * pw];
        const south = p[i + 1 + (k + 2) * pw];
        let v: number;
        if (c === MUSHROOM_ISLAND) {
          v = north !== OCEAN && east !== OCEAN && west !== OCEAN && south !== OCEAN ? c : MUSHROOM_SHORE;
        } else if (c !== OCEAN && c !== RIVER && c !== SWAMPLAND && c !== EXTREME_HILLS) {
          v = north !== OCEAN && east !== OCEAN && west !== OCEAN && south !== OCEAN ? c : BEACH;
        } else if (c === EXTREME_HILLS) {
          v = north === EXTREME_HILLS && east === EXTREME_HILLS && west === EXTREME_HILLS && south === EXTREME_HILLS ? c : EXTREME_HILLS_EDGE;
        } else {
          v = c;
        }
        out[i + k * w] = v;
      }
    }
    return out;
  }
}

/** Short river strips inside swamps and jungles. */
export class GenLayerSwampRivers extends GenLayerNeighbours {
  getInts(x: number, z: number, w: number, h: number): Int32Array {
    const pw = w + 2;
    const p = this.parent!.getInts(x - 1, z - 1, pw, h + 2);
    const out = new Int32Array(w * h);
    for (let k = 0; k < h; k++) {
      for (let i = 0; i < w; i++) {
        this.initChunkSeed(i + x, k + z);
        const c = p[i + 1 + (k + 1) * pw];
        const keep = (c !== SWAMPLAND || this.nextInt(6) !== 0) && ((c !== JUNGLE && c !== JUNGLE_HILLS) || this.nextInt(8) !== 0);
        out[i + k * w] = keep ? c : RIVER;
      }
    }
    return out;
  }
}

/** Lays the river layer over the biome layer (frozen rivers in ice plains, none in oceans). */
export class GenLayerRiverMix extends GenLayer {
  constructor(
    seed: number,
    private readonly biomeChain: GenLayer,
    private readonly riverChain: GenLayer,
  ) {
    super(seed);
  }

  override initWorldGenSeed(seed: bigint): void {
    this.biomeChain.initWorldGenSeed(seed);
    this.riverChain.initWorldGenSeed(seed);
    super.initWorldGenSeed(seed);
  }

  getInts(x: number, z: number, w: number, h: number): Int32Array {
    const b = this.biomeChain.getInts(x, z, w, h);
    const r = this.riverChain.getInts(x, z, w, h);
    const out = new Int32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const v = b[i];
      if (v === OCEAN) out[i] = v;
      else if (r[i] >= 0) {
        if (v === ICE_PLAINS) out[i] = FROZEN_RIVER;
        else if (v !== MUSHROOM_ISLAND && v !== MUSHROOM_SHORE) out[i] = r[i];
        else out[i] = MUSHROOM_SHORE;
      } else out[i] = v;
    }
    return out;
  }
}

/** The final 1:4 -> 1:1 zoom: each block takes the nearest of four jittered cell centres. */
export class GenLayerVoronoiZoom extends GenLayer {
  constructor(seed: number, parent: GenLayer) {
    super(seed);
    this.parent = parent;
  }

  getInts(x: number, z: number, w: number, h: number): Int32Array {
    x -= 2;
    z -= 2;
    const px = x >> 2;
    const pz = z >> 2;
    const pw = (w >> 2) + 3;
    const ph = (h >> 2) + 3;
    const p = this.parent!.getInts(px, pz, pw, ph);
    const rowW = pw << 2;
    const tmp = new Int32Array(rowW * (ph << 2));
    const jitter = 4 * 0.9;
    for (let k = 0; k < ph - 1; k++) {
      let a = p[(k + 0) * pw];
      let b = p[(k + 1) * pw];
      for (let i = 0; i < pw - 1; i++) {
        this.initChunkSeed((i + px) << 2, (k + pz) << 2);
        const ax = (this.nextInt(1024) / 1024 - 0.5) * jitter;
        const az = (this.nextInt(1024) / 1024 - 0.5) * jitter;
        this.initChunkSeed((i + px + 1) << 2, (k + pz) << 2);
        const cx = (this.nextInt(1024) / 1024 - 0.5) * jitter + 4;
        const cz = (this.nextInt(1024) / 1024 - 0.5) * jitter;
        this.initChunkSeed((i + px) << 2, (k + pz + 1) << 2);
        const bx = (this.nextInt(1024) / 1024 - 0.5) * jitter;
        const bz = (this.nextInt(1024) / 1024 - 0.5) * jitter + 4;
        this.initChunkSeed((i + px + 1) << 2, (k + pz + 1) << 2);
        const dx = (this.nextInt(1024) / 1024 - 0.5) * jitter + 4;
        const dz = (this.nextInt(1024) / 1024 - 0.5) * jitter + 4;
        const c = p[i + 1 + (k + 0) * pw];
        const d = p[i + 1 + (k + 1) * pw];
        for (let zz = 0; zz < 4; zz++) {
          let idx = ((k << 2) + zz) * rowW + (i << 2);
          for (let xx = 0; xx < 4; xx++) {
            const da = (zz - az) * (zz - az) + (xx - ax) * (xx - ax);
            const dc = (zz - cz) * (zz - cz) + (xx - cx) * (xx - cx);
            const db = (zz - bz) * (zz - bz) + (xx - bx) * (xx - bx);
            const dd = (zz - dz) * (zz - dz) + (xx - dx) * (xx - dx);
            if (da < dc && da < db && da < dd) tmp[idx++] = a;
            else if (dc < da && dc < db && dc < dd) tmp[idx++] = c;
            else if (db < da && db < dc && db < dd) tmp[idx++] = b;
            else tmp[idx++] = d;
          }
        }
        a = c;
        b = d;
      }
    }
    const out = new Int32Array(w * h);
    for (let k = 0; k < h; k++) {
      const src = (k + (z & 3)) * rowW + (x & 3);
      out.set(tmp.subarray(src, src + w), k * w);
    }
    return out;
  }
}

/**
 * initializeAllBiomeGenerators: the 1.5.2 stack. Returns [the 1:4 layer used to shape terrain
 * (genBiomes), the 1:1 layer giving every block column its biome (biomeIndexLayer)].
 * `biomeSize` is 4 for Default and 6 for Large Biomes.
 */
export function initializeAllBiomeGenerators(seed: bigint, worldType: string): [GenLayer, GenLayer] {
  const island = new GenLayerIsland(1);
  let l: GenLayer = new GenLayerFuzzyZoom(2000, island);
  l = new GenLayerAddIsland(1, l);
  l = new GenLayerZoom(2001, l);
  l = new GenLayerAddIsland(2, l);
  l = new GenLayerAddSnow(2, l);
  l = new GenLayerZoom(2002, l);
  l = new GenLayerAddIsland(3, l);
  l = new GenLayerZoom(2003, l);
  l = new GenLayerAddIsland(4, l);
  const mushroom = new GenLayerAddMushroomIsland(5, l);
  const biomeSize = worldType === 'largeBiomes' ? 6 : 4;

  let river: GenLayer = GenLayerZoom.magnify(1000, mushroom, 0);
  river = new GenLayerRiverInit(100, river);
  river = GenLayerZoom.magnify(1000, river, biomeSize + 2);
  river = new GenLayerRiver(1, river);
  river = new GenLayerSmooth(1000, river);

  let biomes: GenLayer = GenLayerZoom.magnify(1000, mushroom, 0);
  biomes = new GenLayerBiome(200, biomes, worldType);
  biomes = GenLayerZoom.magnify(1000, biomes, 2);
  biomes = new GenLayerHills(1000, biomes);
  for (let i = 0; i < biomeSize; i++) {
    biomes = new GenLayerZoom(1000 + i, biomes);
    if (i === 0) biomes = new GenLayerAddIsland(3, biomes);
    if (i === 1) {
      biomes = new GenLayerShore(1000, biomes);
      biomes = new GenLayerSwampRivers(1000, biomes);
    }
  }
  biomes = new GenLayerSmooth(1000, biomes);
  const mix = new GenLayerRiverMix(100, biomes, river);
  const voronoi = new GenLayerVoronoiZoom(10, mix);
  mix.initWorldGenSeed(seed);
  voronoi.initWorldGenSeed(seed);
  // Both outputs read the river-mix layer through one tile cache (identical values, less work).
  const cached = new GenLayerCache(mix);
  voronoi.setParent(cached);
  return [cached, voronoi];
}
