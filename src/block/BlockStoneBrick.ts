import { CreativeTabs } from '../item/CreativeTabs';
import { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import { Block } from './Block';
import { Material } from './Material';

/** Stone bricks (98): 0 plain, 1 mossy, 2 cracked, 3 chiseled. */
export class BlockStoneBrick extends Block {
  static readonly STONE_BRICK_TYPES = ['default', 'mossy', 'cracked', 'chiseled'];
  static readonly textureNames = ['stonebricksmooth', 'stonebricksmooth_mossy', 'stonebricksmooth_cracked', 'stonebricksmooth_carved'];
  private icons: (Icon | null)[] = [];

  constructor(id: number) {
    super(id, Material.rock);
    this.setCreativeTab(CreativeTabs.tabBlock);
  }

  override getIcon(_side: number, meta: number): Icon | null {
    if (meta < 0 || meta >= BlockStoneBrick.textureNames.length) meta = 0;
    return this.icons[meta];
  }

  override damageDropped(meta: number): number {
    return meta;
  }

  override getSubBlocks(id: number, _tab: CreativeTabs, out: ItemStack[]): void {
    for (let i = 0; i < 4; i++) out.push(new ItemStack(id, 1, i));
  }

  override registerIcons(reg: IconRegister): void {
    this.icons = BlockStoneBrick.textureNames.map((n) => reg.registerIcon(n));
  }
}
