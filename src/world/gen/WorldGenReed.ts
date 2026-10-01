import { Block } from '../../block/Block';
import { BlockIds } from '../../block/BlockIds';
import { Material } from '../../block/Material';
import type { JavaRandom } from '../../core/JavaRandom';
import type { IWorld } from '../IWorld';
import { WorldGenerator } from './WorldGenerator';

/** Sugar cane next to water. */
export class WorldGenReed extends WorldGenerator {
  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    const reed = Block.blocksList[BlockIds.reed];
    for (let i = 0; i < 20; i++) {
      const px = x + rand.nextInt(4) - rand.nextInt(4);
      const pz = z + rand.nextInt(4) - rand.nextInt(4);
      if (
        w.isAirBlock(px, y, pz) &&
        (w.getBlockMaterial(px - 1, y - 1, pz) === Material.water ||
          w.getBlockMaterial(px + 1, y - 1, pz) === Material.water ||
          w.getBlockMaterial(px, y - 1, pz - 1) === Material.water ||
          w.getBlockMaterial(px, y - 1, pz + 1) === Material.water)
      ) {
        const h = 2 + rand.nextInt(rand.nextInt(3) + 1);
        for (let k = 0; k < h; k++) {
          if (reed && reed.canBlockStay(w, px, y + k, pz)) w.setBlock(px, y + k, pz, BlockIds.reed, 0, 2);
        }
      }
    }
    return true;
  }
}
