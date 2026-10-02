import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { IMerchant } from '../../entity/merchant/IMerchant';
import type { MerchantRecipe } from '../../entity/merchant/MerchantRecipe';
import type { ItemStack } from '../../item/ItemStack';
import type { IInventory } from '../inventory/IInventory';

/**
 * The trading window's three slots (InventoryMerchant): two payment slots and the result. Any
 * change to a payment slot looks up the trade they pay for (the selected page first) and puts a
 * copy of what it sells in the result slot.
 */
export class InventoryMerchant implements IInventory {
  private readonly theInventory: (ItemStack | null)[] = [null, null, null];
  private currentRecipe: MerchantRecipe | null = null;
  private currentRecipeIndex = 0;

  constructor(
    private readonly thePlayer: EntityPlayer,
    private readonly theMerchant: IMerchant,
  ) {}

  getSizeInventory(): number {
    return this.theInventory.length;
  }

  getStackInSlot(slot: number): ItemStack | null {
    return this.theInventory[slot] ?? null;
  }

  /** The result slot hands over its whole stack; payment slots recompute the trade. */
  decrStackSize(slot: number, n: number): ItemStack | null {
    const s = this.theInventory[slot];
    if (!s) return null;
    if (slot === 2) {
      this.theInventory[slot] = null;
      return s;
    }
    if (s.stackSize <= n) {
      this.theInventory[slot] = null;
      if (this.isPaymentSlot(slot)) this.resetRecipeAndSlots();
      return s;
    }
    const taken = s.splitStack(n);
    if (s.stackSize === 0) this.theInventory[slot] = null;
    if (this.isPaymentSlot(slot)) this.resetRecipeAndSlots();
    return taken;
  }

  private isPaymentSlot(slot: number): boolean {
    return slot === 0 || slot === 1;
  }

  getStackInSlotOnClosing(slot: number): ItemStack | null {
    const s = this.theInventory[slot];
    if (!s) return null;
    this.theInventory[slot] = null;
    return s;
  }

  setInventorySlotContents(slot: number, stack: ItemStack | null): void {
    this.theInventory[slot] = stack;
    if (stack && stack.stackSize > this.getInventoryStackLimit()) stack.stackSize = this.getInventoryStackLimit();
    if (this.isPaymentSlot(slot)) this.resetRecipeAndSlots();
  }

  getInvName(): string {
    return 'mob.villager';
  }

  isInvNameLocalized(): boolean {
    return false;
  }

  getInventoryStackLimit(): number {
    return 64;
  }

  isUseableByPlayer(player: EntityPlayer): boolean {
    return this.theMerchant.getCustomer() === player;
  }

  openChest(): void {}

  closeChest(): void {}

  isStackValidForSlot(_slot: number, _stack: ItemStack): boolean {
    return true;
  }

  onInventoryChanged(): void {
    this.resetRecipeAndSlots();
  }

  /** Finds the trade the payment pays for (either order) unless it is used up. */
  resetRecipeAndSlots(): void {
    this.currentRecipe = null;
    let first = this.theInventory[0];
    let second = this.theInventory[1];
    if (first === null) {
      first = second;
      second = null;
    }
    if (first === null) {
      this.setInventorySlotContents(2, null);
      return;
    }
    const list = this.theMerchant.getRecipes(this.thePlayer);
    if (!list) return;
    let r = list.canRecipeBeUsed(first, second, this.currentRecipeIndex);
    if (r && !r.isRecipeDisabled()) {
      this.currentRecipe = r;
      this.setInventorySlotContents(2, r.getItemToSell().copy());
    } else if (second !== null) {
      r = list.canRecipeBeUsed(second, first, this.currentRecipeIndex);
      if (r && !r.isRecipeDisabled()) {
        this.currentRecipe = r;
        this.setInventorySlotContents(2, r.getItemToSell().copy());
      } else {
        this.setInventorySlotContents(2, null);
      }
    } else {
      this.setInventorySlotContents(2, null);
    }
  }

  getCurrentRecipe(): MerchantRecipe | null {
    return this.currentRecipe;
  }

  setCurrentRecipeIndex(i: number): void {
    this.currentRecipeIndex = i;
    this.resetRecipeAndSlots();
  }
}
