import type { Icon, IconRegister } from '../render/texture/Icon';
import { BlockCrops } from './BlockCrops';
import { ItemIds } from './BlockIds';

/** Carrots (141): four textures over the 8 stages. */
export class BlockCarrot extends BlockCrops {
  override getIcon(_side: number, meta: number): Icon | null {
    if (meta < 7) {
      if (meta === 6) meta = 5;
      return this.iconArray[meta >> 1];
    }
    return this.iconArray[3];
  }

  protected override getSeedItem(): number {
    return ItemIds.carrot;
  }

  protected override getCropItem(): number {
    return ItemIds.carrot;
  }

  override registerIcons(reg: IconRegister): void {
    this.iconArray = [];
    for (let i = 0; i < 4; i++) this.iconArray.push(reg.registerIcon('carrots_' + i));
  }
}
