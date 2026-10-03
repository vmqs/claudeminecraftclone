import type { JavaRandom } from '../core/JavaRandom';
import { CreativeTabs } from '../item/CreativeTabs';
import type { Icon, IconRegister } from '../render/texture/Icon';
import { Block } from './Block';
import { ItemIds } from './BlockIds';
import { Material } from './Material';

/** Melon (103): drops 3-7 slices (at most 9 with fortune). */
export class BlockMelon extends Block {
  private iconTop: Icon | null = null;

  constructor(id: number) {
    super(id, Material.pumpkin);
    this.setCreativeTab(CreativeTabs.tabBlock);
  }

  override getIcon(side: number, _meta: number): Icon | null {
    return side !== 1 && side !== 0 ? this.blockIcon : this.iconTop;
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return ItemIds.melon;
  }

  override quantityDropped(rand: JavaRandom): number {
    return 3 + rand.nextInt(5);
  }

  override quantityDroppedWithBonus(fortune: number, rand: JavaRandom): number {
    return Math.min(9, this.quantityDropped(rand) + rand.nextInt(1 + fortune));
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon('melon_side');
    this.iconTop = reg.registerIcon('melon_top');
  }
}
