import type { InventoryCrafting } from '../../gui/inventory/InventoryCrafting';
import type { ItemStack } from '../ItemStack';
import type { World } from '../../world/World';

/** A crafting recipe (IRecipe): matched against a 2x2 or 3x3 grid. */
export interface IRecipe {
  matches(grid: InventoryCrafting, world: World | null): boolean;
  getCraftingResult(grid: InventoryCrafting): ItemStack | null;
  /** Number of grid cells the recipe uses (bigger recipes are tried first). */
  getRecipeSize(): number;
  getRecipeOutput(): ItemStack | null;
}

/** Item damage in a recipe ingredient that matches any damage value. */
export const WILDCARD_DAMAGE = 32767;
