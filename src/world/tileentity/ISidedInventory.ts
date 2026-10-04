import type { IInventory } from '../../gui/inventory/IInventory';
import type { ItemStack } from '../../item/ItemStack';

/** An inventory whose slots depend on the face hoppers use (ISidedInventory: furnace, brewing stand). */
export interface ISidedInventory extends IInventory {
  getAccessibleSlotsFromSide(side: number): readonly number[];
  canInsertItem(slot: number, stack: ItemStack, side: number): boolean;
  canExtractItem(slot: number, stack: ItemStack, side: number): boolean;
}

export function isSidedInventory(inv: IInventory): inv is ISidedInventory {
  return typeof (inv as Partial<ISidedInventory>).getAccessibleSlotsFromSide === 'function';
}

export function isInventory(o: unknown): o is IInventory {
  return typeof (o as Partial<IInventory> | null)?.getSizeInventory === 'function' && typeof (o as Partial<IInventory>).getStackInSlot === 'function';
}
