import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { ItemStack } from '../../item/ItemStack';
import type { IInventory } from './IInventory';

/** The single crafting output slot (InventoryCraftResult); taking always takes the whole stack. */
export class InventoryCraftResult implements IInventory {
  private stackResult: ItemStack | null = null;

  getSizeInventory(): number {
    return 1;
  }

  getStackInSlot(_slot: number): ItemStack | null {
    return this.stackResult;
  }

  getInvName(): string {
    return 'Result';
  }

  isInvNameLocalized(): boolean {
    return false;
  }

  decrStackSize(_slot: number, _n: number): ItemStack | null {
    return this.getStackInSlotOnClosing(0);
  }

  getStackInSlotOnClosing(_slot: number): ItemStack | null {
    const s = this.stackResult;
    this.stackResult = null;
    return s;
  }

  setInventorySlotContents(_slot: number, stack: ItemStack | null): void {
    this.stackResult = stack;
  }

  getInventoryStackLimit(): number {
    return 64;
  }

  onInventoryChanged(): void {}

  isUseableByPlayer(_player: EntityPlayer): boolean {
    return true;
  }

  openChest(): void {}

  closeChest(): void {}

  isStackValidForSlot(_slot: number, _stack: ItemStack): boolean {
    return true;
  }
}
