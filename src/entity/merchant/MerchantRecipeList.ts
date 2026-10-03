import type { ItemStack } from '../../item/ItemStack';
import type { TagCompound } from '../../item/ItemStack';
import { NBT, NBTType } from '../../world/storage/NBT';
import { MerchantRecipe } from './MerchantRecipe';

/** A villager's trades in offer order (MerchantRecipeList). */
export class MerchantRecipeList extends Array<MerchantRecipe> {
  /**
   * The trade the two input stacks pay for: the trade at `index` (when 1 or more) or else the
   * first one they satisfy, or null.
   */
  canRecipeBeUsed(first: ItemStack, second: ItemStack | null, index: number): MerchantRecipe | null {
    if (index > 0 && index < this.length) {
      const r = this[index];
      if (first.itemID !== r.getItemToBuy().itemID) return null;
      if ((second !== null || r.hasSecondItemToBuy()) && (!r.hasSecondItemToBuy() || second === null || r.getSecondItemToBuy()!.itemID !== second.itemID)) return null;
      if (first.stackSize < r.getItemToBuy().stackSize) return null;
      if (r.hasSecondItemToBuy() && second!.stackSize < r.getSecondItemToBuy()!.stackSize) return null;
      return r;
    }
    for (const r of this) {
      if (first.itemID !== r.getItemToBuy().itemID || first.stackSize < r.getItemToBuy().stackSize) continue;
      if (!r.hasSecondItemToBuy() && second === null) return r;
      const b = r.getSecondItemToBuy();
      if (b && second && b.itemID === second.itemID && second.stackSize >= b.stackSize) return r;
    }
    return null;
  }

  /** Adds a trade unless one with the same items exists (a cheaper one replaces it). */
  addToListWithCheck(r: MerchantRecipe): void {
    for (let i = 0; i < this.length; i++) {
      const o = this[i];
      if (r.hasSameIDsAs(o)) {
        if (r.hasSameItemsAs(o)) this[i] = r;
        return;
      }
    }
    this.push(r);
  }

  /** getRecipiesAsTags: {Recipes: [...]}. */
  getRecipiesAsTags(): TagCompound {
    const t: TagCompound = {};
    NBT.setList(t, 'Recipes', NBTType.Compound, this.map((r) => r.writeToTags()));
    return t;
  }

  /** MerchantRecipeList(NBTTagCompound). */
  static fromTags(t: TagCompound): MerchantRecipeList {
    const list = new MerchantRecipeList();
    for (const r of NBT.getCompoundList(t, 'Recipes')) {
      const recipe = MerchantRecipe.fromTags(r);
      if (recipe) list.push(recipe);
    }
    return list;
  }
}
