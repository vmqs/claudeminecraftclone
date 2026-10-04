import { BlockIds } from '../../block/BlockIds';
import { BlockSand } from '../../block/BlockSand';
import { JavaRandom } from '../../core/JavaRandom';
import { MathHelper } from '../../core/MathHelper';
import { Biomes, type BiomeGenBase } from '../biome/BiomeGenBase';
import type { IWorld } from '../IWorld';
import { BiomeDecoration } from './BiomeDecorator';
import { WorldGenDungeons } from './feature/WorldGenDungeons';
import { NoiseGeneratorOctaves } from './NoiseGeneratorOctaves';
import { MapGenCaves } from './MapGenCaves';
import { MapGenMineshaft } from './structure/Mineshaft';
import { MapGenScatteredFeature } from './structure/ScatteredFeatures';
import { MapGenStronghold } from './structure/Stronghold';
import { MapGenVillage } from './structure/Village';
import { MapGenRavine } from './MapGenRavine';
import { WorldChunkManager } from './WorldChunkManager';
import { WorldGenLakes } from './WorldGenLakes';
import { performWorldGenSpawning, type SpawnRecorder } from './WorldGenSpawning';

const f = Math.fround;

/**
 * Supplies biomes for generation (WorldChunkManager).
 */
export interface BiomeSource {
  /** getBiomesForGeneration: the coarse (1:4) biome grid used to shape terrain. */
  getBiomesForGeneration(x: number, z: number, w: number, h: number): BiomeGenBase[];
  /** loadBlockGeneratorData: per-column biomes for a 16x16 area. */
  loadBlockGeneratorData(x: number, z: number, w: number, h: number): BiomeGenBase[];
  getBiomeGenAt(x: number, z: number): BiomeGenBase;
  /** findBiomePosition: a random allowed 1:4 cell within range of (x, z), or null. */
  findBiomePosition(x: number, z: number, range: number, allowed: readonly BiomeGenBase[], rand: JavaRandom): [number, number] | null;
  /** areBiomesViable: every 1:4 cell within radius of (x, z) is allowed. */
  areBiomesViable(x: number, z: number, radius: number, allowed: readonly BiomeGenBase[]): boolean;
}

/**
 * Raw generated chunk: block ids in the original's x<<11 | z<<7 | y layout (height 128), or
 * x<<12 | z<<8 | y for 256-high superflat chunks, and biomes.
 */
export interface GeneratedChunk {
  blocks: Uint8Array;
  /** 128 (default) or 256. */
  height?: number;
  /** Block metadata in the same layout (superflat layers); absent means all zero. */
  meta?: Uint8Array;
  biomes: Uint8Array;
}

/** What the world-generation worker needs from a generator (IChunkProvider on the server). */
export interface ChunkGenerator {
  readonly biomeSource: BiomeSource;
  provideChunk(cx: number, cz: number): GeneratedChunk;
  /**
   * The terrain part of provideChunk alone, a pure function of the seed and position (the
   * terrain worker runs it); recordStructures must then run for the chunk on the populating side.
   */
  provideTerrain?(cx: number, cz: number): GeneratedChunk;
  /** The structure part of provideChunk: records the structure starts around the chunk. */
  recordStructures?(cx: number, cz: number): void;
  populate(world: IWorld, cx: number, cz: number): void;
  /** WorldProvider.getAverageGroundLevel: the spawn search height (64, or 4 for superflat). */
  getAverageGroundLevel(): number;
  /** findClosestStructure: the nearest stronghold to (x, y, z) for eyes of ender. */
  findClosestStructure?(name: string, x: number, y: number, z: number): [number, number, number] | null;
}

/**
 * The overworld generator ("RandomLevelSource"): density-noise terrain, biome surface
 * replacement and population. Caves, ravines and structures are not generated yet.
 */
export class ChunkProviderGenerate implements ChunkGenerator {
  private readonly rand: JavaRandom;
  private readonly noiseGen1: NoiseGeneratorOctaves;
  private readonly noiseGen2: NoiseGeneratorOctaves;
  private readonly noiseGen3: NoiseGeneratorOctaves;
  private readonly noiseGen4: NoiseGeneratorOctaves;
  readonly noiseGen5: NoiseGeneratorOctaves;
  readonly noiseGen6: NoiseGeneratorOctaves;
  readonly mobSpawnerNoise: NoiseGeneratorOctaves;
  private noiseArray: Float64Array | null = null;
  private stoneNoise: Float64Array | null = null;
  private noise1: Float64Array | null = null;
  private noise2: Float64Array | null = null;
  private noise3: Float64Array | null = null;
  private noise5: Float64Array | null = null;
  private noise6: Float64Array | null = null;
  private parabolicField: Float32Array | null = null;
  private biomesForGeneration: BiomeGenBase[] = [];
  private readonly decoration = new BiomeDecoration();
  private readonly caveGenerator = new MapGenCaves();
  private readonly ravineGenerator = new MapGenRavine();
  readonly strongholdGenerator = new MapGenStronghold();
  readonly villageGenerator = new MapGenVillage();
  readonly mineshaftGenerator = new MapGenMineshaft();
  readonly scatteredFeatureGenerator = new MapGenScatteredFeature();

  readonly biomeSource: WorldChunkManager;

  constructor(
    readonly seed: bigint,
    readonly mapFeaturesEnabled: boolean,
    worldType = 'default',
  ) {
    this.biomeSource = new WorldChunkManager(seed, worldType);
    this.rand = new JavaRandom(seed);
    this.noiseGen1 = new NoiseGeneratorOctaves(this.rand, 16);
    this.noiseGen2 = new NoiseGeneratorOctaves(this.rand, 16);
    this.noiseGen3 = new NoiseGeneratorOctaves(this.rand, 8);
    this.noiseGen4 = new NoiseGeneratorOctaves(this.rand, 4);
    this.noiseGen5 = new NoiseGeneratorOctaves(this.rand, 10);
    this.noiseGen6 = new NoiseGeneratorOctaves(this.rand, 16);
    this.mobSpawnerNoise = new NoiseGeneratorOctaves(this.rand, 8);
  }

  generateTerrain(cx: number, cz: number, blocks: Uint8Array): void {
    const cells = 4;
    const sizeX = cells + 1;
    const sizeY = 17;
    const sizeZ = cells + 1;
    const seaLevel = 63;
    this.biomesForGeneration = this.biomeSource.getBiomesForGeneration(cx * 4 - 2, cz * 4 - 2, sizeX + 5, sizeZ + 5);
    const n = (this.noiseArray = this.initializeNoiseField(this.noiseArray, cx * cells, 0, cz * cells, sizeX, sizeY, sizeZ));
    for (let i = 0; i < cells; i++) {
      for (let k = 0; k < cells; k++) {
        for (let j = 0; j < 16; j++) {
          const yStep = 0.125;
          let d000 = n[((i + 0) * sizeZ + k + 0) * sizeY + j + 0];
          let d010 = n[((i + 0) * sizeZ + k + 1) * sizeY + j + 0];
          let d100 = n[((i + 1) * sizeZ + k + 0) * sizeY + j + 0];
          let d110 = n[((i + 1) * sizeZ + k + 1) * sizeY + j + 0];
          const s000 = (n[((i + 0) * sizeZ + k + 0) * sizeY + j + 1] - d000) * yStep;
          const s010 = (n[((i + 0) * sizeZ + k + 1) * sizeY + j + 1] - d010) * yStep;
          const s100 = (n[((i + 1) * sizeZ + k + 0) * sizeY + j + 1] - d100) * yStep;
          const s110 = (n[((i + 1) * sizeZ + k + 1) * sizeY + j + 1] - d110) * yStep;
          for (let yy = 0; yy < 8; yy++) {
            const xStep = 0.25;
            let a = d000;
            let b = d010;
            const ax = (d100 - d000) * xStep;
            const bx = (d110 - d010) * xStep;
            for (let xx = 0; xx < 4; xx++) {
              let idx = (((xx + i * 4) << 11) | ((0 + k * 4) << 7) | (j * 8 + yy)) - 128;
              const zStep = 0.25;
              const dz = (b - a) * zStep;
              let v = a - dz;
              for (let zz = 0; zz < 4; zz++) {
                idx += 128;
                if ((v += dz) > 0) blocks[idx] = BlockIds.stone;
                else if (j * 8 + yy < seaLevel) blocks[idx] = BlockIds.waterStill;
                else blocks[idx] = 0;
              }
              a += ax;
              b += bx;
            }
            d000 += s000;
            d010 += s010;
            d100 += s100;
            d110 += s110;
          }
        }
      }
    }
  }

  replaceBlocksForBiome(cx: number, cz: number, blocks: Uint8Array, biomes: BiomeGenBase[]): void {
    const seaLevel = 63;
    const scale = 0.03125;
    const stone = (this.stoneNoise = this.noiseGen4.generateNoiseOctaves(this.stoneNoise, cx * 16, cz * 16, 0, 16, 16, 1, scale * 2, scale * 2, scale * 2));
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        const biome = biomes[x + z * 16];
        const temp = biome.getFloatTemperature();
        const depth = Math.trunc(stone[z + x * 16] / 3 + 3 + this.rand.nextDouble() * 0.25);
        let run = -1;
        let top = biome.topBlock;
        let filler = biome.fillerBlock;
        for (let y = 127; y >= 0; y--) {
          const idx = (x * 16 + z) * 128 + y;
          if (y <= 0 + this.rand.nextInt(5)) {
            blocks[idx] = BlockIds.bedrock;
            continue;
          }
          const id = blocks[idx];
          if (id === 0) {
            run = -1;
          } else if (id === BlockIds.stone) {
            if (run === -1) {
              if (depth <= 0) {
                top = 0;
                filler = BlockIds.stone;
              } else if (y >= seaLevel - 4 && y <= seaLevel + 1) {
                top = biome.topBlock;
                filler = biome.fillerBlock;
              }
              if (y < seaLevel && top === 0) top = temp < f(0.15) ? BlockIds.ice : BlockIds.waterStill;
              run = depth;
              blocks[idx] = y >= seaLevel - 1 ? top : filler;
            } else if (run > 0) {
              run--;
              blocks[idx] = filler;
              if (run === 0 && filler === BlockIds.sand) {
                run = this.rand.nextInt(4);
                filler = BlockIds.sandStone;
              }
            }
          }
        }
      }
    }
  }

  getAverageGroundLevel(): number {
    return 64;
  }

  /** findClosestStructure: the nearest stronghold's portal room (eyes of ender). */
  findClosestStructure(name: string, x: number, y: number, z: number): [number, number, number] | null {
    return name === 'Stronghold' ? this.strongholdGenerator.getNearestInstance(this, x, y, z) : null;
  }

  /** Whether (x, y, z) is inside a witch hut (getPossibleCreatures then spawns witches in swamps). */
  isInScatteredFeature(x: number, y: number, z: number): boolean {
    return this.scatteredFeatureGenerator.hasStructureAt(x, y, z);
  }

  /** provideChunk: terrain + surface for one chunk (no population). */
  provideChunk(cx: number, cz: number): GeneratedChunk {
    const out = this.provideTerrain(cx, cz);
    this.recordStructures(cx, cz);
    return out;
  }

  /** Terrain, surface, caves and ravines of one chunk. */
  provideTerrain(cx: number, cz: number): GeneratedChunk {
    this.rand.setSeed(BigInt(cx) * 341873128712n + BigInt(cz) * 132897987541n);
    const blocks = new Uint8Array(32768);
    this.generateTerrain(cx, cz, blocks);
    const biomes = this.biomeSource.loadBlockGeneratorData(cx * 16, cz * 16, 16, 16);
    this.replaceBlocksForBiome(cx, cz, blocks, biomes);
    this.caveGenerator.generate(this, cx, cz, blocks);
    this.ravineGenerator.generate(this, cx, cz, blocks);
    const ids = new Uint8Array(256);
    for (let i = 0; i < 256; i++) ids[i] = biomes[i].biomeID;
    return { blocks, biomes: ids };
  }

  /** The structure generators' part of provideChunk (it writes no blocks). */
  recordStructures(cx: number, cz: number): void {
    if (!this.mapFeaturesEnabled) return;
    this.mineshaftGenerator.generate(this, cx, cz, null);
    this.villageGenerator.generate(this, cx, cz, null);
    this.strongholdGenerator.generate(this, cx, cz, null);
    this.scatteredFeatureGenerator.generate(this, cx, cz, null);
  }

  private initializeNoiseField(out: Float64Array | null, x: number, y: number, z: number, sx: number, sy: number, sz: number): Float64Array {
    if (!out) out = new Float64Array(sx * sy * sz);
    if (!this.parabolicField) {
      this.parabolicField = new Float32Array(25);
      for (let i = -2; i <= 2; i++) {
        for (let k = -2; k <= 2; k++) {
          this.parabolicField[i + 2 + (k + 2) * 5] = f(10 / MathHelper.sqrt_float(f(i * i + k * k) + f(0.2)));
        }
      }
    }
    const xzScale = 684.412;
    const yScale = 684.412;
    this.noise5 = this.noiseGen5.generateNoiseOctaves2D(this.noise5, x, z, sx, sz, 1.121, 1.121, 0.5);
    this.noise6 = this.noiseGen6.generateNoiseOctaves2D(this.noise6, x, z, sx, sz, 200, 200, 0.5);
    this.noise3 = this.noiseGen3.generateNoiseOctaves(this.noise3, x, y, z, sx, sy, sz, xzScale / 80, yScale / 160, xzScale / 80);
    this.noise1 = this.noiseGen1.generateNoiseOctaves(this.noise1, x, y, z, sx, sy, sz, xzScale, yScale, xzScale);
    this.noise2 = this.noiseGen2.generateNoiseOctaves(this.noise2, x, y, z, sx, sy, sz, xzScale, yScale, xzScale);
    let idx = 0;
    let idx2 = 0;
    const pf = this.parabolicField;
    const bg = this.biomesForGeneration;
    for (let i = 0; i < sx; i++) {
      for (let k = 0; k < sz; k++) {
        let maxH = 0;
        let minH = 0;
        let total = 0;
        const centre = bg[i + 2 + (k + 2) * (sx + 5)];
        for (let a = -2; a <= 2; a++) {
          for (let b = -2; b <= 2; b++) {
            const bio = bg[i + a + 2 + (k + b + 2) * (sx + 5)];
            let wgt = f(pf[a + 2 + (b + 2) * 5] / f(bio.minHeight + 2));
            if (bio.minHeight > centre.minHeight) wgt = f(wgt / 2);
            maxH = f(maxH + f(bio.maxHeight * wgt));
            minH = f(minH + f(bio.minHeight * wgt));
            total = f(total + wgt);
          }
        }
        maxH = f(maxH / total);
        minH = f(minH / total);
        maxH = f(f(maxH * f(0.9)) + f(0.1));
        minH = f(f(f(minH * 4) - 1) / 8);
        let rough = this.noise6[idx2] / 8000;
        if (rough < 0) rough = -rough * 0.3;
        rough = rough * 3 - 2;
        if (rough < 0) {
          rough /= 2;
          if (rough < -1) rough = -1;
          rough /= 1.4;
          rough /= 2;
        } else {
          if (rough > 1) rough = 1;
          rough /= 8;
        }
        idx2++;
        for (let j = 0; j < sy; j++) {
          let base = minH;
          const height = maxH;
          base += rough * 0.2;
          base = (base * sy) / 16;
          const mid = sy / 2 + base * 4;
          let v = 0;
          let falloff = ((j - mid) * 12 * 128) / 128 / height;
          if (falloff < 0) falloff *= 4;
          const lo = this.noise1[idx] / 512;
          const hi = this.noise2[idx] / 512;
          const sel = (this.noise3[idx] / 10 + 1) / 2;
          if (sel < 0) v = lo;
          else if (sel > 1) v = hi;
          else v = lo + (hi - lo) * sel;
          v -= falloff;
          if (j > sy - 4) {
            const t = f(f(j - (sy - 4)) / 3);
            v = v * (1 - t) + -10 * t;
          }
          out[idx] = v;
          idx++;
        }
      }
    }
    return out;
  }

  /** populate: lakes and biome decoration for chunk (cx, cz), offset +8 like the original. */
  populate(world: IWorld, cx: number, cz: number): void {
    BlockSand.fallInstantly = true;
    let x = cx * 16;
    let z = cz * 16;
    const biome = world.getBiomeGenForCoords(x + 16, z + 16);
    this.rand.setSeed(this.seed);
    const a = (this.rand.nextLong() / 2n) * 2n + 1n;
    const b = (this.rand.nextLong() / 2n) * 2n + 1n;
    this.rand.setSeed((BigInt(cx) * a + BigInt(cz) * b) ^ this.seed);
    let village = false;
    if (this.mapFeaturesEnabled) {
      this.mineshaftGenerator.generateStructuresInChunk(world, this.rand, cx, cz);
      village = this.villageGenerator.generateStructuresInChunk(world, this.rand, cx, cz);
      this.strongholdGenerator.generateStructuresInChunk(world, this.rand, cx, cz);
      this.scatteredFeatureGenerator.generateStructuresInChunk(world, this.rand, cx, cz);
    }
    if (!village && this.rand.nextInt(4) === 0) {
      const lx = x + this.rand.nextInt(16) + 8;
      const ly = this.rand.nextInt(128);
      const lz = z + this.rand.nextInt(16) + 8;
      new WorldGenLakes(BlockIds.waterStill).generate(world, this.rand, lx, ly, lz);
    }
    if (!village && this.rand.nextInt(8) === 0) {
      const lx = x + this.rand.nextInt(16) + 8;
      const ly = this.rand.nextInt(this.rand.nextInt(120) + 8);
      const lz = z + this.rand.nextInt(16) + 8;
      if (ly < 63 || this.rand.nextInt(10) === 0) new WorldGenLakes(BlockIds.lavaStill).generate(world, this.rand, lx, ly, lz);
    }
    for (let i = 0; i < 8; i++) {
      const dx = x + this.rand.nextInt(16) + 8;
      const dy = this.rand.nextInt(128);
      const dz = z + this.rand.nextInt(16) + 8;
      new WorldGenDungeons().generate(world, this.rand, dx, dy, dz);
    }
    this.decoration.decorate(biome, world, this.rand, x, z);
    if ('recordSpawn' in world) performWorldGenSpawning(world as IWorld & SpawnRecorder, biome, x + 8, z + 8, 16, 16, this.rand);
    x += 8;
    z += 8;
    for (let i = 0; i < 16; i++) {
      for (let k = 0; k < 16; k++) {
        const y = world.getPrecipitationHeight(x + i, z + k);
        if (world.isBlockFreezable(i + x, y - 1, k + z)) world.setBlock(i + x, y - 1, k + z, BlockIds.ice, 0, 2);
        if (world.canSnowAt(i + x, y, k + z)) world.setBlock(i + x, y, k + z, BlockIds.snow, 0, 2);
      }
    }
    BlockSand.fallInstantly = false;
  }
}
