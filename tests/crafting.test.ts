/**
 * Crafting and smelting checks for the 1.5.2 recipe list (CraftingManager, FurnaceRecipes).
 * Run: node scripts/run-node-test.mjs tests/crafting.test.ts
 */
import '../src/block/Blocks';
import { BlockIds as B, ItemIds as I } from '../src/block/BlockIds';
import { CraftingManager } from '../src/item/crafting/CraftingManager';
import { FurnaceRecipes, getItemBurnTime } from '../src/item/crafting/FurnaceRecipes';
import type { CraftingGrid } from '../src/item/crafting/IRecipe';
import { Items } from '../src/item/Items';
import { ItemArmor } from '../src/item/ItemArmor';
import { ItemStack } from '../src/item/ItemStack';
import { check, report } from './harness';

/** A crafting grid of `size` x `size` filled from rows of [id, damage?] cells (null = empty). */
class Grid implements CraftingGrid {
  readonly slots: (ItemStack | null)[];
  constructor(
    readonly size: number,
    rows: ((number | [number, number] | ItemStack | null)[])[],
  ) {
    this.slots = new Array(size * size).fill(null);
    rows.forEach((row, r) =>
      row.forEach((cell, c) => {
        if (cell === null) return;
        this.slots[c + r * size] = cell instanceof ItemStack ? cell : typeof cell === 'number' ? new ItemStack(cell, 1, 0) : new ItemStack(cell[0], 1, cell[1]);
      }),
    );
  }
  getSizeInventory(): number {
    return this.slots.length;
  }
  getStackInSlot(i: number): ItemStack | null {
    return this.slots[i] ?? null;
  }
  getStackInRowAndColumn(col: number, row: number): ItemStack | null {
    return col < 0 || col >= this.size ? null : this.getStackInSlot(col + row * this.size);
  }
}

const cm = CraftingManager.getInstance();
const craft = (size: number, rows: ConstructorParameters<typeof Grid>[1]) => cm.findMatchingRecipe(new Grid(size, rows), null);
const expect = (name: string, out: ItemStack | null, id: number, count: number, damage = 0) =>
  check(name, out !== null && out.itemID === id && out.stackSize === count && out.getItemDamage() === damage, out ? `${out}` : 'null');

const _ = null;
// 1.5.2 registers 229 recipes (112 in CraftingManager plus the Recipes* classes).
check('recipe count is 229', cm.getRecipeList().length === 229, String(cm.getRecipeList().length));

// Planks from every log type (exact damage), in either column of a 2x2 grid.
for (let d = 0; d < 4; d++) expect(`planks from log ${d}`, craft(2, [[_, [B.wood, d]]]), B.planks, 4, d);
expect('sticks from any planks (wildcard)', craft(2, [[[B.planks, 3]], [[B.planks, 1]]]), I.stick, 4);
expect('crafting table', craft(2, [[[B.planks, 0], [B.planks, 2]], [[B.planks, 1], [B.planks, 3]]]), B.workbench, 1);
expect('torch from coal', craft(3, [[_, I.coal], [_, I.stick]]), B.torchWood, 4);
expect('torch from charcoal', craft(3, [[[I.coal, 1]], [I.stick]]), B.torchWood, 4);
check('no torch from a bone and a stick', craft(3, [[I.bone], [I.stick]]) === null);

// Every tool and weapon tier.
const mats: [string, number | [number, number]][] = [['wood', [B.planks, 2]], ['stone', B.cobblestone], ['iron', I.ingotIron], ['diamond', I.diamond], ['gold', I.ingotGold]];
const tools: Record<string, number[]> = {
  pickaxe: [I.pickaxeWood, I.pickaxeStone, I.pickaxeIron, I.pickaxeDiamond, I.pickaxeGold],
  shovel: [I.shovelWood, I.shovelStone, I.shovelIron, I.shovelDiamond, I.shovelGold],
  axe: [I.axeWood, I.axeStone, I.axeIron, I.axeDiamond, I.axeGold],
  hoe: [I.hoeWood, I.hoeStone, I.hoeIron, I.hoeDiamond, I.hoeGold],
  sword: [I.swordWood, I.swordStone, I.swordIron, I.swordDiamond, I.swordGold],
};
mats.forEach(([name, m], i) => {
  const s = I.stick;
  expect(`${name} pickaxe`, craft(3, [[m, m, m], [_, s, _], [_, s, _]]), tools.pickaxe[i], 1);
  expect(`${name} shovel`, craft(3, [[_, _, m], [_, _, s], [_, _, s]]), tools.shovel[i], 1);
  expect(`${name} axe`, craft(3, [[m, m], [m, s], [_, s]]), tools.axe[i], 1);
  expect(`${name} axe (mirrored)`, craft(3, [[_, m, m], [_, s, m], [_, s, _]]), tools.axe[i], 1);
  expect(`${name} hoe`, craft(3, [[m, m], [_, s], [_, s]]), tools.hoe[i], 1);
  expect(`${name} sword`, craft(3, [[_, m], [_, m], [_, s]]), tools.sword[i], 1);
});
expect('chainmail is uncraftable except with fire', craft(3, [[B.fire, B.fire, B.fire], [B.fire, _, B.fire]]), I.helmetChain, 1);
expect('iron chestplate', craft(3, [[I.ingotIron, _, I.ingotIron], [I.ingotIron, I.ingotIron, I.ingotIron], [I.ingotIron, I.ingotIron, I.ingotIron]]), I.plateIron, 1);

// Wool dyeing and dye mixing (shapeless, any position).
expect('red wool from white wool + rose red', craft(3, [[_, _, [I.dyePowder, 1]], [[B.cloth, 0]]]), B.cloth, 1, 14);
expect('black wool', craft(2, [[[B.cloth, 0], [I.dyePowder, 0]]]), B.cloth, 1, 15);
check('dyed wool cannot be re-dyed', craft(2, [[[B.cloth, 14], [I.dyePowder, 0]]]) === null);
expect('purple dye', craft(2, [[[I.dyePowder, 4], [I.dyePowder, 1]]]), I.dyePowder, 2, 5);
expect('bone meal', craft(2, [[I.bone]]), I.dyePowder, 3, 15);
expect('magenta from 4 dyes', craft(3, [[[I.dyePowder, 4], [I.dyePowder, 1]], [[I.dyePowder, 1], [I.dyePowder, 15]]]), I.dyePowder, 4, 13);

// Assorted shaped / shapeless recipes.
expect('fire charge (shapeless, charcoal)', craft(3, [[I.gunpowder], [_, [I.coal, 1]], [_, _, I.blazePowder]]), I.fireballCharge, 3);
expect('book', craft(2, [[I.paper, I.paper], [I.paper, I.leather]]), I.book, 1);
expect('enchanted golden apple', craft(3, [[B.blockGold, B.blockGold, B.blockGold], [B.blockGold, I.appleRed, B.blockGold], [B.blockGold, B.blockGold, B.blockGold]]), I.appleGold, 1, 1);
expect('stone slabs', craft(3, [[B.stone, B.stone, B.stone]]), B.stoneSingleSlab, 6, 0);
expect('birch slabs need birch planks', craft(3, [[[B.planks, 2], [B.planks, 2], [B.planks, 2]]]), B.woodSingleSlab, 6, 2);
expect('jungle stairs', craft(3, [[[B.planks, 3]], [[B.planks, 3], [B.planks, 3]], [[B.planks, 3], [B.planks, 3], [B.planks, 3]]]), B.stairsWoodJungle, 4);
expect('cake', craft(3, [[I.bucketMilk, I.bucketMilk, I.bucketMilk], [I.sugar, I.egg, I.sugar], [I.wheat, I.wheat, I.wheat]]), I.cake, 1);
expect('iron block', craft(3, [[I.ingotIron, I.ingotIron, I.ingotIron], [I.ingotIron, I.ingotIron, I.ingotIron], [I.ingotIron, I.ingotIron, I.ingotIron]]), B.blockIron, 1);
expect('lapis from its block', craft(2, [[B.blockLapis]]), I.dyePowder, 9, 4);
expect('chest', craft(3, [[B.planks, B.planks, B.planks], [B.planks, _, B.planks], [B.planks, B.planks, B.planks]]), B.chest, 1);
expect('furnace', craft(3, [[B.cobblestone, B.cobblestone, B.cobblestone], [B.cobblestone, _, B.cobblestone], [B.cobblestone, B.cobblestone, B.cobblestone]]), B.furnaceIdle, 1);
expect('ender chest', craft(3, [[B.obsidian, B.obsidian, B.obsidian], [B.obsidian, I.eyeOfEnder, B.obsidian], [B.obsidian, B.obsidian, B.obsidian]]), B.enderChest, 1);
expect('trapped chest', craft(2, [[B.chest, B.tripWireSource]]), B.chestTrapped, 1);

// Tool repair: two damaged tools of the same kind, +5% bonus.
const p1 = new ItemStack(I.pickaxeIron, 1, 200);
const p2 = new ItemStack(I.pickaxeIron, 1, 150);
expect('iron pickaxe repair', craft(2, [[p1, p2]]), I.pickaxeIron, 1, 250 - (50 + 100 + 12));

// Leather armour dyeing (the colour mix of RecipesArmorDyes).
const dyed = craft(3, [[I.helmetLeather, [I.dyePowder, 1]]]);
const helmet = Items.helmetLeather as ItemArmor;
check('red leather cap', dyed !== null && dyed.itemID === I.helmetLeather && helmet.getColor(dyed) === 0x993333, dyed ? helmet.getColor(dyed).toString(16) : 'null');
const mixed = craft(3, [[I.helmetLeather, [I.dyePowder, 1], [I.dyePowder, 11]]]);
check('red + yellow leather cap', mixed !== null && helmet.getColor(mixed) === 0xbf8c33, mixed ? helmet.getColor(mixed).toString(16) : 'null');

// Fireworks: a large-ball star with trail, a fade, and a rocket carrying it.
const star = craft(3, [[I.gunpowder, [I.dyePowder, 1], I.fireballCharge], [I.diamond]]);
const ex = star?.getTagCompound()?.Explosion as { Colors: number[]; Type: number; Trail?: boolean } | undefined;
check('firework star (large ball, trail, red)', !!star && star.itemID === I.fireworkCharge && ex?.Type === 1 && ex?.Trail === true && ex?.Colors[0] === 11743532, JSON.stringify(star?.getTagCompound()));
const faded = star && craft(3, [[star, [I.dyePowder, 4]]]);
const fex = faded?.getTagCompound()?.Explosion as { FadeColors?: number[] } | undefined;
check('star fade to blue', !!faded && fex?.FadeColors?.[0] === 2437522, JSON.stringify(faded?.getTagCompound()));
const rocket = faded && craft(3, [[I.paper, I.gunpowder, I.gunpowder], [faded]]);
const fw = rocket?.getTagCompound()?.Fireworks as { Flight: number; Explosions: unknown[] } | undefined;
check('rocket with flight 2 and one star', !!rocket && rocket.itemID === I.firework && fw?.Flight === 2 && fw?.Explosions.length === 1, JSON.stringify(rocket?.getTagCompound()));
const plain = craft(3, [[I.paper, I.gunpowder]]);
check('plain rocket has no NBT', !!plain && plain.itemID === I.firework && plain.getTagCompound() === null);

// Map cloning.
expect('map cloning', craft(3, [[[I.map, 7], I.emptyMap, I.emptyMap]]), I.map, 3, 7);

// Smelting.
const fr = FurnaceRecipes.smelting();
const smelt = (name: string, input: number, id: number, damage: number, xp: number) => {
  const out = fr.getSmeltingResult(input);
  check(`smelt ${name}`, !!out && out.itemID === id && out.getItemDamage() === damage && Math.abs(fr.getExperience(id) - xp) < 1e-6, out ? `${out} xp ${fr.getExperience(id)}` : 'null');
};
smelt('iron ore', B.oreIron, I.ingotIron, 0, 0.7);
smelt('sand', B.sand, B.glass, 0, 0.1);
// Experience is stored per result item id, so coal ore's 0.1 overwrites charcoal's 0.15 (1.5.2 quirk).
smelt('log', B.wood, I.coal, 1, 0.1);
smelt('cactus', B.cactus, I.dyePowder, 2, 0.2);
smelt('cobblestone', B.cobblestone, B.stone, 0, 0.1);
smelt('clay', I.clay, I.brick, 0, 0.3);
smelt('potato', I.potato, I.bakedPotato, 0, 0.35);
smelt('lapis ore', B.oreLapis, I.dyePowder, 4, 0.2);
check('no smelting for dirt', fr.getSmeltingResult(B.dirt) === null);
check('burn time: coal 1600', getItemBurnTime(new ItemStack(I.coal)) === 1600);
check('burn time: planks 300', getItemBurnTime(new ItemStack(B.planks)) === 300);
check('burn time: wooden pickaxe 200', getItemBurnTime(new ItemStack(I.pickaxeWood)) === 200);
check('burn time: stick 100', getItemBurnTime(new ItemStack(I.stick)) === 100);
check('burn time: lava bucket 20000', getItemBurnTime(new ItemStack(I.bucketLava)) === 20000);
check('burn time: blaze rod 2400', getItemBurnTime(new ItemStack(I.blazeRod)) === 2400);
check('burn time: stone 0', getItemBurnTime(new ItemStack(B.stone)) === 0);

report();
