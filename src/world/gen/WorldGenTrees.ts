import { BlockIds } from '../../block/BlockIds';
import { Direction } from '../../core/Facing';
import type { JavaRandom } from '../../core/JavaRandom';
import type { IWorld } from '../IWorld';
import { WorldGenerator } from './WorldGenerator';

/** Small oak (and jungle-bush style) trees. */
export class WorldGenTrees extends WorldGenerator {
  constructor(
    notify: boolean,
    private readonly minTreeHeight = 4,
    private readonly metaWood = 0,
    private readonly metaLeaves = 0,
    private readonly vinesGrow = false,
  ) {
    super(notify);
  }

  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    const height = rand.nextInt(3) + this.minTreeHeight;
    let ok = true;
    if (!(y >= 1 && y + height + 1 <= 256)) return false;
    for (let yy = y; yy <= y + 1 + height; yy++) {
      let r = 1;
      if (yy === y) r = 0;
      if (yy >= y + 1 + height - 2) r = 2;
      for (let xx = x - r; xx <= x + r && ok; xx++) {
        for (let zz = z - r; zz <= z + r && ok; zz++) {
          if (yy >= 0 && yy < 256) {
            const id = w.getBlockId(xx, yy, zz);
            if (id !== 0 && id !== BlockIds.leaves && id !== BlockIds.grass && id !== BlockIds.dirt && id !== BlockIds.wood) ok = false;
          } else {
            ok = false;
          }
        }
      }
    }
    if (!ok) return false;
    const below = w.getBlockId(x, y - 1, z);
    if (!((below === BlockIds.grass || below === BlockIds.dirt) && y < 256 - height - 1)) return false;
    this.setBlock(w, x, y - 1, z, BlockIds.dirt);
    for (let yy = y - 3 + height; yy <= y + height; yy++) {
      const dy = yy - (y + height);
      const r = 1 - Math.trunc(dy / 2);
      for (let xx = x - r; xx <= x + r; xx++) {
        const dx = xx - x;
        for (let zz = z - r; zz <= z + r; zz++) {
          const dz = zz - z;
          if (Math.abs(dx) !== r || Math.abs(dz) !== r || (rand.nextInt(2) !== 0 && dy !== 0)) {
            const id = w.getBlockId(xx, yy, zz);
            if (id === 0 || id === BlockIds.leaves) this.setBlockAndMetadata(w, xx, yy, zz, BlockIds.leaves, this.metaLeaves);
          }
        }
      }
    }
    for (let i = 0; i < height; i++) {
      const id = w.getBlockId(x, y + i, z);
      if (id === 0 || id === BlockIds.leaves) {
        this.setBlockAndMetadata(w, x, y + i, z, BlockIds.wood, this.metaWood);
        if (this.vinesGrow && i > 0) {
          if (rand.nextInt(3) > 0 && w.isAirBlock(x - 1, y + i, z)) this.setBlockAndMetadata(w, x - 1, y + i, z, BlockIds.vine, 8);
          if (rand.nextInt(3) > 0 && w.isAirBlock(x + 1, y + i, z)) this.setBlockAndMetadata(w, x + 1, y + i, z, BlockIds.vine, 2);
          if (rand.nextInt(3) > 0 && w.isAirBlock(x, y + i, z - 1)) this.setBlockAndMetadata(w, x, y + i, z - 1, BlockIds.vine, 1);
          if (rand.nextInt(3) > 0 && w.isAirBlock(x, y + i, z + 1)) this.setBlockAndMetadata(w, x, y + i, z + 1, BlockIds.vine, 4);
        }
      }
    }
    if (this.vinesGrow) {
      for (let yy = y - 3 + height; yy <= y + height; yy++) {
        const dy = yy - (y + height);
        const r = 2 - Math.trunc(dy / 2);
        for (let xx = x - r; xx <= x + r; xx++) {
          for (let zz = z - r; zz <= z + r; zz++) {
            if (w.getBlockId(xx, yy, zz) !== BlockIds.leaves) continue;
            if (rand.nextInt(4) === 0 && w.getBlockId(xx - 1, yy, zz) === 0) this.growVines(w, xx - 1, yy, zz, 8);
            if (rand.nextInt(4) === 0 && w.getBlockId(xx + 1, yy, zz) === 0) this.growVines(w, xx + 1, yy, zz, 2);
            if (rand.nextInt(4) === 0 && w.getBlockId(xx, yy, zz - 1) === 0) this.growVines(w, xx, yy, zz - 1, 1);
            if (rand.nextInt(4) === 0 && w.getBlockId(xx, yy, zz + 1) === 0) this.growVines(w, xx, yy, zz + 1, 4);
          }
        }
      }
      if (rand.nextInt(5) === 0 && height > 5) {
        for (let k = 0; k < 2; k++) {
          for (let d = 0; d < 4; d++) {
            if (rand.nextInt(4 - k) === 0) {
              const age = rand.nextInt(3);
              const o = Direction.rotateOpposite[d];
              this.setBlockAndMetadata(w, x + Direction.offsetX[o], y + height - 5 + k, z + Direction.offsetZ[o], BlockIds.cocoaPlant, (age << 2) | d);
            }
          }
        }
      }
    }
    return true;
  }

  private growVines(w: IWorld, x: number, y: number, z: number, meta: number): void {
    this.setBlockAndMetadata(w, x, y, z, BlockIds.vine, meta);
    for (let n = 4; w.getBlockId(x, --y, z) === 0 && n > 0; n--) this.setBlockAndMetadata(w, x, y, z, BlockIds.vine, meta);
  }
}
