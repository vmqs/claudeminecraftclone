import { BlockIds } from '../../../block/BlockIds';
import type { JavaRandom } from '../../../core/JavaRandom';
import { MathHelper } from '../../../core/MathHelper';
import type { IWorld } from '../../IWorld';
import { WorldGenerator } from '../WorldGenerator';

const f = Math.fround;
const PI_F = f(Math.PI);

/** 2x2 jungle giants with side branches and vines (WorldGenHugeTrees). */
export class WorldGenHugeTrees extends WorldGenerator {
  constructor(
    notify: boolean,
    private readonly baseHeight: number,
    private readonly woodMetadata: number,
    private readonly leavesMetadata: number,
  ) {
    super(notify);
  }

  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    const height = rand.nextInt(3) + this.baseHeight;
    if (!(y >= 1 && y + height + 1 <= 256)) return false;
    let ok = true;
    for (let yy = y; yy <= y + 1 + height; yy++) {
      let r = 2;
      if (yy === y) r = 1;
      if (yy >= y + 1 + height - 2) r = 2;
      for (let xx = x - r; xx <= x + r && ok; xx++) {
        for (let zz = z - r; zz <= z + r && ok; zz++) {
          if (yy >= 0 && yy < 256) {
            const id = w.getBlockId(xx, yy, zz);
            if (id !== 0 && id !== BlockIds.leaves && id !== BlockIds.grass && id !== BlockIds.dirt && id !== BlockIds.wood && id !== BlockIds.sapling) ok = false;
          } else {
            ok = false;
          }
        }
      }
    }
    if (!ok) return false;
    const below = w.getBlockId(x, y - 1, z);
    if (!((below === BlockIds.grass || below === BlockIds.dirt) && y < 256 - height - 1)) return false;
    w.setBlock(x, y - 1, z, BlockIds.dirt, 0, 2);
    w.setBlock(x + 1, y - 1, z, BlockIds.dirt, 0, 2);
    w.setBlock(x, y - 1, z + 1, BlockIds.dirt, 0, 2);
    w.setBlock(x + 1, y - 1, z + 1, BlockIds.dirt, 0, 2);
    this.growLeaves(w, x, z, y + height, 2, rand);
    for (let by = y + height - 2 - rand.nextInt(4); by > y + Math.trunc(height / 2); by -= 2 + rand.nextInt(4)) {
      const angle = f(f(rand.nextFloat() * PI_F) * 2);
      let bx = x + Math.trunc(f(0.5 + f(MathHelper.cos(angle) * 4)));
      let bz = z + Math.trunc(f(0.5 + f(MathHelper.sin(angle) * 4)));
      this.growLeaves(w, bx, bz, by, 0, rand);
      for (let i = 0; i < 5; i++) {
        bx = x + Math.trunc(f(1.5 + f(MathHelper.cos(angle) * i)));
        bz = z + Math.trunc(f(1.5 + f(MathHelper.sin(angle) * i)));
        this.setBlockAndMetadata(w, bx, by - 3 + Math.trunc(i / 2), bz, BlockIds.wood, this.woodMetadata);
      }
    }
    const log = BlockIds.wood;
    const vine = BlockIds.vine;
    const free = (id: number) => id === 0 || id === BlockIds.leaves;
    for (let i = 0; i < height; i++) {
      const yy = y + i;
      if (free(w.getBlockId(x, yy, z))) {
        this.setBlockAndMetadata(w, x, yy, z, log, this.woodMetadata);
        if (i > 0) {
          if (rand.nextInt(3) > 0 && w.isAirBlock(x - 1, yy, z)) this.setBlockAndMetadata(w, x - 1, yy, z, vine, 8);
          if (rand.nextInt(3) > 0 && w.isAirBlock(x, yy, z - 1)) this.setBlockAndMetadata(w, x, yy, z - 1, vine, 1);
        }
      }
      if (i < height - 1) {
        if (free(w.getBlockId(x + 1, yy, z))) {
          this.setBlockAndMetadata(w, x + 1, yy, z, log, this.woodMetadata);
          if (i > 0) {
            if (rand.nextInt(3) > 0 && w.isAirBlock(x + 2, yy, z)) this.setBlockAndMetadata(w, x + 2, yy, z, vine, 2);
            if (rand.nextInt(3) > 0 && w.isAirBlock(x + 1, yy, z - 1)) this.setBlockAndMetadata(w, x + 1, yy, z - 1, vine, 1);
          }
        }
        if (free(w.getBlockId(x + 1, yy, z + 1))) {
          this.setBlockAndMetadata(w, x + 1, yy, z + 1, log, this.woodMetadata);
          if (i > 0) {
            if (rand.nextInt(3) > 0 && w.isAirBlock(x + 2, yy, z + 1)) this.setBlockAndMetadata(w, x + 2, yy, z + 1, vine, 2);
            if (rand.nextInt(3) > 0 && w.isAirBlock(x + 1, yy, z + 2)) this.setBlockAndMetadata(w, x + 1, yy, z + 2, vine, 4);
          }
        }
        if (free(w.getBlockId(x, yy, z + 1))) {
          this.setBlockAndMetadata(w, x, yy, z + 1, log, this.woodMetadata);
          if (i > 0) {
            if (rand.nextInt(3) > 0 && w.isAirBlock(x - 1, yy, z + 1)) this.setBlockAndMetadata(w, x - 1, yy, z + 1, vine, 8);
            if (rand.nextInt(3) > 0 && w.isAirBlock(x, yy, z + 2)) this.setBlockAndMetadata(w, x, yy, z + 2, vine, 4);
          }
        }
      }
    }
    return true;
  }

  private growLeaves(w: IWorld, x: number, z: number, y: number, size: number, rand: JavaRandom): void {
    for (let yy = y - 2; yy <= y; yy++) {
      const dy = yy - y;
      const r = size + 1 - dy;
      for (let xx = x - r; xx <= x + r + 1; xx++) {
        const dx = xx - x;
        for (let zz = z - r; zz <= z + r + 1; zz++) {
          const dz = zz - z;
          const d2 = dx * dx + dz * dz;
          if ((dx >= 0 || dz >= 0 || d2 <= r * r) && ((dx <= 0 && dz <= 0) || d2 <= (r + 1) * (r + 1)) && (rand.nextInt(4) !== 0 || d2 <= (r - 1) * (r - 1))) {
            const id = w.getBlockId(xx, yy, zz);
            if (id === 0 || id === BlockIds.leaves) this.setBlockAndMetadata(w, xx, yy, zz, BlockIds.leaves, this.leavesMetadata);
          }
        }
      }
    }
  }
}
