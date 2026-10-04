import { BlockIds } from '../../../block/BlockIds';
import { JavaRandom } from '../../../core/JavaRandom';
import { MathHelper } from '../../../core/MathHelper';
import { Biomes } from '../../biome/BiomeGenBase';
import type { IWorld } from '../../IWorld';
import { SingleBiomeSource } from '../ChunkProviderFlat';
import type { ChunkGenerator, GeneratedChunk } from '../ChunkProviderGenerate';
import { NoiseGeneratorOctaves } from '../NoiseGeneratorOctaves';
import { BiomeEndDecorator } from './BiomeEndDecorator';

const f = Math.fround;

/** Density grid of one chunk: 3 x 33 x 3 samples, 8 blocks apart horizontally and 4 vertically. */
const NX = 3;
const NY = 33;
const NZ = 3;

/**
 * The End's generator (ChunkProviderEnd): one island of end stone around (0, 0) carved by
 * 3D noise, with nothing below it, then the End decorator (obsidian spikes with ender crystals,
 * and the dragon when chunk (0, 0) is populated). Worker-safe.
 *
 * The original decorates with the world's own unseeded random (World.rand), so the spikes of
 * two End worlds with the same seed differ; `populateRand` plays that part here (pass a seeded
 * one for reproducible tests). Terrain is a pure function of the seed.
 */
export class ChunkProviderEnd implements ChunkGenerator {
  private readonly noiseGen1: NoiseGeneratorOctaves;
  private readonly noiseGen2: NoiseGeneratorOctaves;
  private readonly noiseGen3: NoiseGeneratorOctaves;
  /** Built for the random sequence; the original's samples of these two are never used. */
  readonly noiseGen4: NoiseGeneratorOctaves;
  readonly noiseGen5: NoiseGeneratorOctaves;
  private densities: Float64Array | null = null;
  private noiseData1: Float64Array | null = null;
  private noiseData2: Float64Array | null = null;
  private noiseData3: Float64Array | null = null;
  readonly biomeSource = new SingleBiomeSource(Biomes.sky);
  private readonly decorator = new BiomeEndDecorator();

  constructor(
    readonly seed: bigint,
    readonly populateRand: JavaRandom = new JavaRandom(),
  ) {
    const rand = new JavaRandom(seed);
    this.noiseGen1 = new NoiseGeneratorOctaves(rand, 16);
    this.noiseGen2 = new NoiseGeneratorOctaves(rand, 16);
    this.noiseGen3 = new NoiseGeneratorOctaves(rand, 8);
    this.noiseGen4 = new NoiseGeneratorOctaves(rand, 10);
    this.noiseGen5 = new NoiseGeneratorOctaves(rand, 16);
  }

  /** WorldProviderEnd.getAverageGroundLevel. */
  getAverageGroundLevel(): number {
    return 50;
  }

  /**
   * provideChunk: the noise terrain (all end stone). The original then runs a surface pass that
   * only rewrites stone, which this terrain never contains, so it changes nothing.
   */
  provideChunk(cx: number, cz: number): GeneratedChunk {
    const blocks = new Uint8Array(32768);
    this.generateTerrain(cx, cz, blocks);
    return { blocks, height: 128, biomes: new Uint8Array(256).fill(Biomes.sky.biomeID) };
  }

  /** generateTerrain: trilinear interpolation of the density grid; end stone where it is positive. */
  generateTerrain(cx: number, cz: number, out: Uint8Array): void {
    const d = (this.densities = this.initializeNoiseField(this.densities, cx * 2, 0, cz * 2, NX, NY, NZ));
    const stone = BlockIds.whiteStone;
    for (let gx = 0; gx < 2; gx++) {
      for (let gz = 0; gz < 2; gz++) {
        for (let gy = 0; gy < 32; gy++) {
          const yStep = 0.25;
          let d000 = d[((gx + 0) * NZ + gz + 0) * NY + gy];
          let d001 = d[((gx + 0) * NZ + gz + 1) * NY + gy];
          let d100 = d[((gx + 1) * NZ + gz + 0) * NY + gy];
          let d101 = d[((gx + 1) * NZ + gz + 1) * NY + gy];
          const dy000 = (d[((gx + 0) * NZ + gz + 0) * NY + gy + 1] - d000) * yStep;
          const dy001 = (d[((gx + 0) * NZ + gz + 1) * NY + gy + 1] - d001) * yStep;
          const dy100 = (d[((gx + 1) * NZ + gz + 0) * NY + gy + 1] - d100) * yStep;
          const dy101 = (d[((gx + 1) * NZ + gz + 1) * NY + gy + 1] - d101) * yStep;
          for (let sy = 0; sy < 4; sy++) {
            const xStep = 0.125;
            let a = d000;
            let b = d001;
            const da = (d100 - d000) * xStep;
            const db = (d101 - d001) * xStep;
            for (let sx = 0; sx < 8; sx++) {
              let idx = ((sx + gx * 8) << 11) | ((gz * 8) << 7) | (gy * 4 + sy);
              const zStep = 0.125;
              let v = a;
              const dv = (b - a) * zStep;
              for (let sz = 0; sz < 8; sz++) {
                out[idx] = v > 0 ? stone : 0;
                idx += 128;
                v += dv;
              }
              a += da;
              b += db;
            }
            d000 += dy000;
            d001 += dy001;
            d100 += dy100;
            d101 += dy101;
          }
        }
      }
    }
  }

  /**
   * initializeNoiseField: the overworld's blended 3D noise, lowered by distance from the
   * origin (100 - 8 * distance in grid cells, clamped to [-100, 80]) and faded to -3000 at the
   * top and to -30 at the bottom, so a single floating island remains. The original also
   * samples noiseGen4 and noiseGen5 (2D), but only into values it never uses.
   */
  private initializeNoiseField(arr: Float64Array | null, x: number, y: number, z: number, sx: number, sy: number, sz: number): Float64Array {
    if (!arr) arr = new Float64Array(sx * sy * sz);
    const scaleXZ = 684.412 * 2;
    const scaleY = 684.412;
    const n1 = (this.noiseData1 = this.noiseGen3.generateNoiseOctaves(this.noiseData1, x, y, z, sx, sy, sz, scaleXZ / 80, scaleY / 160, scaleXZ / 80));
    const n2 = (this.noiseData2 = this.noiseGen1.generateNoiseOctaves(this.noiseData2, x, y, z, sx, sy, sz, scaleXZ, scaleY, scaleXZ));
    const n3 = (this.noiseData3 = this.noiseGen2.generateNoiseOctaves(this.noiseData3, x, y, z, sx, sy, sz, scaleXZ, scaleY, scaleXZ));
    const half = (sy / 2) | 0;
    let i = 0;
    for (let ix = 0; ix < sx; ix++) {
      for (let iz = 0; iz < sz; iz++) {
        const fx = f(ix + x);
        const fz = f(iz + z);
        let island = f(100 - f(MathHelper.sqrt_float(f(f(fx * fx) + f(fz * fz))) * 8));
        if (island > 80) island = 80;
        if (island < -100) island = -100;
        for (let iy = 0; iy < sy; iy++) {
          let v: number;
          const lo = n2[i] / 512;
          const hi = n3[i] / 512;
          const mix = (n1[i] / 10 + 1) / 2;
          if (mix < 0) v = lo;
          else if (mix > 1) v = hi;
          else v = lo + (hi - lo) * mix;
          v -= 8;
          v += island;
          if (iy > half - 2) {
            let t = f(f(iy - (half - 2)) / 64);
            if (t < 0) t = 0;
            if (t > 1) t = 1;
            v = v * (1 - t) + -3000 * t;
          }
          if (iy < 8) {
            const t = f(f(8 - iy) / f(8 - 1));
            v = v * (1 - t) + -30 * t;
          }
          arr[i++] = v;
        }
      }
    }
    return arr;
  }

  /** populate: BiomeEndDecorator with the world-style random (see the class comment). */
  populate(world: IWorld, cx: number, cz: number): void {
    this.decorator.decorate(world, this.populateRand, cx * 16, cz * 16);
  }

  findClosestStructure(): [number, number, number] | null {
    return null;
  }
}
