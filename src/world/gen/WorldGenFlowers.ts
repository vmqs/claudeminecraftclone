import { Block } from '../../block/Block';
import type { JavaRandom } from '../../core/JavaRandom';
import type { IWorld } from '../IWorld';
import { WorldGenerator } from './WorldGenerator';

/** Scatters a plant (flowers, mushrooms, pumpkins) around a point. */
export class WorldGenFlowers extends WorldGenerator {
  constructor(private readonly plantBlockId: number) {
    super();
  }

  generate(w: IWorld, rand: JavaRandom, x: number, y: number, z: number): boolean {
    const plant = Block.blocksList[this.plantBlockId];
    for (let i = 0; i < 64; i++) {
      const px = x + rand.nextInt(8) - rand.nextInt(8);
      const py = y + rand.nextInt(4) - rand.nextInt(4);
      const pz = z + rand.nextInt(8) - rand.nextInt(8);
      if (w.isAirBlock(px, py, pz) && (!w.provider.hasNoSky || py < 127) && plant && plant.canBlockStay(w, px, py, pz)) {
        w.setBlock(px, py, pz, this.plantBlockId, 0, 2);
      }
    }
    return true;
  }
}
