import type { JavaRandom } from '../core/JavaRandom';
import { CreativeTabs } from '../item/CreativeTabs';
import type { Icon } from '../render/texture/Icon';
import { Block } from './Block';
import { BlockIds, ItemIds } from './BlockIds';
import { Material } from './Material';

/** Bookshelf (47): planks on top and bottom, drops 3 books. */
export class BlockBookshelf extends Block {
  constructor(id: number) {
    super(id, Material.wood);
    this.setCreativeTab(CreativeTabs.tabBlock);
  }

  override getIcon(side: number, meta: number): Icon | null {
    return side !== 1 && side !== 0 ? super.getIcon(side, meta) : Block.blocksList[BlockIds.planks]!.getBlockTextureFromSide(side);
  }

  override quantityDropped(_rand: JavaRandom): number {
    return 3;
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return ItemIds.book;
  }
}
