import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { ItemStack } from '../../item/ItemStack';
import type { Icon } from '../../render/texture/Icon';
import type { IInventory } from './IInventory';
import { Slot } from './Slot';

/**
 * A slot of the player's own inventory window shown on the creative Survival Inventory tab
 * (SlotCreativeInventory): every query goes to the wrapped slot; only the position differs.
 */
export class SlotCreativeInventory extends Slot {
  constructor(
    readonly theSlot: Slot,
    index: number,
  ) {
    super(theSlot.inventory, index, 0, 0);
  }

  override onPickupFromSlot(player: EntityPlayer, stack: ItemStack | null): void {
    this.theSlot.onPickupFromSlot(player, stack);
  }

  override isItemValid(stack: ItemStack): boolean {
    return this.theSlot.isItemValid(stack);
  }

  override getStack(): ItemStack | null {
    return this.theSlot.getStack();
  }

  override getHasStack(): boolean {
    return this.theSlot.getHasStack();
  }

  override putStack(stack: ItemStack | null): void {
    this.theSlot.putStack(stack);
  }

  override onSlotChanged(): void {
    this.theSlot.onSlotChanged();
  }

  override getSlotStackLimit(): number {
    return this.theSlot.getSlotStackLimit();
  }

  override getBackgroundIconIndex(): Icon | null {
    return this.theSlot.getBackgroundIconIndex();
  }

  override decrStackSize(n: number): ItemStack | null {
    return this.theSlot.decrStackSize(n);
  }

  override isSlotInInventory(inv: IInventory, index: number): boolean {
    return this.theSlot.isSlotInInventory(inv, index);
  }
}
