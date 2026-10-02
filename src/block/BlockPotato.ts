import { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import { BlockCrops } from './BlockCrops';
import { ItemIds } from './BlockIds';

/** Potatoes (142): four textures over the 8 stages; ripe ones may also drop a poisonous potato. */
export class BlockPotato extends BlockCrops {
  override getIcon(_side: number, meta: number): Icon | null {
    if (meta < 7) {
      if (meta === 6) meta = 5;
      return this.iconArray[meta >> 1];
    }
    return this.iconArray[3];
  }

  protected override getSeedItem(): number {
    return ItemIds.potato;
  }

  protected override getCropItem(): number {
    return ItemIds.potato;
  }

  override dropBlockAsItemWithChance(w: IWorld, x: number, y: number, z: number, meta: number, chance: number, fortune: number): void {
    super.dropBlockAsItemWithChance(w, x, y, z, meta, chance, fortune);
    if (!w.isRemote && meta >= 7 && w.rand.nextInt(50) === 0) this.dropBlockAsItem_do(w, x, y, z, new ItemStack(ItemIds.poisonousPotato, 1, 0));
  }

  override registerIcons(reg: IconRegister): void {
    this.iconArray = [];
    for (let i = 0; i < 4; i++) this.iconArray.push(reg.registerIcon('potatoes_' + i));
  }
}
