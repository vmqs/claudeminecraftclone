import type { JavaRandom } from '../core/JavaRandom';
import { ItemIds } from './BlockIds';
import { BlockSand } from './BlockSand';

export class BlockGravel extends BlockSand {
  override idDropped(_meta: number, rand: JavaRandom, fortune: number): number {
    if (fortune > 3) fortune = 3;
    return rand.nextInt(10 - fortune * 3) === 0 ? ItemIds.flint : this.blockID;
  }
}
