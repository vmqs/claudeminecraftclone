import { Block } from '../../block/Block';
import { BlockIds as B, ItemIds as I } from '../../block/BlockIds';
import { Material } from '../../block/Material';
import { Item } from '../Item';
import { ItemStack } from '../ItemStack';
import { ItemSword, ItemHoe } from '../ItemSword';
import { ItemTool } from '../ItemTool';

/**
 * Smelting results and experience (FurnaceRecipes): input id -> result, and the experience a
 * result gives when taken out of the furnace.
 */
export class FurnaceRecipes {
  private static instance: FurnaceRecipes | null = null;
  private readonly smeltingList = new Map<number, ItemStack>();
  private readonly experienceList = new Map<number, number>();

  static smelting(): FurnaceRecipes {
    return (FurnaceRecipes.instance ??= new FurnaceRecipes());
  }

  private constructor() {
    this.addSmelting(B.oreIron, new ItemStack(I.ingotIron), 0.7);
    this.addSmelting(B.oreGold, new ItemStack(I.ingotGold), 1.0);
    this.addSmelting(B.oreDiamond, new ItemStack(I.diamond), 1.0);
    this.addSmelting(B.sand, new ItemStack(B.glass), 0.1);
    this.addSmelting(I.porkRaw, new ItemStack(I.porkCooked), 0.35);
    this.addSmelting(I.beefRaw, new ItemStack(I.beefCooked), 0.35);
    this.addSmelting(I.chickenRaw, new ItemStack(I.chickenCooked), 0.35);
    this.addSmelting(I.fishRaw, new ItemStack(I.fishCooked), 0.35);
    this.addSmelting(B.cobblestone, new ItemStack(B.stone), 0.1);
    this.addSmelting(I.clay, new ItemStack(I.brick), 0.3);
    this.addSmelting(B.cactus, new ItemStack(I.dyePowder, 1, 2), 0.2);
    this.addSmelting(B.wood, new ItemStack(I.coal, 1, 1), 0.15);
    this.addSmelting(B.oreEmerald, new ItemStack(I.emerald), 1.0);
    this.addSmelting(I.potato, new ItemStack(I.bakedPotato), 0.35);
    this.addSmelting(B.netherrack, new ItemStack(I.netherrackBrick), 0.1);
    this.addSmelting(B.oreCoal, new ItemStack(I.coal), 0.1);
    this.addSmelting(B.oreRedstone, new ItemStack(I.redstone), 0.7);
    this.addSmelting(B.oreLapis, new ItemStack(I.dyePowder, 1, 4), 0.2);
    this.addSmelting(B.oreNetherQuartz, new ItemStack(I.netherQuartz), 0.2);
  }

  /** Smelting any damage of `id` gives `result`; `xp` is stored per result item (as in 1.5.2). */
  addSmelting(id: number, result: ItemStack, xp: number): void {
    this.smeltingList.set(id, result);
    this.experienceList.set(result.itemID, Math.fround(xp));
  }

  /** The result for an input id (the furnace copies it), or null. */
  getSmeltingResult(id: number): ItemStack | null {
    return this.smeltingList.get(id) ?? null;
  }

  getSmeltingList(): ReadonlyMap<number, ItemStack> {
    return this.smeltingList;
  }

  getExperience(resultId: number): number {
    return this.experienceList.get(resultId) ?? 0;
  }
}

/**
 * TileEntityFurnace.getItemBurnTime: fuel ticks (200 per item smelted). Wooden slabs 150, other
 * wooden blocks 300, wooden tools 200, sticks and saplings 100, coal 1600, lava 20000, blaze rods 2400.
 */
export function getItemBurnTime(stack: ItemStack | null): number {
  if (!stack) return 0;
  const id = stack.itemID;
  const item = Item.itemsList[id];
  if (id < 256 && Block.blocksList[id]) {
    const b = Block.blocksList[id]!;
    if (id === B.woodSingleSlab) return 150;
    if (b.blockMaterial === Material.wood) return 300;
  }
  if (item instanceof ItemTool && item.getToolMaterialName() === 'WOOD') return 200;
  if (item instanceof ItemSword && item.getToolMaterialName() === 'WOOD') return 200;
  if (item instanceof ItemHoe && item.getMaterialName() === 'WOOD') return 200;
  if (id === I.stick) return 100;
  if (id === I.coal) return 1600;
  if (id === I.bucketLava) return 20000;
  if (id === B.sapling) return 100;
  return id === I.blazeRod ? 2400 : 0;
}

/** TileEntityFurnace.isItemFuel */
export function isItemFuel(stack: ItemStack | null): boolean {
  return getItemBurnTime(stack) > 0;
}
