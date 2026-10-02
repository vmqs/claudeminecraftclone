import { JavaRandom } from '../../core/JavaRandom';
import { MathHelper } from '../../core/MathHelper';
import { MapGenCaves } from './MapGenCaves';

const f = Math.fround;
const PI_F = f(Math.PI);

/** MapGenRavine: rare, tall and narrow canyons (1 in 50 chunks start one). */
export class MapGenRavine extends MapGenCaves {
  /** field_75046_d: per-height widening factor of the canyon walls. */
  private readonly shape = new Float32Array(1024);

  protected generateRavine(
    seed: bigint,
    cx: number,
    cz: number,
    blocks: Uint8Array,
    x: number,
    y: number,
    z: number,
    width: number,
    yaw: number,
    pitch: number,
    step: number,
    maxSteps: number,
    vScale: number,
  ): void {
    const r = new JavaRandom(seed);
    const centerX = cx * 16 + 8;
    const centerZ = cz * 16 + 8;
    let dYaw = 0;
    let dPitch = 0;
    if (maxSteps <= 0) {
      const m = this.range * 16 - 16;
      maxSteps = m - r.nextInt(Math.trunc(m / 4));
    }
    let single = false;
    if (step === -1) {
      step = Math.trunc(maxSteps / 2);
      single = true;
    }
    let k = 1;
    for (let yy = 0; yy < 128; yy++) {
      if (yy === 0 || r.nextInt(3) === 0) k = f(1 + f(f(r.nextFloat() * r.nextFloat()) * 1));
      this.shape[yy] = f(k * k);
    }
    for (; step < maxSteps; step++) {
      let radH = 1.5 + f(MathHelper.sin(f(f(step * PI_F) / maxSteps)) * width);
      let radV = radH * vScale;
      radH *= r.nextFloat() * 0.25 + 0.75;
      radV *= r.nextFloat() * 0.25 + 0.75;
      const cosP = MathHelper.cos(pitch);
      const sinP = MathHelper.sin(pitch);
      x += f(MathHelper.cos(yaw) * cosP);
      y += sinP;
      z += f(MathHelper.sin(yaw) * cosP);
      pitch = f(pitch * f(0.7));
      pitch = f(pitch + f(dPitch * f(0.05)));
      yaw = f(yaw + f(dYaw * f(0.05)));
      dPitch = f(dPitch * f(0.8));
      dYaw = f(dYaw * f(0.5));
      dPitch = f(dPitch + f(f(f(r.nextFloat() - r.nextFloat()) * r.nextFloat()) * 2));
      dYaw = f(dYaw + f(f(f(r.nextFloat() - r.nextFloat()) * r.nextFloat()) * 4));
      if (!single && r.nextInt(4) === 0) continue;
      const dx = x - centerX;
      const dz = z - centerZ;
      const rem = maxSteps - step;
      const maxR = f(f(width + 2) + 16);
      if (dx * dx + dz * dz - rem * rem > maxR * maxR) return;
      if (x < centerX - 16 - radH * 2 || z < centerZ - 16 - radH * 2 || x > centerX + 16 + radH * 2 || z > centerZ + 16 + radH * 2) continue;
      if (this.carve(cx, cz, blocks, x, y, z, radH, radV, true, this.shape) && single) break;
    }
  }

  protected override recursiveGenerate(x: number, z: number, cx: number, cz: number, blocks: Uint8Array | null): void {
    if (!blocks) return;
    const rand = this.rand;
    if (rand.nextInt(50) !== 0) return;
    const px = x * 16 + rand.nextInt(16);
    const py = rand.nextInt(rand.nextInt(40) + 8) + 20;
    const pz = z * 16 + rand.nextInt(16);
    const yaw = f(f(rand.nextFloat() * PI_F) * 2);
    const pitch = f(f(f(rand.nextFloat() - 0.5) * 2) / 8);
    const width = f(f(f(rand.nextFloat() * 2) + rand.nextFloat()) * 2);
    this.generateRavine(rand.nextLong(), cx, cz, blocks, px, py, pz, width, yaw, pitch, 0, 0, 3);
  }
}
