import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { IInventory } from '../../gui/inventory/IInventory';
import type { ItemStack } from '../../item/ItemStack';

/** Two chests seen as one 54-slot inventory (InventoryLargeChest); the first half is the upper rows. */
export class InventoryLargeChest implements IInventory {
  private readonly upperChest: IInventory;
  private readonly lowerChest: IInventory;

  constructor(
    private readonly name: string,
    upper: IInventory | null,
    lower: IInventory | null,
  ) {
    this.upperChest = (upper ?? lower)!;
    this.lowerChest = (lower ?? upper)!;
  }

  getSizeInventory(): number {
    return this.upperChest.getSizeInventory() + this.lowerChest.getSizeInventory();
  }

  isPartOfLargeChest(inv: IInventory): boolean {
    return this.upperChest === inv || this.lowerChest === inv;
  }

  getInvName(): string {
    if (this.upperChest.isInvNameLocalized()) return this.upperChest.getInvName();
    return this.lowerChest.isInvNameLocalized() ? this.lowerChest.getInvName() : this.name;
  }

  isInvNameLocalized(): boolean {
    return this.upperChest.isInvNameLocalized() || this.lowerChest.isInvNameLocalized();
  }

  private split<T>(slot: number, upper: (i: number) => T, lower: (i: number) => T): T {
    const n = this.upperChest.getSizeInventory();
    return slot >= n ? lower(slot - n) : upper(slot);
  }

  getStackInSlot(slot: number): ItemStack | null {
    return this.split(slot, (i) => this.upperChest.getStackInSlot(i), (i) => this.lowerChest.getStackInSlot(i));
  }

  decrStackSize(slot: number, n: number): ItemStack | null {
    return this.split(slot, (i) => this.upperChest.decrStackSize(i, n), (i) => this.lowerChest.decrStackSize(i, n));
  }

  getStackInSlotOnClosing(slot: number): ItemStack | null {
    return this.split(slot, (i) => this.upperChest.getStackInSlotOnClosing(i), (i) => this.lowerChest.getStackInSlotOnClosing(i));
  }

  setInventorySlotContents(slot: number, stack: ItemStack | null): void {
    this.split(slot, (i) => this.upperChest.setInventorySlotContents(i, stack), (i) => this.lowerChest.setInventorySlotContents(i, stack));
  }

  getInventoryStackLimit(): number {
    return this.upperChest.getInventoryStackLimit();
  }

  onInventoryChanged(): void {
    this.upperChest.onInventoryChanged();
    this.lowerChest.onInventoryChanged();
  }

  isUseableByPlayer(player: EntityPlayer): boolean {
    return this.upperChest.isUseableByPlayer(player) && this.lowerChest.isUseableByPlayer(player);
  }

  openChest(): void {
    this.upperChest.openChest();
    this.lowerChest.openChest();
  }

  closeChest(): void {
    this.upperChest.closeChest();
    this.lowerChest.closeChest();
  }

  isStackValidForSlot(_slot: number, _stack: ItemStack): boolean {
    return true;
  }
}
