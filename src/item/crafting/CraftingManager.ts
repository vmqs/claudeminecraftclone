import type { InventoryCrafting } from '../../gui/inventory/InventoryCrafting';
import type { World } from '../../world/World';
import { Item } from '../Item';
import { ItemStack } from '../ItemStack';
import { type IRecipe, WILDCARD_DAMAGE } from './IRecipe';
import { ShapedRecipes } from './ShapedRecipes';
import { ShapelessRecipes } from './ShapelessRecipes';

/** A recipe ingredient: an item, a block (any damage) or an exact stack. */
export type Ingredient = Item | { readonly blockID: number } | ItemStack;

function toStack(ing: Ingredient, blockDamage: number): ItemStack {
  if (ing instanceof ItemStack) return ing.copy();
  if (ing instanceof Item) return new ItemStack(ing);
  return new ItemStack(ing, 1, blockDamage);
}

/**
 * The recipe list (CraftingManager). Recipe modules register through addRecipe /
 * addShapelessRecipe / addRecipeObject at start-up; the list is kept in the original order:
 * shaped before shapeless, bigger recipes first, otherwise registration order.
 */
export class CraftingManager {
  private static readonly instance = new CraftingManager();
  private readonly recipes: IRecipe[] = [];
  private sorted = true;

  static getInstance(): CraftingManager {
    return CraftingManager.instance;
  }

  /**
   * Adds a shaped recipe. `rows` are the pattern lines and `keys` maps each pattern character
   * to an ingredient; spaces and unmapped characters are empty cells. Blocks match any damage.
   */
  addRecipe(output: ItemStack, rows: readonly string[], keys: Readonly<Record<string, Ingredient>>): ShapedRecipes {
    const width = rows.length > 0 ? rows[rows.length - 1].length : 0;
    const pattern = rows.join('');
    const items: (ItemStack | null)[] = [];
    for (let i = 0; i < width * rows.length; i++) {
      const ing = keys[pattern.charAt(i)];
      items.push(ing ? toStack(ing, WILDCARD_DAMAGE) : null);
    }
    const r = new ShapedRecipes(width, rows.length, items, output);
    this.addRecipeObject(r);
    return r;
  }

  /** Adds a shapeless recipe; blocks here match damage 0 only, as in the original. */
  addShapelessRecipe(output: ItemStack, ...ingredients: Ingredient[]): void {
    this.addRecipeObject(new ShapelessRecipes(output, ingredients.map((i) => toStack(i, 0))));
  }

  /** Adds a special recipe (armour dyeing, map cloning, fireworks). */
  addRecipeObject(r: IRecipe): void {
    this.recipes.push(r);
    this.sorted = false;
  }

  /** The result for the grid: repairing two damaged tools of the same kind, or the first match. */
  findMatchingRecipe(grid: InventoryCrafting, world: World | null): ItemStack | null {
    let count = 0;
    let first: ItemStack | null = null;
    let second: ItemStack | null = null;
    for (let i = 0; i < grid.getSizeInventory(); i++) {
      const s = grid.getStackInSlot(i);
      if (!s) continue;
      if (count === 0) first = s;
      if (count === 1) second = s;
      count++;
    }
    if (count === 2 && first && second && first.itemID === second.itemID && first.stackSize === 1 && second.stackSize === 1 && Item.itemsList[first.itemID]?.isDamageable()) {
      const item = Item.itemsList[first.itemID]!;
      const max = item.getMaxDamage();
      const left = max - first.getItemDamageForDisplay();
      const right = max - second.getItemDamageForDisplay();
      const durability = left + right + Math.trunc((max * 5) / 100);
      return new ItemStack(first.itemID, 1, Math.max(0, max - durability));
    }
    for (const r of this.getRecipeList()) if (r.matches(grid, world)) return r.getCraftingResult(grid);
    return null;
  }

  getRecipeList(): readonly IRecipe[] {
    if (!this.sorted) {
      this.recipes.sort(compareRecipes);
      this.sorted = true;
    }
    return this.recipes;
  }
}

/** RecipeSorter */
function compareRecipes(a: IRecipe, b: IRecipe): number {
  if (a instanceof ShapelessRecipes && b instanceof ShapedRecipes) return 1;
  if (b instanceof ShapelessRecipes && a instanceof ShapedRecipes) return -1;
  return b.getRecipeSize() - a.getRecipeSize() < 0 ? -1 : b.getRecipeSize() > a.getRecipeSize() ? 1 : 0;
}
