import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { ItemStack } from '../../item/ItemStack';
import type { Icon } from '../../render/texture/Icon';
import type { IInventory } from './IInventory';

/** One slot of a container window: an inventory index and its position in the GUI. */
export class Slot {
  /** Index in Container.inventorySlots. */
  slotNumber = 0;

  constructor(
    readonly inventory: IInventory,
    readonly slotIndex: number,
    public xDisplayPosition: number,
    public yDisplayPosition: number,
  ) {}

  /** Shift-click from a crafting result: counts the extra items made. */
  onSlotChange(before: ItemStack | null, after: ItemStack | null): void {
    if (!before || !after || before.itemID !== after.itemID) return;
    const n = after.stackSize - before.stackSize;
    if (n > 0) this.onCrafting(before, n);
  }

  protected onCrafting(_stack: ItemStack, _amount?: number): void {}

  onPickupFromSlot(_player: EntityPlayer, _stack: ItemStack | null): void {
    this.onSlotChanged();
  }

  isItemValid(_stack: ItemStack): boolean {
    return true;
  }

  getStack(): ItemStack | null {
    return this.inventory.getStackInSlot(this.slotIndex);
  }

  getHasStack(): boolean {
    return this.getStack() !== null;
  }

  putStack(stack: ItemStack | null): void {
    this.inventory.setInventorySlotContents(this.slotIndex, stack);
    this.onSlotChanged();
  }

  onSlotChanged(): void {
    this.inventory.onInventoryChanged();
  }

  getSlotStackLimit(): number {
    return this.inventory.getInventoryStackLimit();
  }

  /** Greyed-out icon of an empty slot (armour slots). */
  getBackgroundIconIndex(): Icon | null {
    return null;
  }

  decrStackSize(n: number): ItemStack | null {
    return this.inventory.decrStackSize(this.slotIndex, n);
  }

  isSlotInInventory(inv: IInventory, index: number): boolean {
    return inv === this.inventory && index === this.slotIndex;
  }

  canTakeStack(_player: EntityPlayer): boolean {
    return true;
  }
}
