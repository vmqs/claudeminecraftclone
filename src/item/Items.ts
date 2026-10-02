import { Block } from '../block/Block';
import { BlockIds } from '../block/BlockIds';
import { ItemAnvilBlock, ItemLilyPad, ItemPiston, ItemSlab } from '../block/BlockItems';
import { BlockLog } from '../block/BlockLog';
import { BlockQuartz } from '../block/BlockQuartz';
import { BlockSandStone } from '../block/BlockSandStone';
import { BlockSapling } from '../block/BlockSapling';
import { BlockSilverfish } from '../block/BlockSilverfish';
import { BlockStoneBrick } from '../block/BlockStoneBrick';
import { BlockWall } from '../block/BlockWall';
import type { BlockHalfSlab } from '../block/BlockHalfSlab';
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
  list[BlockIds.silverfish] ??= new ItemMultiTextureTile(ib(BlockIds.silverfish), BlockSilverfish.silverfishStoneTypes).setUnlocalizedName('monsterStoneEgg');
  list[BlockIds.stoneBrick] ??= new ItemMultiTextureTile(ib(BlockIds.stoneBrick), BlockStoneBrick.STONE_BRICK_TYPES).setUnlocalizedName('stonebricksmooth');
  list[BlockIds.sandStone] ??= new ItemMultiTextureTile(ib(BlockIds.sandStone), BlockSandStone.SAND_STONE_TYPES).setUnlocalizedName('sandStone');
  list[BlockIds.blockNetherQuartz] ??= new ItemMultiTextureTile(ib(BlockIds.blockNetherQuartz), BlockQuartz.quartzBlockTypes).setUnlocalizedName('quartzBlock');
  const slab = (id: number) => Block.blocksList[id] as BlockHalfSlab;
  const [stoneHalf, stoneFull] = [slab(BlockIds.stoneSingleSlab), slab(BlockIds.stoneDoubleSlab)];
  const [woodHalf, woodFull] = [slab(BlockIds.woodSingleSlab), slab(BlockIds.woodDoubleSlab)];
  list[BlockIds.stoneSingleSlab] ??= new ItemSlab(ib(BlockIds.stoneSingleSlab), stoneHalf, stoneFull, false).setUnlocalizedName('stoneSlab');
  list[BlockIds.stoneDoubleSlab] ??= new ItemSlab(ib(BlockIds.stoneDoubleSlab), stoneHalf, stoneFull, true).setUnlocalizedName('stoneSlab');
  list[BlockIds.woodSingleSlab] ??= new ItemSlab(ib(BlockIds.woodSingleSlab), woodHalf, woodFull, false).setUnlocalizedName('woodSlab');
  list[BlockIds.woodDoubleSlab] ??= new ItemSlab(ib(BlockIds.woodDoubleSlab), woodHalf, woodFull, true).setUnlocalizedName('woodSlab');
  list[BlockIds.sapling] ??= new ItemMultiTextureTile(ib(BlockIds.sapling), BlockSapling.WOOD_TYPES).setUnlocalizedName('sapling');
  list[BlockIds.leaves] ??= new ItemLeaves(ib(BlockIds.leaves)).setUnlocalizedName('leaves');
  list[BlockIds.vine] ??= new ItemColored(ib(BlockIds.vine), false);
  list[BlockIds.tallGrass] ??= new ItemColored(ib(BlockIds.tallGrass), true).setBlockNames(['shrub', 'grass', 'fern']);
  if (Block.blocksList[BlockIds.snow]) list[BlockIds.snow] ??= new ItemSnow(ib(BlockIds.snow));
  list[BlockIds.waterlily] ??= new ItemLilyPad(ib(BlockIds.waterlily));
  list[BlockIds.pistonBase] ??= new ItemPiston(ib(BlockIds.pistonBase));
  list[BlockIds.pistonStickyBase] ??= new ItemPiston(ib(BlockIds.pistonStickyBase));
  list[BlockIds.cobblestoneWall] ??= new ItemMultiTextureTile(ib(BlockIds.cobblestoneWall), BlockWall.types).setUnlocalizedName('cobbleWall');
  list[BlockIds.anvil] ??= new ItemAnvilBlock(Block.blocksList[BlockIds.anvil]!).setUnlocalizedName('anvil');
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
