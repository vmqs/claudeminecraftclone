import { BlockIds } from '../../../block/BlockIds';
import type { JavaRandom } from '../../../core/JavaRandom';
import type { IWorld } from '../../IWorld';
import { WorldGenerator } from '../WorldGenerator';

/** Birch trees (WorldGenForest): 5-7 blocks, birch log and leaves (meta 2). */
export class WorldGenForest extends WorldGenerator {
  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    const height = rand.nextInt(3) + 5;
    if (!(y >= 1 && y + height + 1 <= 256)) return false;
    let ok = true;
    for (let yy = y; yy <= y + 1 + height; yy++) {
      let r = 1;
      if (yy === y) r = 0;
      if (yy >= y + 1 + height - 2) r = 2;
      for (let xx = x - r; xx <= x + r && ok; xx++) {
        for (let zz = z - r; zz <= z + r && ok; zz++) {
          if (yy >= 0 && yy < 256) {
            const id = w.getBlockId(xx, yy, zz);
            if (id !== 0 && id !== BlockIds.leaves) ok = false;
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
            if (id === 0 || id === BlockIds.leaves) this.setBlockAndMetadata(w, xx, yy, zz, BlockIds.leaves, 2);
          }
        }
      }
    }
    for (let i = 0; i < height; i++) {
      const id = w.getBlockId(x, y + i, z);
      if (id === 0 || id === BlockIds.leaves) this.setBlockAndMetadata(w, x, y + i, z, BlockIds.wood, 2);
    }
    return true;
  }
}
