import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { ItemStack } from '../../item/ItemStack';
import { Container } from './Container';
import type { IInventory } from './IInventory';
import { Slot } from './Slot';

/** A chest-like window (ContainerChest): rows of 9 above the player's inventory. */
export class ContainerChest extends Container {
  private readonly numRows: number;

  constructor(
    playerInv: IInventory,
    private readonly lowerChestInventory: IInventory,
  ) {
    super();
    this.numRows = Math.trunc(lowerChestInventory.getSizeInventory() / 9);
    lowerChestInventory.openChest();
    const shift = (this.numRows - 4) * 18;
    for (let row = 0; row < this.numRows; row++) {
      for (let col = 0; col < 9; col++) this.addSlotToContainer(new Slot(lowerChestInventory, col + row * 9, 8 + col * 18, 18 + row * 18));
    }
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 9; col++) this.addSlotToContainer(new Slot(playerInv, col + row * 9 + 9, 8 + col * 18, 103 + row * 18 + shift));
    }
    for (let col = 0; col < 9; col++) this.addSlotToContainer(new Slot(playerInv, col, 8 + col * 18, 161 + shift));
  }

  canInteractWith(player: EntityPlayer): boolean {
    return this.lowerChestInventory.isUseableByPlayer(player);
  }

  override transferStackInSlot(_player: EntityPlayer, index: number): ItemStack | null {
    const slot = this.inventorySlots[index];
    if (!slot || !slot.getHasStack()) return null;
    const stack = slot.getStack()!;
    const before = stack.copy();
    const chestSlots = this.numRows * 9;
    const moved = index < chestSlots ? this.mergeItemStack(stack, chestSlots, this.inventorySlots.length, true) : this.mergeItemStack(stack, 0, chestSlots, false);
    if (!moved) return null;
    if (stack.stackSize === 0) slot.putStack(null);
    else slot.onSlotChanged();
    return before;
  }

  override onCraftGuiClosed(player: EntityPlayer): void {
    super.onCraftGuiClosed(player);
    this.lowerChestInventory.closeChest();
  }

  getLowerChestInventory(): IInventory {
    return this.lowerChestInventory;
  }
}
