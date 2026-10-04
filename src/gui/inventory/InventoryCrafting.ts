import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { ItemStack } from '../../item/ItemStack';
import type { Container } from './Container';
import { decrStackInArray, type IInventory, takeStackFromArray } from './IInventory';

/** A crafting grid (InventoryCrafting); every change re-matches the recipe through the container. */
export class InventoryCrafting implements IInventory {
  private readonly stackList: (ItemStack | null)[];

  constructor(
    private readonly eventHandler: Container,
    private readonly inventoryWidth: number,
    height: number,
  ) {
    this.stackList = new Array<ItemStack | null>(inventoryWidth * height).fill(null);
  }

  getSizeInventory(): number {
    return this.stackList.length;
  }

  getStackInSlot(slot: number): ItemStack | null {
    return slot >= this.getSizeInventory() ? null : this.stackList[slot];
  }

  getStackInRowAndColumn(col: number, row: number): ItemStack | null {
    if (col < 0 || col >= this.inventoryWidth) return null;
    return this.getStackInSlot(col + row * this.inventoryWidth);
  }

  getInvName(): string {
    return 'container.crafting';
  }

  isInvNameLocalized(): boolean {
    return false;
  }

  getStackInSlotOnClosing(slot: number): ItemStack | null {
    return takeStackFromArray(this.stackList, slot);
  }

  decrStackSize(slot: number, n: number): ItemStack | null {
    if (!this.stackList[slot]) return null;
    const s = decrStackInArray(this.stackList, slot, n);
    this.eventHandler.onCraftMatrixChanged(this);
    return s;
  }

  setInventorySlotContents(slot: number, stack: ItemStack | null): void {
    this.stackList[slot] = stack;
    this.eventHandler.onCraftMatrixChanged(this);
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
