import { CreativeTabs } from '../item/CreativeTabs';
import { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import { Block } from './Block';
import { Material } from './Material';

export class BlockSandStone extends Block {
  static readonly SAND_STONE_TYPES = ['default', 'chiseled', 'smooth'];
  private static readonly sideNames = ['sandstone_side', 'sandstone_carved', 'sandstone_smooth'];
  private sideIcons: (Icon | null)[] = [];
  private topIcon: Icon | null = null;
  private bottomIcon: Icon | null = null;

  constructor(id: number) {
    super(id, Material.rock);
    this.setCreativeTab(CreativeTabs.tabBlock);
  }

  override getIcon(side: number, meta: number): Icon | null {
    if (side === 1 || (side === 0 && (meta === 1 || meta === 2))) return this.topIcon;
    if (side === 0) return this.bottomIcon;
    if (meta < 0 || meta >= this.sideIcons.length) meta = 0;
    return this.sideIcons[meta];
  }

  override damageDropped(meta: number): number {
    return meta;
  }

  override getSubBlocks(id: number, _tab: CreativeTabs, out: ItemStack[]): void {
    for (let i = 0; i < 3; i++) out.push(new ItemStack(id, 1, i));
  }

  override registerIcons(reg: IconRegister): void {
    this.sideIcons = BlockSandStone.sideNames.map((n) => reg.registerIcon(n));
    this.topIcon = reg.registerIcon('sandstone_top');
    this.bottomIcon = reg.registerIcon('sandstone_bottom');
  }
}
