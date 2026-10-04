import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { ItemStack } from '../../item/ItemStack';
import type { IInvBasic } from './IInvBasic';
import { decrStackInArray, type IInventory, takeStackFromArray } from './IInventory';

/** A plain fixed-size inventory (InventoryBasic): the creative grid, minecart chests' temp inventories. */
export class InventoryBasic implements IInventory {
  private readonly inventoryContents: (ItemStack | null)[];
  private listeners: IInvBasic[] | null = null;

  constructor(
    private readonly inventoryTitle: string,
    private readonly localizedTitle: boolean,
    private readonly slotsCount: number,
  ) {
    this.inventoryContents = new Array<ItemStack | null>(slotsCount).fill(null);
  }

  /** Registers an IInvBasic listener. */
  addListener(l: IInvBasic): void {
    (this.listeners ??= []).push(l);
  }

  getStackInSlot(slot: number): ItemStack | null {
    return this.inventoryContents[slot] ?? null;
  }

  decrStackSize(slot: number, n: number): ItemStack | null {
    const had = this.inventoryContents[slot] !== null;
    const s = decrStackInArray(this.inventoryContents, slot, n);
    if (had) this.onInventoryChanged();
    return s;
  }

  getStackInSlotOnClosing(slot: number): ItemStack | null {
    return takeStackFromArray(this.inventoryContents, slot);
  }

  setInventorySlotContents(slot: number, stack: ItemStack | null): void {
    this.inventoryContents[slot] = stack;
    if (stack && stack.stackSize > this.getInventoryStackLimit()) stack.stackSize = this.getInventoryStackLimit();
    this.onInventoryChanged();
  }

  getSizeInventory(): number {
    return this.slotsCount;
  }

  getInvName(): string {
    return this.inventoryTitle;
  }

  isInvNameLocalized(): boolean {
    return this.localizedTitle;
  }

  getInventoryStackLimit(): number {
    return 64;
  }

  onInventoryChanged(): void {
    if (this.listeners) for (const l of this.listeners) l.onInventoryChanged(this);
  }

  isUseableByPlayer(_player: EntityPlayer): boolean {
    return true;
  }

  openChest(): void {}

  closeChest(): void {}

  isStackValidForSlot(_slot: number, _stack: ItemStack): boolean {
    return true;
  }
}
