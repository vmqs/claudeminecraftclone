import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { InventoryPlayer } from '../../entity/InventoryPlayer';
import type { ItemStack } from '../../item/ItemStack';
import { Container } from './Container';
import type { IInventory } from './IInventory';
import { addPlayerSlots } from './PlayerSlots';
import { Slot } from './Slot';

/** The 3x3 dispenser or dropper window (ContainerDispenser). */
export class ContainerDispenser extends Container {
  constructor(
    inv: InventoryPlayer,
    private readonly dispenser: IInventory,
  ) {
    super();
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) this.addSlotToContainer(new Slot(dispenser, col + row * 3, 62 + col * 18, 17 + row * 18));
    }
    addPlayerSlots(this, inv, 84);
  }

  canInteractWith(player: EntityPlayer): boolean {
    return this.dispenser.isUseableByPlayer(player);
  }

  override transferStackInSlot(player: EntityPlayer, index: number): ItemStack | null {
    const slot = this.inventorySlots[index];
    if (!slot || !slot.getHasStack()) return null;
    const stack = slot.getStack()!;
    const before = stack.copy();
    if (index < 9 ? !this.mergeItemStack(stack, 9, 45, true) : !this.mergeItemStack(stack, 0, 9, false)) return null;
    if (stack.stackSize === 0) slot.putStack(null);
    else slot.onSlotChanged();
    if (stack.stackSize === before.stackSize) return null;
    slot.onPickupFromSlot(player, stack);
    return before;
  }
}
