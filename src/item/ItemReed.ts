import { Block } from '../block/Block';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { IWorld } from '../world/IWorld';
import { Item } from './Item';
import { offsetBySide } from './ItemBlock';
import type { ItemStack } from './ItemStack';
import { BlockIds } from '../block/BlockIds';

/** An item that places a block (sugar cane, cake, repeater, ...): ItemReed in MCP. */
export class ItemReed extends Item {
  constructor(
    index: number,
    private readonly spawnID: number,
  ) {
    super(index);
  }

  override onItemUse(stack: ItemStack, player: EntityPlayer, w: IWorld, x: number, y: number, z: number, side: number, hx: number, hy: number, hz: number): boolean {
    const target = w.getBlockId(x, y, z);
    if (target === BlockIds.snow && (w.getBlockMetadata(x, y, z) & 7) < 1) side = 1;
    else if (target !== BlockIds.vine && target !== BlockIds.tallGrass && target !== BlockIds.deadBush) [x, y, z] = offsetBySide(side, x, y, z);
    if (!player.canPlayerEdit(x, y, z, side, stack)) return false;
    if (stack.stackSize === 0) return false;
    if (w.canPlaceEntityOnSide(this.spawnID, x, y, z, false, side, null, stack)) {
      const block = Block.blocksList[this.spawnID]!;
      const meta = block.onBlockPlaced(w, x, y, z, side, hx, hy, hz, 0);
      if (w.setBlock(x, y, z, this.spawnID, meta, 3)) {
        if (w.getBlockId(x, y, z) === this.spawnID) {
          block.onBlockPlacedBy(w, x, y, z, player, stack);
          block.onPostBlockPlaced(w, x, y, z, meta);
        }
        w.playSoundEffect(x + 0.5, y + 0.5, z + 0.5, block.stepSound.getPlaceSound(), (block.stepSound.getVolume() + 1) / 2, block.stepSound.getPitch() * 0.8);
        stack.stackSize--;
      }
    }
    return true;
  }
}
