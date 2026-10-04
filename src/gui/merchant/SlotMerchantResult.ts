import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { IMerchant } from '../../entity/merchant/IMerchant';
import type { MerchantRecipe } from '../../entity/merchant/MerchantRecipe';
import type { ItemStack } from '../../item/ItemStack';
import { Slot } from '../inventory/Slot';
import type { InventoryMerchant } from './InventoryMerchant';

/**
 * The trade result slot (SlotMerchantResult): nothing can be put in; taking the result pays for
 * the trade out of the payment slots and tells the merchant the trade was used.
 */
export class SlotMerchantResult extends Slot {
  private amountTaken = 0;

  constructor(
    private readonly thePlayer: EntityPlayer,
    private readonly theMerchant: IMerchant,
    private readonly theMerchantInventory: InventoryMerchant,
    slotIndex: number,
    x: number,
    y: number,
  ) {
    super(theMerchantInventory, slotIndex, x, y);
  }

  override isItemValid(_stack: ItemStack): boolean {
    return false;
  }

  override decrStackSize(n: number): ItemStack | null {
    const s = this.getStack();
    if (s) this.amountTaken += Math.min(n, s.stackSize);
    return super.decrStackSize(n);
  }

  protected override onCrafting(stack: ItemStack, amount?: number): void {
    if (amount !== undefined) this.amountTaken += amount;
    stack.onCrafting(this.thePlayer.worldObj, this.thePlayer, this.amountTaken);
    this.amountTaken = 0;
  }

  override onPickupFromSlot(_player: EntityPlayer, stack: ItemStack | null): void {
    if (stack) this.onCrafting(stack);
    const recipe = this.theMerchantInventory.getCurrentRecipe();
    if (!recipe) return;
    let a = this.theMerchantInventory.getStackInSlot(0);
    let b = this.theMerchantInventory.getStackInSlot(1);
    if (!SlotMerchantResult.pay(recipe, a, b) && !SlotMerchantResult.pay(recipe, b, a)) return;
    if (a !== null && a.stackSize <= 0) a = null;
    if (b !== null && b.stackSize <= 0) b = null;
    this.theMerchantInventory.setInventorySlotContents(0, a);
    this.theMerchantInventory.setInventorySlotContents(1, b);
    this.theMerchant.useRecipe(recipe);
  }

  /** func_75230_a: takes the price from `first` (and `second`) when they match the trade. */
  private static pay(r: MerchantRecipe, first: ItemStack | null, second: ItemStack | null): boolean {
    const buy = r.getItemToBuy();
    const buy2 = r.getSecondItemToBuy();
    if (first === null || first.itemID !== buy.itemID) return false;
    if (buy2 !== null && second !== null && buy2.itemID === second.itemID) {
      first.stackSize -= buy.stackSize;
      second.stackSize -= buy2.stackSize;
      return true;
    }
    if (buy2 === null && second === null) {
      first.stackSize -= buy.stackSize;
      return true;
    }
    return false;
  }
}
