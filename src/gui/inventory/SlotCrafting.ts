import type { EntityPlayer } from '../../entity/EntityPlayer';
import { ItemStack } from '../../item/ItemStack';
import type { IInventory } from './IInventory';
import { Slot } from './Slot';

/** A crafting output slot (SlotCrafting): taking the result uses up one of each ingredient. */
export class SlotCrafting extends Slot {
  private amountCrafted = 0;

  constructor(
    private readonly thePlayer: EntityPlayer,
    private readonly craftMatrix: IInventory,
    result: IInventory,
    slotIndex: number,
    x: number,
    y: number,
  ) {
    super(result, slotIndex, x, y);
  }

  override isItemValid(_stack: ItemStack | null): boolean {
    return false;
  }

  override decrStackSize(n: number): ItemStack | null {
    const s = this.getStack();
    if (s) this.amountCrafted += Math.min(n, s.stackSize);
    return super.decrStackSize(n);
  }

  /** The crafting achievements (workbench, pickaxe, furnace...) would be awarded here. */
  protected override onCrafting(stack: ItemStack, amount?: number): void {
    if (amount !== undefined) this.amountCrafted += amount;
    stack.onCrafting(this.thePlayer.worldObj, this.thePlayer, this.amountCrafted);
    this.amountCrafted = 0;
  }

  override onPickupFromSlot(_player: EntityPlayer, stack: ItemStack | null): void {
    if (stack) this.onCrafting(stack);
    for (let i = 0; i < this.craftMatrix.getSizeInventory(); i++) {
      const s = this.craftMatrix.getStackInSlot(i);
      if (!s) continue;
      this.craftMatrix.decrStackSize(i, 1);
      const item = s.getItem();
      const container = item.getContainerItem();
      if (!container) continue;
      const leftover = new ItemStack(container);
      if (item.doesContainerItemLeaveCraftingGrid(s) && this.thePlayer.inventory.addItemStackToInventory(leftover)) continue;
      if (this.craftMatrix.getStackInSlot(i) === null) this.craftMatrix.setInventorySlotContents(i, leftover);
      else this.thePlayer.dropPlayerItem(leftover);
    }
  }
}
