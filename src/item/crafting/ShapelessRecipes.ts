import type { ItemStack } from '../ItemStack';
import { type CraftingGrid, type IRecipe, WILDCARD_DAMAGE } from './IRecipe';

/** A recipe that only needs its ingredients somewhere in the grid. */
export class ShapelessRecipes implements IRecipe {
  constructor(
    private readonly recipeOutput: ItemStack,
    private readonly recipeItems: readonly ItemStack[],
  ) {}

  getRecipeOutput(): ItemStack {
    return this.recipeOutput;
  }

  matches(grid: CraftingGrid): boolean {
    const needed = [...this.recipeItems];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const have = grid.getStackInRowAndColumn(col, row);
        if (!have) continue;
        const i = needed.findIndex((n) => n.itemID === have.itemID && (n.getItemDamage() === WILDCARD_DAMAGE || n.getItemDamage() === have.getItemDamage()));
        if (i < 0) return false;
        needed.splice(i, 1);
      }
    }
    return needed.length === 0;
  }

  getCraftingResult(): ItemStack {
    return this.recipeOutput.copy();
  }

  getRecipeSize(): number {
    return this.recipeItems.length;
  }
}
