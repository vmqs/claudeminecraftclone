import { BlockIds } from '../../../block/BlockIds';
import { BlockSand } from '../../../block/BlockSand';
import { JavaRandom } from '../../../core/JavaRandom';
import { Biomes } from '../../biome/BiomeGenBase';
import { EnumCreatureType, type SpawnListEntry } from '../../biome/SpawnListEntry';
import type { IWorld } from '../../IWorld';
import type { ChunkGenerator, GeneratedChunk } from '../ChunkProviderGenerate';
import { SingleBiomeSource } from '../ChunkProviderFlat';
import type { DimensionGeneratorOptions } from '../DimensionGenerators';
import { NoiseGeneratorOctaves } from '../NoiseGeneratorOctaves';
import { WorldGenFlowers } from '../WorldGenFlowers';
import { WorldGenMinable } from '../WorldGenMinable';
import { MapGenCavesHell } from './MapGenCavesHell';
import { MapGenNetherBridge } from './MapGenNetherBridge';
import { WorldGenFire, WorldGenGlowStone1, WorldGenGlowStone2, WorldGenHellLava } from './NetherFeatures';

/** Height of the lava sea: everything open below y = 32 is still lava. */
const LAVA_LEVEL = 32;
/** The level around which the soul sand and gravel shores are laid (ChunkProviderHell's 64). */
const SHORE_LEVEL = 64;

/**
 * The Nether generator ("HellRandomLevelSource", ChunkProviderHell): 128 blocks of netherrack
 * shaped by 3D density noise that is pulled solid towards the floor and the roof, a lava sea
 * up to y = 31, bedrock floor and ceiling with ragged edges, soul sand and gravel shores around
 * y = 60-65, tunnels, and fortresses; population adds lava springs, fire, glowstone,
 * mushrooms, nether quartz and hidden lava. Terrain is a pure function of the seed and the
 * chunk position, like the overworld's.
 */
export class ChunkProviderHell implements ChunkGenerator {
  /** The original's hellRNG: seeds the noise generators, then is reseeded for every chunk. */
  private readonly hellRNG: JavaRandom;
  /** The random of population (see seedPopulateRandom). */
  private readonly populateRNG = new JavaRandom(0n);
  private readonly netherNoiseGen1: NoiseGeneratorOctaves;
  private readonly netherNoiseGen2: NoiseGeneratorOctaves;
  private readonly netherNoiseGen3: NoiseGeneratorOctaves;
  private readonly slowsandGravelNoiseGen: NoiseGeneratorOctaves;
  private readonly netherrackExclusivityNoiseGen: NoiseGeneratorOctaves;
  readonly netherNoiseGen6: NoiseGeneratorOctaves;
  readonly netherNoiseGen7: NoiseGeneratorOctaves;
  private noiseField: Float64Array | null = null;
  private slowsandNoise: Float64Array | null = null;
  private gravelNoise: Float64Array | null = null;
  private netherrackExclusivityNoise: Float64Array | null = null;
  private noiseData1: Float64Array | null = null;
  private noiseData2: Float64Array | null = null;
  private noiseData3: Float64Array | null = null;
  /** The density bias per noise row: a wave with three peaks, pushed solid near the floor and roof. */
  private readonly heightBias = new Float64Array(17);
  private readonly caveGenerator = new MapGenCavesHell();
  readonly genNetherBridge = new MapGenNetherBridge();
  readonly biomeSource = new SingleBiomeSource(Biomes.hell);

  /** The world's options are accepted like every dimension's; fortresses generate even without "Generate Structures" in 1.5.2. */
  constructor(
    readonly seed: bigint,
    _options?: Partial<DimensionGeneratorOptions>,
  ) {
    this.hellRNG = new JavaRandom(seed);
    this.netherNoiseGen1 = new NoiseGeneratorOctaves(this.hellRNG, 16);
    this.netherNoiseGen2 = new NoiseGeneratorOctaves(this.hellRNG, 16);
    this.netherNoiseGen3 = new NoiseGeneratorOctaves(this.hellRNG, 8);
    this.slowsandGravelNoiseGen = new NoiseGeneratorOctaves(this.hellRNG, 4);
    this.netherrackExclusivityNoiseGen = new NoiseGeneratorOctaves(this.hellRNG, 4);
    this.netherNoiseGen6 = new NoiseGeneratorOctaves(this.hellRNG, 10);
    this.netherNoiseGen7 = new NoiseGeneratorOctaves(this.hellRNG, 16);
    const rows = this.heightBias.length;
    for (let j = 0; j < rows; j++) {
      let b = Math.cos((j * Math.PI * 6) / rows) * 2;
      let edge = j;
      if (j > rows / 2) edge = rows - 1 - j;
      if (edge < 4) {
        edge = 4 - edge;
        b -= edge * edge * edge * 10;
      }
      this.heightBias[j] = b;
    }
  }

  /** generateNetherTerrain: netherrack where the interpolated density is positive, lava below y = 32. */
  generateNetherTerrain(cx: number, cz: number, blocks: Uint8Array): void {
    const cells = 4;
    const sizeX = cells + 1;
    const sizeY = 17;
    const sizeZ = cells + 1;
    const n = (this.noiseField = this.initializeNoiseField(this.noiseField, cx * cells, 0, cz * cells, sizeX, sizeY, sizeZ));
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
            const y = j * 8 + yy;
            for (let xx = 0; xx < 4; xx++) {
              let idx = ((xx + i * 4) << 11) | ((k * 4) << 7) | y;
              const dz = (b - a) * 0.25;
              let v = a;
              for (let zz = 0; zz < 4; zz++) {
                let id = y < LAVA_LEVEL ? BlockIds.lavaStill : 0;
                if (v > 0) id = BlockIds.netherrack;
                blocks[idx] = id;
                idx += 128;
                v += dz;
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

  /**
   * replaceBlocksForBiome: the bedrock floor (y 0-4) and ceiling (y 123-127), and the top few
   * netherrack blocks of every column near the shore level replaced by soul sand or gravel
   * where their noise is positive (or removed, letting lava in, where the depth noise is low).
   */
  replaceBlocksForBiome(cx: number, cz: number, blocks: Uint8Array): void {
    const scale = 0.03125;
    const rand = this.hellRNG;
    const rack = BlockIds.netherrack;
    const soul = (this.slowsandNoise = this.slowsandGravelNoiseGen.generateNoiseOctaves(this.slowsandNoise, cx * 16, cz * 16, 0, 16, 16, 1, scale, scale, 1));
    const gravel = (this.gravelNoise = this.slowsandGravelNoiseGen.generateNoiseOctaves(this.gravelNoise, cx * 16, 109, cz * 16, 16, 1, 16, scale, 1, scale));
    const depthNoise = (this.netherrackExclusivityNoise = this.netherrackExclusivityNoiseGen.generateNoiseOctaves(
      this.netherrackExclusivityNoise,
      cx * 16,
      cz * 16,
      0,
      16,
      16,
      1,
      scale * 2,
      scale * 2,
      scale * 2,
    ));
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        const isSoul = soul[z + x * 16] + rand.nextDouble() * 0.2 > 0;
        const isGravel = gravel[z + x * 16] + rand.nextDouble() * 0.2 > 0;
        const depth = Math.trunc(depthNoise[z + x * 16] / 3 + 3 + rand.nextDouble() * 0.25);
        let run = -1;
        let top: number = rack;
        let filler: number = rack;
        for (let y = 127; y >= 0; y--) {
          const idx = (x * 16 + z) * 128 + y;
          // Ragged bedrock: the floor's number is only drawn when the ceiling test passes.
          if (!(y < 127 - rand.nextInt(5) && y > rand.nextInt(5))) {
            blocks[idx] = BlockIds.bedrock;
            continue;
          }
          const id = blocks[idx];
          if (id === 0) {
            run = -1;
          } else if (id === rack) {
            if (run === -1) {
              if (depth <= 0) {
                top = 0;
                filler = rack;
              } else if (y >= SHORE_LEVEL - 4 && y <= SHORE_LEVEL + 1) {
                top = rack;
                filler = rack;
                if (isGravel) top = BlockIds.gravel;
                if (isGravel) filler = rack;
                if (isSoul) top = BlockIds.slowSand;
                if (isSoul) filler = BlockIds.slowSand;
              }
              if (y < SHORE_LEVEL && top === 0) top = BlockIds.lavaStill;
              run = depth;
              blocks[idx] = y >= SHORE_LEVEL - 1 ? top : filler;
            } else if (run > 0) {
              run--;
              blocks[idx] = filler;
            }
          }
        }
      }
    }
  }

  /**
   * initializeNoiseField: the density at every 4x8x4 cell corner, a blend of two 3D noises
   * selected by a third, minus the height bias, faded to solid over the top three rows. (The
   * original also samples netherNoiseGen6 and 7 here, but their values never reach the density.)
   */
  private initializeNoiseField(out: Float64Array | null, x: number, y: number, z: number, sx: number, sy: number, sz: number): Float64Array {
    if (!out) out = new Float64Array(sx * sy * sz);
    const xzScale = 684.412;
    const yScale = 2053.236;
    const sel = (this.noiseData1 = this.netherNoiseGen3.generateNoiseOctaves(this.noiseData1, x, y, z, sx, sy, sz, xzScale / 80, yScale / 60, xzScale / 80));
    const low = (this.noiseData2 = this.netherNoiseGen1.generateNoiseOctaves(this.noiseData2, x, y, z, sx, sy, sz, xzScale, yScale, xzScale));
    const high = (this.noiseData3 = this.netherNoiseGen2.generateNoiseOctaves(this.noiseData3, x, y, z, sx, sy, sz, xzScale, yScale, xzScale));
    const bias = this.heightBias;
    let idx = 0;
    for (let i = 0; i < sx; i++) {
      for (let k = 0; k < sz; k++) {
        for (let j = 0; j < sy; j++) {
          const lo = low[idx] / 512;
          const hi = high[idx] / 512;
          const t = (sel[idx] / 10 + 1) / 2;
          let v: number;
          if (t < 0) v = lo;
          else if (t > 1) v = hi;
          else v = lo + (hi - lo) * t;
          v -= bias[j];
          if (j > sy - 4) {
            const fade = Math.fround(Math.fround(j - (sy - 4)) / 3);
            v = v * (1 - fade) + -10 * fade;
          }
          out[idx] = v;
          idx++;
        }
      }
    }
    return out;
  }

  /** provideChunk: terrain, surface, tunnels; and the fortress starts around the chunk. */
  provideChunk(cx: number, cz: number): GeneratedChunk {
    const out = this.provideTerrain(cx, cz);
    this.recordStructures(cx, cz);
    return out;
  }

  /** The block part of provideChunk (a pure function of the seed and position). */
  provideTerrain(cx: number, cz: number): GeneratedChunk {
    this.hellRNG.setSeed(BigInt(cx) * 341873128712n + BigInt(cz) * 132897987541n);
    const blocks = new Uint8Array(32768);
    this.generateNetherTerrain(cx, cz, blocks);
    this.replaceBlocksForBiome(cx, cz, blocks);
    this.caveGenerator.generate(this, cx, cz, blocks);
    const biomes = new Uint8Array(256).fill(Biomes.hell.biomeID);
    return { blocks, biomes };
  }

  /** The fortress generator's part of provideChunk (it writes no blocks). */
  recordStructures(cx: number, cz: number): void {
    this.genNetherBridge.generate(this, cx, cz, null);
  }

  /** populate: fortresses, then the Nether's features, for the area (cx*16+8 .. cx*16+23). */
  populate(world: IWorld, cx: number, cz: number): void {
    BlockSand.fallInstantly = true;
    const rand = this.seedPopulateRandom(cx, cz);
    const x = cx * 16;
    const z = cz * 16;
    this.genNetherBridge.generateStructuresInChunk(world, rand, cx, cz);
    const openLava = new WorldGenHellLava(BlockIds.lavaMoving, false);
    for (let i = 0; i < 8; i++) {
      const px = x + rand.nextInt(16) + 8;
      const py = rand.nextInt(120) + 4;
      const pz = z + rand.nextInt(16) + 8;
      openLava.generate(world, rand, px, py, pz);
    }
    let n = rand.nextInt(rand.nextInt(10) + 1) + 1;
    const fire = new WorldGenFire();
    for (let i = 0; i < n; i++) {
      const px = x + rand.nextInt(16) + 8;
      const py = rand.nextInt(120) + 4;
      const pz = z + rand.nextInt(16) + 8;
      fire.generate(world, rand, px, py, pz);
    }
    n = rand.nextInt(rand.nextInt(10) + 1);
    const glow1 = new WorldGenGlowStone1();
    for (let i = 0; i < n; i++) {
      const px = x + rand.nextInt(16) + 8;
      const py = rand.nextInt(120) + 4;
      const pz = z + rand.nextInt(16) + 8;
      glow1.generate(world, rand, px, py, pz);
    }
    const glow2 = new WorldGenGlowStone2();
    for (let i = 0; i < 10; i++) {
      const px = x + rand.nextInt(16) + 8;
      const py = rand.nextInt(128);
      const pz = z + rand.nextInt(16) + 8;
      glow2.generate(world, rand, px, py, pz);
    }
    for (const mushroom of [BlockIds.mushroomBrown, BlockIds.mushroomRed]) {
      // nextInt(1) is always 0, but it still advances the random.
      if (rand.nextInt(1) === 0) {
        const px = x + rand.nextInt(16) + 8;
        const py = rand.nextInt(128);
        const pz = z + rand.nextInt(16) + 8;
        new WorldGenFlowers(mushroom).generate(world, rand, px, py, pz);
      }
    }
    const quartz = new WorldGenMinable(BlockIds.oreNetherQuartz, 13, BlockIds.netherrack);
    for (let i = 0; i < 16; i++) {
      const px = x + rand.nextInt(16);
      const py = rand.nextInt(108) + 10;
      const pz = z + rand.nextInt(16);
      quartz.generate(world, rand, px, py, pz);
    }
    const hiddenLava = new WorldGenHellLava(BlockIds.lavaMoving, true);
    for (let i = 0; i < 16; i++) {
      const px = x + rand.nextInt(16);
      const py = rand.nextInt(108) + 10;
      const pz = z + rand.nextInt(16);
      hiddenLava.generate(world, rand, px, py, pz);
    }
    BlockSand.fallInstantly = false;
  }

  /**
   * ChunkProviderHell.populate does not reseed its random: it goes on with hellRNG as the last
   * generated chunk left it, so in 1.5.2 the Nether's decoration depends on the order the server
   * happened to load chunks in. Here every population starts from the state the server has
   * when (cx, cz) was the last chunk of its 2x2 group to be generated and is populated at once
   * (the chunk's seed, then the draws its surface pass makes, which do not depend on the
   * blocks), so the decoration is the same however the chunks are generated.
   */
  private seedPopulateRandom(cx: number, cz: number): JavaRandom {
    const r = this.populateRNG;
    r.setSeed(BigInt(cx) * 341873128712n + BigInt(cz) * 132897987541n);
    for (let column = 0; column < 256; column++) {
      r.nextDouble();
      r.nextDouble();
      r.nextDouble();
      for (let y = 127; y >= 0; y--) if (y < 127 - r.nextInt(5)) r.nextInt(5);
    }
    return r;
  }

  getAverageGroundLevel(): number {
    return 64;
  }

  /** getPossibleCreatures: the fortress list for monsters inside a fortress piece, else the Hell biome's. */
  getPossibleCreatures(type: EnumCreatureType, x: number, y: number, z: number): readonly SpawnListEntry[] {
    if (type === EnumCreatureType.monster && this.genNetherBridge.isInFortress(this, x, y, z)) return this.genNetherBridge.spawnList;
    return Biomes.hell.getSpawnableList(type);
  }
}

