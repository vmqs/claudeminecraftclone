import { CreativeTabs } from '../item/CreativeTabs';
import { Block } from './Block';
import { Material } from './Material';

/** Netherrack (87, "hellrock"). */
export class BlockNetherrack extends Block {
  constructor(id: number) {
    super(id, Material.rock);
    this.setCreativeTab(CreativeTabs.tabBlock);
  }
}
