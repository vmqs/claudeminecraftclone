import { CreativeTabs } from '../item/CreativeTabs';
import { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import { Block } from './Block';
import { Material } from './Material';

/** Planks (4 wood types by metadata). */
export class BlockWood extends Block {
  static readonly woodType = ['oak', 'spruce', 'birch', 'jungle'];
  static readonly woodTextureTypes = ['wood', 'wood_spruce', 'wood_birch', 'wood_jungle'];
  private iconArray: (Icon | null)[] = [];

  constructor(id: number) {
    super(id, Material.wood);
    this.setCreativeTab(CreativeTabs.tabBlock);
  }

  override getIcon(_side: number, meta: number): Icon | null {
    if (meta < 0 || meta >= this.iconArray.length) meta = 0;
    return this.iconArray[meta];
  }

  override damageDropped(meta: number): number {
    return meta;
  }

  override getSubBlocks(id: number, _tab: CreativeTabs, out: ItemStack[]): void {
    for (let i = 0; i < 4; i++) out.push(new ItemStack(id, 1, i));
  }

  override registerIcons(reg: IconRegister): void {
    this.iconArray = BlockWood.woodTextureTypes.map((n) => reg.registerIcon(n));
  }
}
