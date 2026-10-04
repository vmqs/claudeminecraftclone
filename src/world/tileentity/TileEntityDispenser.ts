import type { EntityPlayer } from '../../entity/EntityPlayer';
import { decrStackInArray, type IInventory, takeStackFromArray } from '../../gui/inventory/IInventory';
import { JavaRandom } from '../../core/JavaRandom';
import type { ItemStack, TagCompound } from '../../item/ItemStack';
import { isUseableByPlayerAt, nbt, readItemsFromNBT, writeItemsToNBT } from './InventoryNBT';
import { TileEntity } from './TileEntity';

/** A dispenser (TileEntityDispenser, savegame id "Trap"): 9 slots. */
export class TileEntityDispenser extends TileEntity implements IInventory {
  private dispenserContents: (ItemStack | null)[] = new Array<ItemStack | null>(9).fill(null);
  private readonly dispenserRandom = new JavaRandom();
  protected customName: string | null = null;

  getSizeInventory(): number {
    return 9;
  }

  getStackInSlot(slot: number): ItemStack | null {
    return this.dispenserContents[slot] ?? null;
  }

  decrStackSize(slot: number, n: number): ItemStack | null {
    if (!this.dispenserContents[slot]) return null;
    const s = decrStackInArray(this.dispenserContents, slot, n);
    this.onInventoryChanged();
    return s;
  }

  getStackInSlotOnClosing(slot: number): ItemStack | null {
    return takeStackFromArray(this.dispenserContents, slot);
  }

  /** A random non-empty slot (reservoir sampling), or -1. */
  getRandomStackFromInventory(): number {
    let slot = -1;
    let n = 1;
    for (let i = 0; i < this.dispenserContents.length; i++) {
      if (this.dispenserContents[i] && this.dispenserRandom.nextInt(n++) === 0) slot = i;
    }
    return slot;
  }

  setInventorySlotContents(slot: number, stack: ItemStack | null): void {
    this.dispenserContents[slot] = stack;
    if (stack && stack.stackSize > this.getInventoryStackLimit()) stack.stackSize = this.getInventoryStackLimit();
    this.onInventoryChanged();
  }

  /** Puts a stack into the first empty slot; returns the slot or -1. */
  addItem(stack: ItemStack): number {
    for (let i = 0; i < this.dispenserContents.length; i++) {
      const s = this.dispenserContents[i];
      if (!s || s.itemID === 0) {
        this.setInventorySlotContents(i, stack);
        return i;
      }
    }
    return -1;
  }

  getInvName(): string {
    return this.isInvNameLocalized() ? this.customName! : 'container.dispenser';
  }

  setCustomName(name: string): void {
    this.customName = name;
  }

  isInvNameLocalized(): boolean {
    return this.customName !== null;
  }

  override readFromNBT(tag: TagCompound): void {
    super.readFromNBT(tag);
    this.dispenserContents = readItemsFromNBT(tag, this.getSizeInventory(), true);
    if (nbt.hasKey(tag, 'CustomName')) this.customName = nbt.getString(tag, 'CustomName');
  }

  override writeToNBT(tag: TagCompound): void {
    super.writeToNBT(tag);
    writeItemsToNBT(tag, this.dispenserContents);
    if (this.isInvNameLocalized()) tag.CustomName = this.customName;
  }

  getInventoryStackLimit(): number {
    return 64;
  }

  isUseableByPlayer(player: EntityPlayer): boolean {
    return isUseableByPlayerAt(this, player);
  }

  openChest(): void {}

  closeChest(): void {}

  isStackValidForSlot(_slot: number, _stack: ItemStack): boolean {
    return true;
  }
}

/** A dropper (TileEntityDropper): a dispenser with its own title. */
export class TileEntityDropper extends TileEntityDispenser {
  override getInvName(): string {
    return this.isInvNameLocalized() ? this.customName! : 'container.dropper';
  }
}
