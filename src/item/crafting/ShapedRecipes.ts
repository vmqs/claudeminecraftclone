import type { InventoryCrafting } from '../../gui/inventory/InventoryCrafting';
import type { ItemStack } from '../ItemStack';
import { type IRecipe, WILDCARD_DAMAGE } from './IRecipe';

/** A recipe with a fixed layout, matched at any offset in the grid and also mirrored. */
export class ShapedRecipes implements IRecipe {
  readonly recipeOutputItemID: number;
  /** Copies the ingredients' NBT onto the result (func_92100_c; used by the fireworks star fade). */
  private copyIngredientNBT = false;

  constructor(
    private readonly recipeWidth: number,
    private readonly recipeHeight: number,
    private readonly recipeItems: (ItemStack | null)[],
    private readonly recipeOutput: ItemStack,
  ) {
    this.recipeOutputItemID = recipeOutput.itemID;
  }

  getRecipeOutput(): ItemStack {
    return this.recipeOutput;
  }

  matches(grid: InventoryCrafting): boolean {
    for (let dx = 0; dx <= 3 - this.recipeWidth; dx++) {
      for (let dy = 0; dy <= 3 - this.recipeHeight; dy++) {
        if (this.checkMatch(grid, dx, dy, true) || this.checkMatch(grid, dx, dy, false)) return true;
      }
    }
    return false;
  }

  private checkMatch(grid: InventoryCrafting, dx: number, dy: number, mirrored: boolean): boolean {
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 3; row++) {
        const rx = col - dx;
        const ry = row - dy;
        let want: ItemStack | null = null;
        if (rx >= 0 && ry >= 0 && rx < this.recipeWidth && ry < this.recipeHeight) {
          want = this.recipeItems[(mirrored ? this.recipeWidth - rx - 1 : rx) + ry * this.recipeWidth];
        }
        const have = grid.getStackInRowAndColumn(col, row);
        if (!have && !want) continue;
        if (!have || !want || want.itemID !== have.itemID) return false;
        if (want.getItemDamage() !== WILDCARD_DAMAGE && want.getItemDamage() !== have.getItemDamage()) return false;
      }
    }
    return true;
  }

  getCraftingResult(grid: InventoryCrafting): ItemStack {
    const out = this.recipeOutput.copy();
    if (this.copyIngredientNBT) {
      for (let i = 0; i < grid.getSizeInventory(); i++) {
        const s = grid.getStackInSlot(i);
        if (s?.stackTagCompound) out.setTagCompound(structuredClone(s.stackTagCompound));
      }
    }
    return out;
  }

  getRecipeSize(): number {
    return this.recipeWidth * this.recipeHeight;
  }

  /** func_92100_c */
  setCopyIngredientNBT(): this {
    this.copyIngredientNBT = true;
    return this;
  }
}
