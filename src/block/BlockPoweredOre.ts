import { CreativeTabs } from '../item/CreativeTabs';
import type { IBlockAccess } from '../world/IBlockAccess';
import { BlockOreStorage } from './BlockOreStorage';

/** Block of redstone (152): always a full-strength power source. */
export class BlockPoweredOre extends BlockOreStorage {
  constructor(id: number) {
    super(id);
    this.setCreativeTab(CreativeTabs.tabRedstone);
  }

  override canProvidePower(): boolean {
    return true;
  }

  override isProvidingWeakPower(_w: IBlockAccess, _x: number, _y: number, _z: number, _side: number): number {
    return 15;
  }
}
