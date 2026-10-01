import type { JavaRandom } from '../core/JavaRandom';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { ItemStack } from '../item/ItemStack';
import type { IWorld } from '../world/IWorld';
import { BlockIds, ItemIds } from './BlockIds';
import { BlockFlower } from './BlockFlower';
import { Material } from './Material';

export class BlockDeadBush extends BlockFlower {
  constructor(id: number) {
    super(id, Material.vine);
    const f = 0.4;
    this.setBlockBounds(0.5 - f, 0, 0.5 - f, 0.5 + f, 0.8, 0.5 + f);
  }

  protected override canThisPlantGrowOnThisBlockID(id: number): boolean {
    return id === BlockIds.sand;
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return -1;
  }

  override harvestBlock(w: IWorld, p: EntityPlayer, x: number, y: number, z: number, meta: number): void {
    const held = p.getCurrentEquippedItem();
    if (!w.isRemote && held && held.itemID === ItemIds.shears) {
      this.dropBlockAsItem_do(w, x, y, z, new ItemStack(BlockIds.deadBush, 1, meta));
    } else {
      super.harvestBlock(w, p, x, y, z, meta);
    }
  }
}
