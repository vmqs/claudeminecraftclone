import { Block } from '../../block/Block';
import { BlockIds } from '../../block/BlockIds';
import type { JavaRandom } from '../../core/JavaRandom';
import type { IWorld } from '../IWorld';
import { WorldGenerator } from './WorldGenerator';

/** Tall grass / ferns patch dropped to the surface below the point. */
export class WorldGenTallGrass extends WorldGenerator {
  constructor(
    private readonly tallGrassID: number,
    private readonly tallGrassMetadata: number,
  ) {
    super();
  }

  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    let id: number;
    while (((id = w.getBlockId(x, y, z)) === 0 || id === BlockIds.leaves) && y > 0) y--;
    const plant = Block.blocksList[this.tallGrassID];
    for (let i = 0; i < 128; i++) {
      const px = x + rand.nextInt(8) - rand.nextInt(8);
      const py = y + rand.nextInt(4) - rand.nextInt(4);
      const pz = z + rand.nextInt(8) - rand.nextInt(8);
      if (w.isAirBlock(px, py, pz) && plant && plant.canBlockStay(w, px, py, pz)) w.setBlock(px, py, pz, this.tallGrassID, this.tallGrassMetadata, 2);
    }
    return true;
  }
}
