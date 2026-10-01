import type { JavaRandom } from '../../core/JavaRandom';
import { MathHelper } from '../../core/MathHelper';
import { NoiseGeneratorPerlin } from './NoiseGeneratorPerlin';

/** Sum of `octaves` Perlin layers with halving amplitude (NoiseGeneratorOctaves). */
export class NoiseGeneratorOctaves {
  private readonly generatorCollection: NoiseGeneratorPerlin[] = [];

  constructor(rand: JavaRandom, readonly octaves: number) {
    for (let i = 0; i < octaves; i++) this.generatorCollection.push(new NoiseGeneratorPerlin(rand));
  }

  generateNoiseOctaves(
    out: Float64Array | null,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    scaleX: number,
    scaleY: number,
    scaleZ: number,
  ): Float64Array {
    if (!out || out.length < sx * sy * sz) out = new Float64Array(sx * sy * sz);
    else out.fill(0);
    let amp = 1;
    for (let i = 0; i < this.octaves; i++) {
      let dx = x * amp * scaleX;
      const dy = y * amp * scaleY;
      let dz = z * amp * scaleZ;
      let lx = MathHelper.floor_double_long(dx);
      let lz = MathHelper.floor_double_long(dz);
      dx -= lx;
      dz -= lz;
      lx %= 16777216;
      lz %= 16777216;
      dx += lx;
      dz += lz;
      this.generatorCollection[i].populateNoiseArray(out, dx, dy, dz, sx, sy, sz, scaleX * amp, scaleY * amp, scaleZ * amp, amp);
      amp /= 2;
    }
    return out;
  }

  /** 2D form: y fixed at 10, one row. */
  generateNoiseOctaves2D(out: Float64Array | null, x: number, z: number, sx: number, sz: number, scaleX: number, scaleZ: number, _unused: number): Float64Array {
    return this.generateNoiseOctaves(out, x, 10, z, sx, 1, sz, scaleX, 1, scaleZ);
  }
}
