import type { JavaRandom } from '../../core/JavaRandom';

/** Improved Perlin noise with the original's permutation shuffle and sampling quirks. */
export class NoiseGeneratorPerlin {
  private readonly permutations = new Int32Array(512);
  readonly xCoord: number;
  readonly yCoord: number;
  readonly zCoord: number;

  constructor(rand: JavaRandom) {
    this.xCoord = rand.nextDouble() * 256;
    this.yCoord = rand.nextDouble() * 256;
    this.zCoord = rand.nextDouble() * 256;
    const p = this.permutations;
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 0; i < 256; i++) {
      const j = rand.nextInt(256 - i) + i;
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
      p[i + 256] = p[i];
    }
  }

  private static lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  /** func_76309_a: the 2D gradient used by the single-row (y size 1) path. */
  private static grad2(hash: number, x: number, z: number): number {
    const h = hash & 15;
    const u = (1 - ((h & 8) >> 3)) * x;
    const v = h < 4 ? 0 : h !== 12 && h !== 14 ? z : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  private static grad(hash: number, x: number, y: number, z: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h !== 12 && h !== 14 ? z : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  populateNoiseArray(
    out: Float64Array,
    x0: number,
    y0: number,
    z0: number,
    sx: number,
    sy: number,
    sz: number,
    scaleX: number,
    scaleY: number,
    scaleZ: number,
    amplitude: number,
  ): void {
    const p = this.permutations;
    const lerp = NoiseGeneratorPerlin.lerp;
    const grad = NoiseGeneratorPerlin.grad;
    const inv = 1 / amplitude;
    if (sy === 1) {
      let idx = 0;
      for (let i = 0; i < sx; i++) {
        let x = x0 + i * scaleX + this.xCoord;
        let xi = Math.trunc(x);
        if (x < xi) xi--;
        const X = xi & 255;
        x -= xi;
        const fx = x * x * x * (x * (x * 6 - 15) + 10);
        for (let k = 0; k < sz; k++) {
          let z = z0 + k * scaleZ + this.zCoord;
          let zi = Math.trunc(z);
          if (z < zi) zi--;
          const Z = zi & 255;
          z -= zi;
          const fz = z * z * z * (z * (z * 6 - 15) + 10);
          const a = p[X] + 0;
          const aa = p[a] + Z;
          const b = p[X + 1] + 0;
          const ba = p[b] + Z;
          const l1 = lerp(fx, NoiseGeneratorPerlin.grad2(p[aa], x, z), grad(p[ba], x - 1, 0, z));
          const l2 = lerp(fx, grad(p[aa + 1], x, 0, z - 1), grad(p[ba + 1], x - 1, 0, z - 1));
          out[idx++] += lerp(fz, l1, l2) * inv;
        }
      }
      return;
    }
    let idx = 0;
    let lastY = -1;
    let l1 = 0;
    let l2 = 0;
    let l3 = 0;
    let l4 = 0;
    for (let i = 0; i < sx; i++) {
      let x = x0 + i * scaleX + this.xCoord;
      let xi = Math.trunc(x);
      if (x < xi) xi--;
      const X = xi & 255;
      x -= xi;
      const fx = x * x * x * (x * (x * 6 - 15) + 10);
      for (let k = 0; k < sz; k++) {
        let z = z0 + k * scaleZ + this.zCoord;
        let zi = Math.trunc(z);
        if (z < zi) zi--;
        const Z = zi & 255;
        z -= zi;
        const fz = z * z * z * (z * (z * 6 - 15) + 10);
        for (let j = 0; j < sy; j++) {
          let y = y0 + j * scaleY + this.yCoord;
          let yi = Math.trunc(y);
          if (y < yi) yi--;
          const Y = yi & 255;
          y -= yi;
          const fy = y * y * y * (y * (y * 6 - 15) + 10);
          if (j === 0 || Y !== lastY) {
            lastY = Y;
            const a = p[X] + Y;
            const aa = p[a] + Z;
            const ab = p[a + 1] + Z;
            const b = p[X + 1] + Y;
            const ba = p[b] + Z;
            const bb = p[b + 1] + Z;
            l1 = lerp(fx, grad(p[aa], x, y, z), grad(p[ba], x - 1, y, z));
            l2 = lerp(fx, grad(p[ab], x, y - 1, z), grad(p[bb], x - 1, y - 1, z));
            l3 = lerp(fx, grad(p[aa + 1], x, y, z - 1), grad(p[ba + 1], x - 1, y, z - 1));
            l4 = lerp(fx, grad(p[ab + 1], x, y - 1, z - 1), grad(p[bb + 1], x - 1, y - 1, z - 1));
          }
          const m1 = lerp(fy, l1, l2);
          const m2 = lerp(fy, l3, l4);
          out[idx++] += lerp(fz, m1, m2) * inv;
        }
      }
    }
  }
}
