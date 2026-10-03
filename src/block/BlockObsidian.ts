import type { JavaRandom } from '../core/JavaRandom';
import { BlockIds } from './BlockIds';
import { BlockStone } from './BlockStone';

export class BlockObsidian extends BlockStone {
  override quantityDropped(_rand: JavaRandom): number {
    return 1;
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return BlockIds.obsidian;
  }
}
