import type { ItemStack } from '../ItemStack';
import type { IWorld } from '../../world/IWorld';

/** The crafting grid a recipe looks at (InventoryCrafting; any 2x2 or 3x3 grid). */
export interface CraftingGrid {
  getSizeInventory(): number;
  getStackInSlot(slot: number): ItemStack | null;
  /** The stack at column `col`, row `row`; null outside the grid. */
  getStackInRowAndColumn(col: number, row: number): ItemStack | null;
}

/** A crafting recipe (IRecipe): matched against a 2x2 or 3x3 grid. */
export interface IRecipe {
  matches(grid: CraftingGrid, world: IWorld | null): boolean;
  getCraftingResult(grid: CraftingGrid): ItemStack | null;
  /** Number of grid cells the recipe uses (bigger recipes are tried first). */
  getRecipeSize(): number;
  getRecipeOutput(): ItemStack | null;
}

/** Item damage in a recipe ingredient that matches any damage value. */
export const WILDCARD_DAMAGE = 32767;
