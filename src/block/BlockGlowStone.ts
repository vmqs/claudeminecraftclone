import type { JavaRandom } from '../core/JavaRandom';
import { MathHelper } from '../core/MathHelper';
import { CreativeTabs } from '../item/CreativeTabs';
import { Block } from './Block';
import { ItemIds } from './BlockIds';
import type { Material } from './Material';

/** Glowstone (89, "lightgem"): drops 2-4 glowstone dust. */
export class BlockGlowStone extends Block {
  constructor(id: number, material: Material) {
    super(id, material);
    this.setCreativeTab(CreativeTabs.tabBlock);
  }

  override quantityDroppedWithBonus(fortune: number, rand: JavaRandom): number {
    return MathHelper.clamp_int(this.quantityDropped(rand) + rand.nextInt(fortune + 1), 1, 4);
  }

  override quantityDropped(rand: JavaRandom): number {
    return 2 + rand.nextInt(3);
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return ItemIds.lightStoneDust;
  }
}
