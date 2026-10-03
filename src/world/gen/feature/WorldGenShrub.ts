import { Block } from '../../../block/Block';
import { BlockIds } from '../../../block/BlockIds';
import type { JavaRandom } from '../../../core/JavaRandom';
import type { IWorld } from '../../IWorld';
import { WorldGenerator } from '../WorldGenerator';

/** Jungle bushes: one log with a leaf mound (WorldGenShrub). */
export class WorldGenShrub extends WorldGenerator {
  constructor(
    private readonly woodMeta: number,
    private readonly leavesMeta: number,
  ) {
    super();
  }

  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    let id: number;
    while (((id = w.getBlockId(x, y, z)) === 0 || id === BlockIds.leaves) && y > 0) y--;
    const ground = w.getBlockId(x, y, z);
    if (ground === BlockIds.dirt || ground === BlockIds.grass) {
      this.setBlockAndMetadata(w, x, ++y, z, BlockIds.wood, this.woodMeta);
      for (let yy = y; yy <= y + 2; yy++) {
        const r = 2 - (yy - y);
        for (let xx = x - r; xx <= x + r; xx++) {
          const dx = xx - x;
          for (let zz = z - r; zz <= z + r; zz++) {
            const dz = zz - z;
            if ((Math.abs(dx) !== r || Math.abs(dz) !== r || rand.nextInt(2) !== 0) && !Block.opaqueCubeLookup[w.getBlockId(xx, yy, zz)]) {
              this.setBlockAndMetadata(w, xx, yy, zz, BlockIds.leaves, this.leavesMeta);
            }
          }
        }
      }
    }
    return true;
  }
}
