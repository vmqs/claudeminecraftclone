import { ItemIds } from '../../block/BlockIds';
import type { IWorld } from '../../world/IWorld';
import { Item } from '../Item';
import { ItemArmor, EnumArmorMaterial } from '../ItemArmor';
import { ItemDye } from '../ItemDye';
import { ItemMap } from '../ItemMap';
import { ItemStack, type TagCompound } from '../ItemStack';
import { type CraftingGrid, type IRecipe, WILDCARD_DAMAGE } from './IRecipe';
import { ShapedRecipes } from './ShapedRecipes';

const f = Math.fround;

/** EntitySheep.fleeceColorTable: wool colours by wool metadata (used to mix leather dyes). */
export const FLEECE_COLOR_TABLE: readonly (readonly [number, number, number])[] = [
  [1.0, 1.0, 1.0],
  [0.85, 0.5, 0.2],
  [0.7, 0.3, 0.85],
  [0.4, 0.6, 0.85],
  [0.9, 0.9, 0.2],
  [0.5, 0.8, 0.1],
  [0.95, 0.5, 0.65],
  [0.3, 0.3, 0.3],
  [0.6, 0.6, 0.6],
  [0.3, 0.5, 0.6],
  [0.5, 0.25, 0.7],
  [0.2, 0.3, 0.7],
  [0.4, 0.3, 0.2],
  [0.4, 0.5, 0.2],
  [0.6, 0.2, 0.2],
  [0.1, 0.1, 0.1],
].map(([r, g, b]) => [f(r), f(g), f(b)] as const);

function leather(stack: ItemStack): ItemArmor | null {
  const item = stack.getItem();
  return item instanceof ItemArmor ? item : null;
}

/** Leather armour + dyes: the averaged colour keeps the brightest channel's intensity. */
export class RecipesArmorDyes implements IRecipe {
  matches(grid: CraftingGrid): boolean {
    let armor: ItemStack | null = null;
    let dyes = 0;
    for (let i = 0; i < grid.getSizeInventory(); i++) {
      const s = grid.getStackInSlot(i);
      if (!s) continue;
      const a = leather(s);
      if (a) {
        if (a.getArmorMaterial() !== EnumArmorMaterial.CLOTH || armor) return false;
        armor = s;
      } else {
        if (s.itemID !== ItemIds.dyePowder) return false;
        dyes++;
      }
    }
    return armor !== null && dyes > 0;
  }

  getCraftingResult(grid: CraftingGrid): ItemStack | null {
    let result: ItemStack | null = null;
    const sum = [0, 0, 0];
    let maxSum = 0;
    let count = 0;
    let armor: ItemArmor | null = null;
    for (let i = 0; i < grid.getSizeInventory(); i++) {
      const s = grid.getStackInSlot(i);
      if (!s) continue;
      const a = leather(s);
      if (a) {
        armor = a;
        if (a.getArmorMaterial() !== EnumArmorMaterial.CLOTH || result) return null;
        result = s.copy();
        result.stackSize = 1;
        if (a.hasColor(s)) {
          const c = a.getColor(result);
          const r = f(((c >> 16) & 255) / 255);
          const g = f(((c >> 8) & 255) / 255);
          const b = f((c & 255) / 255);
          maxSum = Math.trunc(f(maxSum + f(Math.max(r, Math.max(g, b)) * 255)));
          sum[0] = Math.trunc(f(sum[0] + f(r * 255)));
          sum[1] = Math.trunc(f(sum[1] + f(g * 255)));
          sum[2] = Math.trunc(f(sum[2] + f(b * 255)));
          count++;
        }
      } else {
        if (s.itemID !== ItemIds.dyePowder) return null;
        const rgb = FLEECE_COLOR_TABLE[~s.getItemDamage() & 15];
        const r = Math.trunc(f(rgb[0] * 255));
        const g = Math.trunc(f(rgb[1] * 255));
        const b = Math.trunc(f(rgb[2] * 255));
        maxSum += Math.max(r, Math.max(g, b));
        sum[0] += r;
        sum[1] += g;
        sum[2] += b;
        count++;
      }
    }
    if (!armor || !result) return null;
    let r = Math.trunc(sum[0] / count);
    let g = Math.trunc(sum[1] / count);
    let b = Math.trunc(sum[2] / count);
    const avgMax = f(maxSum / count);
    const max = f(Math.max(r, Math.max(g, b)));
    r = Math.trunc(f(f(r * avgMax) / max));
    g = Math.trunc(f(f(g * avgMax) / max));
    b = Math.trunc(f(f(b * avgMax) / max));
    armor.setColor(result, (((r << 8) + g) << 8) + b);
    return result;
  }

  getRecipeSize(): number {
    return 10;
  }
  getRecipeOutput(): ItemStack | null {
    return null;
  }
}

/** A filled map plus empty maps: copies of the map (keeping its custom name). */
export class RecipesMapCloning implements IRecipe {
  matches(grid: CraftingGrid): boolean {
    return this.getCraftingResult(grid) !== null;
  }
  getCraftingResult(grid: CraftingGrid): ItemStack | null {
    let empties = 0;
    let map: ItemStack | null = null;
    for (let i = 0; i < grid.getSizeInventory(); i++) {
      const s = grid.getStackInSlot(i);
      if (!s) continue;
      if (s.itemID === ItemIds.map) {
        if (map) return null;
        map = s;
      } else {
        if (s.itemID !== ItemIds.emptyMap) return null;
        empties++;
      }
    }
    if (!map || empties < 1) return null;
    const out = new ItemStack(ItemIds.map, empties + 1, map.getItemDamage());
    if (map.hasDisplayName()) out.setItemName(map.getDisplayName());
    return out;
  }
  getRecipeSize(): number {
    return 9;
  }
  getRecipeOutput(): ItemStack | null {
    return null;
  }
}

/** A filled map surrounded by paper: the same map flagged "map_is_scaling" (zoomed out when taken). */
export class RecipesMapExtending extends ShapedRecipes {
  constructor() {
    const paper = () => new ItemStack(ItemIds.paper);
    super(3, 3, [paper(), paper(), paper(), paper(), new ItemStack(ItemIds.map, 0, WILDCARD_DAMAGE), paper(), paper(), paper(), paper()], new ItemStack(ItemIds.emptyMap, 0, 0));
  }
  override matches(grid: CraftingGrid, world: IWorld | null = null): boolean {
    if (!super.matches(grid)) return false;
    let map: ItemStack | null = null;
    for (let i = 0; i < grid.getSizeInventory() && !map; i++) {
      const s = grid.getStackInSlot(i);
      if (s && s.itemID === ItemIds.map) map = s;
    }
    if (!map || !world) return false;
    const item = Item.itemsList[ItemIds.map];
    const data = item instanceof ItemMap ? item.getMapData(map, world) : null;
    return data ? data.scale < 4 : false;
  }
  override getCraftingResult(grid: CraftingGrid): ItemStack {
    let map: ItemStack | null = null;
    for (let i = 0; i < grid.getSizeInventory() && !map; i++) {
      const s = grid.getStackInSlot(i);
      if (s && s.itemID === ItemIds.map) map = s;
    }
    const out = map!.copy();
    out.stackSize = 1;
    out.stackTagCompound ??= {};
    out.stackTagCompound.map_is_scaling = true;
    return out;
  }
}

/**
 * Fireworks (RecipeFireworks): paper + 1-3 gunpowder (+ stars) is a rocket with that flight;
 * gunpowder + dyes (+ one shape item, glowstone, diamond) is a star; a star + dyes adds fades.
 */
export class RecipeFireworks implements IRecipe {
  private result: ItemStack | null = null;

  matches(grid: CraftingGrid): boolean {
    this.result = null;
    let paper = 0;
    let gunpowder = 0;
    let dyes = 0;
    let stars = 0;
    let effects = 0;
    let shapes = 0;
    for (let i = 0; i < grid.getSizeInventory(); i++) {
      const s = grid.getStackInSlot(i);
      if (!s) continue;
      const id = s.itemID;
      if (id === ItemIds.gunpowder) gunpowder++;
      else if (id === ItemIds.fireworkCharge) stars++;
      else if (id === ItemIds.dyePowder) dyes++;
      else if (id === ItemIds.paper) paper++;
      else if (id === ItemIds.lightStoneDust || id === ItemIds.diamond) effects++;
      else if (id === ItemIds.fireballCharge || id === ItemIds.feather || id === ItemIds.goldNugget || id === ItemIds.skull) shapes++;
      else return false;
    }
    effects += dyes + shapes;
    if (gunpowder > 3 || paper > 1) return false;

    if (gunpowder >= 1 && paper === 1 && effects === 0) {
      this.result = new ItemStack(ItemIds.firework);
      if (stars > 0) {
        const explosions: TagCompound[] = [];
        for (let i = 0; i < grid.getSizeInventory(); i++) {
          const s = grid.getStackInSlot(i);
          const ex = s?.itemID === ItemIds.fireworkCharge ? s.getTagCompound()?.Explosion : undefined;
          if (ex && typeof ex === 'object') explosions.push(structuredClone(ex as TagCompound));
        }
        this.result.setTagCompound({ Fireworks: { Explosions: explosions, Flight: gunpowder } });
      }
      return true;
    }

    if (gunpowder === 1 && paper === 0 && stars === 0 && dyes > 0 && shapes <= 1) {
      this.result = new ItemStack(ItemIds.fireworkCharge);
      const ex: TagCompound = {};
      let type = 0;
      const colors: number[] = [];
      for (let i = 0; i < grid.getSizeInventory(); i++) {
        const s = grid.getStackInSlot(i);
        if (!s) continue;
        const id = s.itemID;
        if (id === ItemIds.dyePowder) colors.push(ItemDye.dyeColors[s.getItemDamage()]);
        else if (id === ItemIds.lightStoneDust) ex.Flicker = true;
        else if (id === ItemIds.diamond) ex.Trail = true;
        else if (id === ItemIds.fireballCharge) type = 1;
        else if (id === ItemIds.feather) type = 4;
        else if (id === ItemIds.goldNugget) type = 2;
        else if (id === ItemIds.skull) type = 3;
      }
      ex.Colors = colors;
      ex.Type = type;
      this.result.setTagCompound({ Explosion: ex });
      return true;
    }

    if (gunpowder === 0 && paper === 0 && stars === 1 && dyes > 0 && dyes === effects) {
      const fades: number[] = [];
      for (let i = 0; i < grid.getSizeInventory(); i++) {
        const s = grid.getStackInSlot(i);
        if (!s) continue;
        if (s.itemID === ItemIds.dyePowder) fades.push(ItemDye.dyeColors[s.getItemDamage()]);
        else if (s.itemID === ItemIds.fireworkCharge) {
          this.result = s.copy();
          this.result.stackSize = 1;
        }
      }
      const ex = this.result?.getTagCompound()?.Explosion as TagCompound | undefined;
      if (!this.result || !ex || typeof ex !== 'object') return false;
      ex.FadeColors = fades;
      return true;
    }
    return false;
  }

  getCraftingResult(_grid: CraftingGrid): ItemStack | null {
    return this.result ? this.result.copy() : null;
  }
  getRecipeSize(): number {
    return 10;
  }
  getRecipeOutput(): ItemStack | null {
    return this.result;
  }
}

