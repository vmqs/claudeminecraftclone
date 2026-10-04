import type { JavaRandom } from '../core/JavaRandom';
import { CreativeTabs } from '../item/CreativeTabs';
import { BlockBreakable } from './BlockBreakable';
import type { Material } from './Material';

export class BlockGlass extends BlockBreakable {
  constructor(id: number, material: Material, localFlag: boolean) {
    super(id, 'glass', material, localFlag);
    this.setCreativeTab(CreativeTabs.tabBlock);
  }

  override quantityDropped(_rand: JavaRandom): number {
    return 0;
  }

  override getRenderBlockPass(): number {
    return 0;
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  protected override canSilkHarvest(): boolean {
    return true;
  }
}
