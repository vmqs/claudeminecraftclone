import type { JavaRandom } from '../core/JavaRandom';
import { CreativeTabs } from '../item/CreativeTabs';
import { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import { Block } from './Block';
import { BlockHalfSlab } from './BlockHalfSlab';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

/** Wooden slabs (125 double, 126 single): oak, spruce, birch, jungle planks. */
export class BlockWoodSlab extends BlockHalfSlab {
  static readonly woodType = ['oak', 'spruce', 'birch', 'jungle'];

  constructor(id: number, isDouble: boolean) {
    super(id, isDouble, Material.wood);
    this.setCreativeTab(CreativeTabs.tabBlock);
  }

  override getIcon(side: number, meta: number): Icon | null {
    return Block.blocksList[BlockIds.planks]!.getIcon(side, meta & 7);
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return BlockIds.woodSingleSlab;
  }

  protected override createStackedBlock(meta: number): ItemStack {
    return new ItemStack(BlockIds.woodSingleSlab, 2, meta & 7);
  }

  getFullSlabName(meta: number): string {
    if (meta < 0 || meta >= BlockWoodSlab.woodType.length) meta = 0;
    return super.getUnlocalizedName() + '.' + BlockWoodSlab.woodType[meta];
  }

  override getSubBlocks(id: number, _tab: CreativeTabs, out: ItemStack[]): void {
    if (id === BlockIds.woodDoubleSlab) return;
    for (let i = 0; i < 4; i++) out.push(new ItemStack(id, 1, i));
  }

  override registerIcons(_reg: IconRegister): void {}
}
