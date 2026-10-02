import { BlockIds } from '../../block/BlockIds';
import { JavaRandom } from '../../core/JavaRandom';
import { MathHelper } from '../../core/MathHelper';
import { MapGenBase } from './MapGenBase';

const f = Math.fround;
const PI_F = f(Math.PI);
const HALF_PI_F = f(Math.PI / 2);

/**
 * MapGenCaves: worm tunnels and round rooms carved into the raw terrain. A tunnel is walked
 * from its start chunk and carves only the part inside the chunk being generated. Below y = 10
 * the carved space fills with lava; tunnels stop at water. The carve is applied one block above
 * the tested position, exactly like the original.
 */
export class MapGenCaves extends MapGenBase {
  protected generateLargeCaveNode(seed: bigint, cx: number, cz: number, blocks: Uint8Array, x: number, y: number, z: number): void {
    this.generateCaveNode(seed, cx, cz, blocks, x, y, z, f(1 + f(this.rand.nextFloat() * 6)), 0, 0, -1, -1, 0.5);
  }

  protected generateCaveNode(
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
    const centerX = cx * 16 + 8;
    const centerZ = cz * 16 + 8;
    let dYaw = 0;
    let dPitch = 0;
    const r = new JavaRandom(seed);
    if (maxSteps <= 0) {
      const m = this.range * 16 - 16;
      maxSteps = m - r.nextInt(Math.trunc(m / 4));
    }
    let room = false;
    if (step === -1) {
      step = Math.trunc(maxSteps / 2);
      room = true;
    }
    const branchAt = r.nextInt(Math.trunc(maxSteps / 2)) + Math.trunc(maxSteps / 4);
    const steep = r.nextInt(6) === 0;
    for (; step < maxSteps; step++) {
      const radH = 1.5 + f(MathHelper.sin(f(f(step * PI_F) / maxSteps)) * width);
      const radV = radH * vScale;
      const cosP = MathHelper.cos(pitch);
      const sinP = MathHelper.sin(pitch);
      x += f(MathHelper.cos(yaw) * cosP);
      y += sinP;
      z += f(MathHelper.sin(yaw) * cosP);
      pitch = steep ? f(pitch * f(0.92)) : f(pitch * f(0.7));
      pitch = f(pitch + f(dPitch * f(0.1)));
      yaw = f(yaw + f(dYaw * f(0.1)));
      dPitch = f(dPitch * f(0.9));
      dYaw = f(dYaw * f(0.75));
      dPitch = f(dPitch + f(f(f(r.nextFloat() - r.nextFloat()) * r.nextFloat()) * 2));
      dYaw = f(dYaw + f(f(f(r.nextFloat() - r.nextFloat()) * r.nextFloat()) * 4));
      if (!room && step === branchAt && width > 1 && maxSteps > 0) {
        this.generateCaveNode(r.nextLong(), cx, cz, blocks, x, y, z, f(f(r.nextFloat() * 0.5) + 0.5), f(yaw - HALF_PI_F), f(pitch / 3), step, maxSteps, 1);
        this.generateCaveNode(r.nextLong(), cx, cz, blocks, x, y, z, f(f(r.nextFloat() * 0.5) + 0.5), f(yaw + HALF_PI_F), f(pitch / 3), step, maxSteps, 1);
        return;
      }
      if (!room && r.nextInt(4) === 0) continue;
      const dx = x - centerX;
      const dz = z - centerZ;
      const rem = maxSteps - step;
      const maxR = f(f(width + 2) + 16);
      if (dx * dx + dz * dz - rem * rem > maxR * maxR) return;
      if (x < centerX - 16 - radH * 2 || z < centerZ - 16 - radH * 2 || x > centerX + 16 + radH * 2 || z > centerZ + 16 + radH * 2) continue;
      if (this.carve(cx, cz, blocks, x, y, z, radH, radV, false) && room) break;
    }
  }

  /** Clears the ellipsoid (unless it touches water); returns whether it carved. */
  protected carve(cx: number, cz: number, blocks: Uint8Array, x: number, y: number, z: number, radH: number, radV: number, ravine: boolean, shape?: Float32Array): boolean {
    let minX = MathHelper.floor_double(x - radH) - cx * 16 - 1;
    let maxX = MathHelper.floor_double(x + radH) - cx * 16 + 1;
    let minY = MathHelper.floor_double(y - radV) - 1;
    let maxY = MathHelper.floor_double(y + radV) + 1;
    let minZ = MathHelper.floor_double(z - radH) - cz * 16 - 1;
    let maxZ = MathHelper.floor_double(z + radH) - cz * 16 + 1;
    if (minX < 0) minX = 0;
    if (maxX > 16) maxX = 16;
    if (minY < 1) minY = 1;
    if (maxY > 120) maxY = 120;
    if (minZ < 0) minZ = 0;
    if (maxZ > 16) maxZ = 16;
    const water1 = BlockIds.waterMoving;
    const water2 = BlockIds.waterStill;
    for (let xx = minX; xx < maxX; xx++) {
      for (let zz = minZ; zz < maxZ; zz++) {
        for (let yy = maxY + 1; yy >= minY - 1; yy--) {
          if (yy < 0 || yy >= 128) continue;
          const id = blocks[(xx * 16 + zz) * 128 + yy];
          if (id === water1 || id === water2) return false;
          if (yy !== minY - 1 && xx !== minX && xx !== maxX - 1 && zz !== minZ && zz !== maxZ - 1) yy = minY;
        }
      }
    }
    const stone = BlockIds.stone;
    const dirt = BlockIds.dirt;
    const grass = BlockIds.grass;
    for (let xx = minX; xx < maxX; xx++) {
      const nx = (xx + cx * 16 + 0.5 - x) / radH;
      for (let zz = minZ; zz < maxZ; zz++) {
        const nz = (zz + cz * 16 + 0.5 - z) / radH;
        let idx = (xx * 16 + zz) * 128 + maxY;
        let hitGrass = false;
        if (nx * nx + nz * nz < 1) {
          for (let yy = maxY - 1; yy >= minY; yy--) {
            const ny = (yy + 0.5 - y) / radV;
            const inside = ravine ? (nx * nx + nz * nz) * shape![yy] + (ny * ny) / 6 < 1 : ny > -0.7 && nx * nx + ny * ny + nz * nz < 1;
            if (inside) {
              const id = blocks[idx];
              if (id === grass) hitGrass = true;
              if (id === stone || id === dirt || id === grass) {
                if (yy < 10) {
                  blocks[idx] = BlockIds.lavaMoving;
                } else {
                  blocks[idx] = 0;
                  if (hitGrass && blocks[idx - 1] === dirt) blocks[idx - 1] = this.ctx.biomeSource.getBiomeGenAt(xx + cx * 16, zz + cz * 16).topBlock;
                }
              }
            }
            idx--;
          }
        }
      }
    }
    return true;
  }

  protected recursiveGenerate(x: number, z: number, cx: number, cz: number, blocks: Uint8Array | null): void {
    if (!blocks) return;
    const rand = this.rand;
    let n = rand.nextInt(rand.nextInt(rand.nextInt(40) + 1) + 1);
    if (rand.nextInt(15) !== 0) n = 0;
    for (let i = 0; i < n; i++) {
      const px = x * 16 + rand.nextInt(16);
      const py = rand.nextInt(rand.nextInt(120) + 8);
      const pz = z * 16 + rand.nextInt(16);
      let tunnels = 1;
      if (rand.nextInt(4) === 0) {
        this.generateLargeCaveNode(rand.nextLong(), cx, cz, blocks, px, py, pz);
        tunnels += rand.nextInt(4);
      }
      for (let j = 0; j < tunnels; j++) {
        const yaw = f(f(rand.nextFloat() * PI_F) * 2);
        const pitch = f(f(f(rand.nextFloat() - 0.5) * 2) / 8);
        let width = f(f(rand.nextFloat() * 2) + rand.nextFloat());
        if (rand.nextInt(10) === 0) width = f(width * f(f(f(rand.nextFloat() * rand.nextFloat()) * 3) + 1));
        this.generateCaveNode(rand.nextLong(), cx, cz, blocks, px, py, pz, width, yaw, pitch, 0, 0, 1);
      }
    }
  }
}
