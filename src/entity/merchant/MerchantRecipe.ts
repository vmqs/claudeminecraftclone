import { ItemStack } from '../../item/ItemStack';
import type { TagCompound } from '../../item/ItemStack';
import { NBT } from '../../world/storage/NBT';

/**
 * One villager trade (MerchantRecipe): one or two stacks to pay, the stack received, and how
 * often it was used; a trade locks after `maxTradeUses` uses (7, raised by 2-12 on restock).
 */
export class MerchantRecipe {
  private toolUses = 0;
  private maxTradeUses = 7;

  constructor(
    private readonly itemToBuy: ItemStack,
    private readonly secondItemToBuy: ItemStack | null,
    private readonly itemToSell: ItemStack,
  ) {}

  /** MerchantRecipe(buy, sell) and MerchantRecipe(buy, item). */
  static of(buy: ItemStack, sell: ItemStack | number): MerchantRecipe {
    return new MerchantRecipe(buy, null, typeof sell === 'number' ? new ItemStack(sell) : sell);
  }

  getItemToBuy(): ItemStack {
    return this.itemToBuy;
  }

  getSecondItemToBuy(): ItemStack | null {
    return this.secondItemToBuy;
  }

  hasSecondItemToBuy(): boolean {
    return this.secondItemToBuy !== null;
  }

  getItemToSell(): ItemStack {
    return this.itemToSell;
  }

  /** Same item IDs in every position. */
  hasSameIDsAs(o: MerchantRecipe): boolean {
    if (this.itemToBuy.itemID !== o.itemToBuy.itemID || this.itemToSell.itemID !== o.itemToSell.itemID) return false;
    return (this.secondItemToBuy === null && o.secondItemToBuy === null) || (this.secondItemToBuy !== null && o.secondItemToBuy !== null && this.secondItemToBuy.itemID === o.secondItemToBuy.itemID);
  }

  /** Same IDs and a cheaper price. */
  hasSameItemsAs(o: MerchantRecipe): boolean {
    return this.hasSameIDsAs(o) && (this.itemToBuy.stackSize < o.itemToBuy.stackSize || (this.secondItemToBuy !== null && this.secondItemToBuy.stackSize < o.secondItemToBuy!.stackSize));
  }

  incrementToolUses(): void {
    this.toolUses++;
  }

  /** func_82783_a: more uses before the trade locks. */
  increaseMaxTradeUses(n: number): void {
    this.maxTradeUses += n;
  }

  /** func_82784_g: used up (shown crossed out). */
  isRecipeDisabled(): boolean {
    return this.toolUses >= this.maxTradeUses;
  }

  /** func_82785_h */
  disableRecipe(): void {
    this.toolUses = this.maxTradeUses;
  }

  /** writeToTags: {buy, buyB?, sell, uses, maxUses}. */
  writeToTags(): TagCompound {
    const t: TagCompound = {};
    NBT.setCompoundTag(t, 'buy', this.itemToBuy.writeToNBT());
    NBT.setCompoundTag(t, 'sell', this.itemToSell.writeToNBT());
    if (this.secondItemToBuy) NBT.setCompoundTag(t, 'buyB', this.secondItemToBuy.writeToNBT());
    NBT.setInteger(t, 'uses', this.toolUses);
    NBT.setInteger(t, 'maxUses', this.maxTradeUses);
    return t;
  }

  /** MerchantRecipe(NBTTagCompound); null when an item is unknown. */
  static fromTags(t: TagCompound): MerchantRecipe | null {
    const buy = ItemStack.loadItemStackFromNBT(NBT.getCompoundTag(t, 'buy'));
    const sell = ItemStack.loadItemStackFromNBT(NBT.getCompoundTag(t, 'sell'));
    if (!buy || !sell) return null;
    const buyB = NBT.hasKey(t, 'buyB') ? ItemStack.loadItemStackFromNBT(NBT.getCompoundTag(t, 'buyB')) : null;
    const r = new MerchantRecipe(buy, buyB, sell);
    if (NBT.hasKey(t, 'uses')) r.toolUses = NBT.getInteger(t, 'uses');
    r.maxTradeUses = NBT.hasKey(t, 'maxUses') ? NBT.getInteger(t, 'maxUses') : 7;
    return r;
  }
}
