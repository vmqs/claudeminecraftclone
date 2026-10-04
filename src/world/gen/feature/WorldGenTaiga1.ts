import { Block } from '../../../block/Block';
import { BlockIds } from '../../../block/BlockIds';
import type { JavaRandom } from '../../../core/JavaRandom';
import type { IWorld } from '../../IWorld';
import { WorldGenerator } from '../WorldGenerator';

/** Tall, thin spruce with a bare trunk and a small top (WorldGenTaiga1). */
export class WorldGenTaiga1 extends WorldGenerator {
  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    const height = rand.nextInt(5) + 7;
    const trunk = height - rand.nextInt(2) - 3;
    const leafSpan = height - trunk;
    const maxR = 1 + rand.nextInt(leafSpan + 1);
    if (!(y >= 1 && y + height + 1 <= 128)) return false;
    let ok = true;
    for (let yy = y; yy <= y + 1 + height && ok; yy++) {
      const r = yy - y < trunk ? 0 : maxR;
      for (let xx = x - r; xx <= x + r && ok; xx++) {
        for (let zz = z - r; zz <= z + r && ok; zz++) {
          if (yy >= 0 && yy < 128) {
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
    if (!((below === BlockIds.grass || below === BlockIds.dirt) && y < 128 - height - 1)) return false;
    this.setBlock(w, x, y - 1, z, BlockIds.dirt);
    let r = 0;
    for (let yy = y + height; yy >= y + trunk; yy--) {
      for (let xx = x - r; xx <= x + r; xx++) {
        const dx = xx - x;
        for (let zz = z - r; zz <= z + r; zz++) {
          const dz = zz - z;
          if ((Math.abs(dx) !== r || Math.abs(dz) !== r || r <= 0) && !Block.opaqueCubeLookup[w.getBlockId(xx, yy, zz)]) {
            this.setBlockAndMetadata(w, xx, yy, zz, BlockIds.leaves, 1);
          }
        }
      }
      if (r >= 1 && yy === y + trunk + 1) r--;
      else if (r < maxR) r++;
    }
    for (let i = 0; i < height - 1; i++) {
      const id = w.getBlockId(x, y + i, z);
      if (id === 0 || id === BlockIds.leaves) this.setBlockAndMetadata(w, x, y + i, z, BlockIds.wood, 1);
    }
    return true;
  }
}
