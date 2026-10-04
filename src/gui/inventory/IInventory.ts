import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { ItemStack } from '../../item/ItemStack';

/** Anything with item slots (IInventory): the player, chests, furnaces, crafting grids. */
export interface IInventory {
  getSizeInventory(): number;
  getStackInSlot(slot: number): ItemStack | null;
  /** Removes up to `n` items from a slot and returns them. */
  decrStackSize(slot: number, n: number): ItemStack | null;
  /** Empties a slot when its GUI closes (crafting grids), returning the stack. */
  getStackInSlotOnClosing(slot: number): ItemStack | null;
  setInventorySlotContents(slot: number, stack: ItemStack | null): void;
  getInvName(): string;
  /** True when getInvName() is already display text (named chests), not a translation key. */
  isInvNameLocalized(): boolean;
  getInventoryStackLimit(): number;
  onInventoryChanged(): void;
  isUseableByPlayer(player: EntityPlayer): boolean;
  openChest(): void;
  closeChest(): void;
  isStackValidForSlot(slot: number, stack: ItemStack): boolean;
}

/** The usual decrStackSize over a slot array: takes the whole stack or splits `n` off it. */
export function decrStackInArray(stacks: (ItemStack | null)[], slot: number, n: number): ItemStack | null {
  const s = stacks[slot];
  if (!s) return null;
  if (s.stackSize <= n) {
    stacks[slot] = null;
    return s;
  }
  const taken = s.splitStack(n);
  if (s.stackSize === 0) stacks[slot] = null;
  return taken;
}

/** The usual getStackInSlotOnClosing over a slot array: empties the slot. */
export function takeStackFromArray(stacks: (ItemStack | null)[], slot: number): ItemStack | null {
  const s = stacks[slot];
  stacks[slot] = null;
  return s ?? null;
}
