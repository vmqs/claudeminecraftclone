import { CreativeTabs } from '../item/CreativeTabs';
import { Block } from './Block';
import { Material } from './Material';

/** Storage blocks of gold, iron, diamond and emerald (BlockOreStorage). */
export class BlockOreStorage extends Block {
  constructor(id: number) {
    super(id, Material.iron);
    this.setCreativeTab(CreativeTabs.tabBlock);
  }
}
