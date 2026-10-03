import type { JavaRandom } from '../core/JavaRandom';
import { CreativeTabs } from '../item/CreativeTabs';
import { Block } from './Block';
import { ItemIds } from './BlockIds';
import { Material } from './Material';

export class BlockClay extends Block {
  constructor(id: number) {
    super(id, Material.clay);
    this.setCreativeTab(CreativeTabs.tabBlock);
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return ItemIds.clay;
  }

  override quantityDropped(_rand: JavaRandom): number {
    return 4;
  }
}
