import { Block } from '../block/Block';
import { BlockIds } from '../block/BlockIds';
import { BlockLog } from '../block/BlockLog';
import { BlockSandStone } from '../block/BlockSandStone';
import { BlockSapling } from '../block/BlockSapling';
import { BlockWood } from '../block/BlockWood';
import '../block/Blocks';
import { bindCreativeTabsItemList, CreativeTabs } from './CreativeTabs';
import { Item } from './Item';
import { ItemBlock } from './ItemBlock';
import { ItemCloth, ItemColored, ItemLeaves, ItemMultiTextureTile, ItemSnow } from './ItemBlockVariants';
import { ItemReed } from './ItemReed';

/**
 * The item registry. Items use the constructor index of 1.5.2 (itemID = 256 + index),
 * e.g. `new Item(24)` is the stick (280). The items agent adds the remaining items here;
 * block items are created by `registerBlockItems()`.
 */
export const Items = {
  stick: new Item(24).setFull3D().setUnlocalizedName('stick').setCreativeTab(CreativeTabs.tabMaterials),
  reed: new ItemReed(82, BlockIds.reed).setUnlocalizedName('reeds').setCreativeTab(CreativeTabs.tabMaterials),
};

/**
 * The tail of Block's static initialiser: special block items, then a plain ItemBlock
 * for every other block id.
 */
export function registerBlockItems(): void {
  const list = Item.itemsList;
  const ib = (id: number) => id - 256;
  list[BlockIds.cloth] ??= new ItemCloth(ib(BlockIds.cloth)).setUnlocalizedName('cloth');
  list[BlockIds.wood] ??= new ItemMultiTextureTile(ib(BlockIds.wood), BlockLog.woodType).setUnlocalizedName('log');
  list[BlockIds.planks] ??= new ItemMultiTextureTile(ib(BlockIds.planks), BlockWood.woodType).setUnlocalizedName('wood');
  list[BlockIds.sandStone] ??= new ItemMultiTextureTile(ib(BlockIds.sandStone), BlockSandStone.SAND_STONE_TYPES).setUnlocalizedName('sandStone');
  list[BlockIds.sapling] ??= new ItemMultiTextureTile(ib(BlockIds.sapling), BlockSapling.WOOD_TYPES).setUnlocalizedName('sapling');
  list[BlockIds.leaves] ??= new ItemLeaves(ib(BlockIds.leaves)).setUnlocalizedName('leaves');
  list[BlockIds.tallGrass] ??= new ItemColored(ib(BlockIds.tallGrass), true).setBlockNames(['shrub', 'grass', 'fern']);
  if (Block.blocksList[BlockIds.snow]) list[BlockIds.snow] ??= new ItemSnow(ib(BlockIds.snow));
  for (let id = 0; id < 256; id++) {
    const b = Block.blocksList[id];
    if (b && !list[id]) {
      list[id] = new ItemBlock(id - 256);
      b.initializeBlock();
    }
  }
  bindCreativeTabsItemList(list);
}

registerBlockItems();
