import { BlockIds } from '../../block/BlockIds';
import type { JavaRandom } from '../../core/JavaRandom';
import { MathHelper } from '../../core/MathHelper';
import type { IWorld } from '../IWorld';
import { WorldGenerator } from './WorldGenerator';

const f = Math.fround;
const PI_F = f(Math.PI);

/** Ore/dirt/gravel blobs: a capsule of spheres replacing one target block. */
export class WorldGenMinable extends WorldGenerator {
  constructor(
    private readonly minableBlockId: number,
    private readonly numberOfBlocks: number,
    private readonly targetId: number = BlockIds.stone,
  ) {
    super();
  }

  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    const n = this.numberOfBlocks;
    const angle = f(rand.nextFloat() * PI_F);
    const sx = f(MathHelper.sin(angle) * n) / 8;
    const cz = f(MathHelper.cos(angle) * n) / 8;
    const x0 = f(f(x + 8) + f(sx));
    const x1 = f(f(x + 8) - f(sx));
    const z0 = f(f(z + 8) + f(cz));
    const z1 = f(f(z + 8) - f(cz));
    const y0 = y + rand.nextInt(3) - 2;
    const y1 = y + rand.nextInt(3) - 2;
    for (let i = 0; i <= n; i++) {
      const cx = x0 + ((x1 - x0) * i) / n;
      const cy = y0 + ((y1 - y0) * i) / n;
      const czz = z0 + ((z1 - z0) * i) / n;
      const size = (rand.nextDouble() * n) / 16;
      const s = MathHelper.sin(f(f(i * PI_F) / n));
      const hr = f(s + 1) * size + 1;
      const vr = f(s + 1) * size + 1;
      const minX = MathHelper.floor_double(cx - hr / 2);
      const minY = MathHelper.floor_double(cy - vr / 2);
      const minZ = MathHelper.floor_double(czz - hr / 2);
      const maxX = MathHelper.floor_double(cx + hr / 2);
      const maxY = MathHelper.floor_double(cy + vr / 2);
      const maxZ = MathHelper.floor_double(czz + hr / 2);
      for (let bx = minX; bx <= maxX; bx++) {
        const dx = (bx + 0.5 - cx) / (hr / 2);
        if (dx * dx >= 1) continue;
        for (let by = minY; by <= maxY; by++) {
          const dy = (by + 0.5 - cy) / (vr / 2);
          if (dx * dx + dy * dy >= 1) continue;
          for (let bz = minZ; bz <= maxZ; bz++) {
            const dz = (bz + 0.5 - czz) / (hr / 2);
            if (dx * dx + dy * dy + dz * dz < 1 && w.getBlockId(bx, by, bz) === this.targetId) w.setBlock(bx, by, bz, this.minableBlockId, 0, 2);
          }
        }
      }
    }
    return true;
  }
}
