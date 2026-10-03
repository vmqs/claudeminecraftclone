import type { JavaRandom } from '../core/JavaRandom';
import { CreativeTabs } from '../item/CreativeTabs';
import { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import { Block } from './Block';
import { BlockHalfSlab } from './BlockHalfSlab';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

/**
 * Stone slabs (43 double, 44 single): 0 stone, 1 sandstone, 2 (old) wood, 3 cobblestone,
 * 4 brick, 5 stone brick, 6 nether brick, 7 quartz. A double stone slab with bit 8 shows the
 * smooth top texture on every side.
 */
export class BlockStep extends BlockHalfSlab {
  static readonly blockStepTypes = ['stone', 'sand', 'wood', 'cobble', 'brick', 'smoothStoneBrick', 'netherBrick', 'quartz'];
  private iconSide: Icon | null = null;

  constructor(id: number, isDouble: boolean) {
    super(id, isDouble, Material.rock);
    this.setCreativeTab(CreativeTabs.tabBlock);
  }

  override getIcon(side: number, meta: number): Icon | null {
    const type = meta & 7;
    if (this.isDoubleSlab && (meta & 8) !== 0) side = 1;
    const b = Block.blocksList;
    switch (type) {
      case 0:
        return side !== 1 && side !== 0 ? this.iconSide : this.blockIcon;
      case 1:
        return b[BlockIds.sandStone]!.getBlockTextureFromSide(side);
      case 2:
        return b[BlockIds.planks]!.getBlockTextureFromSide(side);
      case 3:
        return b[BlockIds.cobblestone]!.getBlockTextureFromSide(side);
      case 4:
        return b[BlockIds.brick]!.getBlockTextureFromSide(side);
      case 5:
        return b[BlockIds.stoneBrick]!.getIcon(side, 0);
      case 6:
        return b[BlockIds.netherBrick]!.getBlockTextureFromSide(1);
      default:
        return b[BlockIds.blockNetherQuartz]!.getBlockTextureFromSide(side);
    }
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon('stoneslab_top');
    this.iconSide = reg.registerIcon('stoneslab_side');
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return BlockIds.stoneSingleSlab;
  }

  protected override createStackedBlock(meta: number): ItemStack {
    return new ItemStack(BlockIds.stoneSingleSlab, 2, meta & 7);
  }

  getFullSlabName(meta: number): string {
    if (meta < 0 || meta >= BlockStep.blockStepTypes.length) meta = 0;
    return super.getUnlocalizedName() + '.' + BlockStep.blockStepTypes[meta];
  }

  override getSubBlocks(id: number, _tab: CreativeTabs, out: ItemStack[]): void {
    if (id === BlockIds.stoneDoubleSlab) return;
    for (let i = 0; i <= 7; i++) if (i !== 2) out.push(new ItemStack(id, 1, i));
  }
}
