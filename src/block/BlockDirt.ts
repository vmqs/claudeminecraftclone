import { CreativeTabs } from '../item/CreativeTabs';
import { Block } from './Block';
import { Material } from './Material';

export class BlockDirt extends Block {
  constructor(id: number) {
    super(id, Material.ground);
    this.setCreativeTab(CreativeTabs.tabBlock);
  }
}
