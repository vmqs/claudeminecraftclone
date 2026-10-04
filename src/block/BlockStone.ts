import type { JavaRandom } from '../core/JavaRandom';
import { CreativeTabs } from '../item/CreativeTabs';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

export class BlockStone extends Block {
  constructor(id: number) {
    super(id, Material.rock);
    this.setCreativeTab(CreativeTabs.tabBlock);
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return BlockIds.cobblestone;
  }
}
