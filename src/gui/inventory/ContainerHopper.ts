import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { InventoryPlayer } from '../../entity/InventoryPlayer';
import type { ItemStack } from '../../item/ItemStack';
import { Container } from './Container';
import type { IInventory } from './IInventory';
import { addPlayerSlots } from './PlayerSlots';
import { Slot } from './Slot';

/** The hopper (or hopper minecart) window (ContainerHopper): one row of 5 above the player's slots. */
export class ContainerHopper extends Container {
  constructor(
    inv: InventoryPlayer,
    private readonly hopper: IInventory,
  ) {
    super();
    hopper.openChest();
    for (let i = 0; i < hopper.getSizeInventory(); i++) this.addSlotToContainer(new Slot(hopper, i, 44 + i * 18, 20));
    addPlayerSlots(this, inv, 51);
  }

  canInteractWith(player: EntityPlayer): boolean {
    return this.hopper.isUseableByPlayer(player);
  }

  /** Unlike the other windows, the original returns the moved copy without the pickup callback. */
  override transferStackInSlot(_player: EntityPlayer, index: number): ItemStack | null {
    const slot = this.inventorySlots[index];
    if (!slot || !slot.getHasStack()) return null;
    const stack = slot.getStack()!;
    const before = stack.copy();
    const n = this.hopper.getSizeInventory();
    if (index < n ? !this.mergeItemStack(stack, n, this.inventorySlots.length, true) : !this.mergeItemStack(stack, 0, n, false)) return null;
    if (stack.stackSize === 0) slot.putStack(null);
    else slot.onSlotChanged();
    return before;
  }

  override onCraftGuiClosed(player: EntityPlayer): void {
    super.onCraftGuiClosed(player);
    this.hopper.closeChest();
  }
}
