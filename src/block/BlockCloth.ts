import { CreativeTabs } from '../item/CreativeTabs';
import { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import { Block } from './Block';
import { Material } from './Material';

/** Wool, 16 colours by metadata. */
export class BlockCloth extends Block {
  private iconArray: (Icon | null)[] = [];

  constructor(id = 35) {
    super(id, Material.cloth);
    this.setCreativeTab(CreativeTabs.tabBlock);
  }

  override getIcon(_side: number, meta: number): Icon | null {
    return this.iconArray[meta % this.iconArray.length];
  }

  override damageDropped(meta: number): number {
    return meta;
  }

  static getBlockFromDye(dye: number): number {
    return ~dye & 15;
  }

  static getDyeFromBlock(meta: number): number {
    return ~meta & 15;
  }

  override getSubBlocks(id: number, _tab: CreativeTabs, out: ItemStack[]): void {
    for (let i = 0; i < 16; i++) out.push(new ItemStack(id, 1, i));
  }

  override registerIcons(reg: IconRegister): void {
    this.iconArray = [];
    for (let i = 0; i < 16; i++) this.iconArray.push(reg.registerIcon('cloth_' + i));
  }
}
