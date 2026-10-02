import { Block } from '../../../block/Block';
import { BlockIds } from '../../../block/BlockIds';
import type { JavaRandom } from '../../../core/JavaRandom';
import type { IWorld } from '../../IWorld';
import { WorldGenerator } from '../WorldGenerator';

/** The common spruce with stacked leaf rings (WorldGenTaiga2). */
export class WorldGenTaiga2 extends WorldGenerator {
  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    const height = rand.nextInt(4) + 6;
    const bare = 1 + rand.nextInt(2);
    const leafSpan = height - bare;
    const maxR = 2 + rand.nextInt(2);
    if (!(y >= 1 && y + height + 1 <= 256)) return false;
    let ok = true;
    for (let yy = y; yy <= y + 1 + height && ok; yy++) {
      const r = yy - y < bare ? 0 : maxR;
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
    let r = rand.nextInt(2);
    let limit = 1;
    let reset = 0;
    for (let i = 0; i <= leafSpan; i++) {
      const yy = y + height - i;
      for (let xx = x - r; xx <= x + r; xx++) {
        const dx = xx - x;
        for (let zz = z - r; zz <= z + r; zz++) {
          const dz = zz - z;
          if ((Math.abs(dx) !== r || Math.abs(dz) !== r || r <= 0) && !Block.opaqueCubeLookup[w.getBlockId(xx, yy, zz)]) {
            this.setBlockAndMetadata(w, xx, yy, zz, BlockIds.leaves, 1);
          }
        }
      }
      if (r >= limit) {
        r = reset;
        reset = 1;
        if (++limit > maxR) limit = maxR;
      } else {
        r++;
      }
    }
    const topGap = rand.nextInt(3);
    for (let i = 0; i < height - topGap; i++) {
      const id = w.getBlockId(x, y + i, z);
      if (id === 0 || id === BlockIds.leaves) this.setBlockAndMetadata(w, x, y + i, z, BlockIds.wood, 1);
    }
    return true;
  }
}
