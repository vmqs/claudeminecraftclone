import { CreativeTabs } from '../item/CreativeTabs';
import { Block } from './Block';
import { Material } from './Material';

/** Sponge (19): a plain block in 1.5.2 (it no longer absorbs water). */
export class BlockSponge extends Block {
  constructor(id: number) {
    super(id, Material.sponge);
    this.setCreativeTab(CreativeTabs.tabBlock);
  }
}
