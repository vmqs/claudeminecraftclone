import { BlockIds as B } from '../../block/BlockIds';
import type { Item } from '../Item';
import { Items as I } from '../Items';
import { ItemStack } from '../ItemStack';
import { CraftingManager, type Ingredient } from './CraftingManager';
import { RecipeFireworks, RecipesArmorDyes, RecipesMapCloning, RecipesMapExtending } from './SpecialRecipes';

/** A block as a recipe ingredient (any damage in shaped recipes, damage 0 in shapeless ones). */
const blk = (id: number): Ingredient => ({ blockID: id });
const S = (id: number | Item, n = 1, d = 0): ItemStack => new ItemStack(id, n, d);

/** RecipesTools: pickaxe, shovel, axe and hoe of each material, then shears. */
function addToolRecipes(m: CraftingManager): void {
  const patterns = [
    ['XXX', ' # ', ' # '],
    ['X', '#', '#'],
    ['XX', 'X#', ' #'],
    ['XX', ' #', ' #'],
  ];
  const materials = [blk(B.planks), blk(B.cobblestone), I.ingotIron, I.diamond, I.ingotGold];
  const tools = [
    [I.pickaxeWood, I.pickaxeStone, I.pickaxeIron, I.pickaxeDiamond, I.pickaxeGold],
    [I.shovelWood, I.shovelStone, I.shovelIron, I.shovelDiamond, I.shovelGold],
    [I.axeWood, I.axeStone, I.axeIron, I.axeDiamond, I.axeGold],
    [I.hoeWood, I.hoeStone, I.hoeIron, I.hoeDiamond, I.hoeGold],
  ];
  for (let mat = 0; mat < materials.length; mat++) {
    for (let t = 0; t < tools.length; t++) m.addRecipe(S(tools[t][mat]), patterns[t], { '#': I.stick, X: materials[mat] });
  }
  m.addRecipe(S(I.shears), [' #', '# '], { '#': I.ingotIron });
}

/** RecipesWeapons: swords of each material, the bow and arrows. */
function addWeaponRecipes(m: CraftingManager): void {
  const materials = [blk(B.planks), blk(B.cobblestone), I.ingotIron, I.diamond, I.ingotGold];
  const swords = [I.swordWood, I.swordStone, I.swordIron, I.swordDiamond, I.swordGold];
  for (let mat = 0; mat < materials.length; mat++) m.addRecipe(S(swords[mat]), ['X', 'X', '#'], { '#': I.stick, X: materials[mat] });
  m.addRecipe(S(I.bow, 1), [' #X', '# X', ' #X'], { X: I.silk, '#': I.stick });
  m.addRecipe(S(I.arrow, 4), ['X', '#', 'Y'], { Y: I.feather, X: I.flint, '#': I.stick });
}

/** RecipesIngots: storage blocks and back, gold nuggets. */
function addIngotRecipes(m: CraftingManager): void {
  const pairs: [number, ItemStack][] = [
    [B.blockGold, S(I.ingotGold, 9)],
    [B.blockIron, S(I.ingotIron, 9)],
    [B.blockDiamond, S(I.diamond, 9)],
    [B.blockEmerald, S(I.emerald, 9)],
    [B.blockLapis, S(I.dyePowder, 9, 4)],
    [B.blockRedstone, S(I.redstone, 9)],
  ];
  for (const [block, items] of pairs) {
    m.addRecipe(S(block), ['###', '###', '###'], { '#': items });
    m.addRecipe(items, ['#'], { '#': blk(block) });
  }
  m.addRecipe(S(I.ingotGold), ['###', '###', '###'], { '#': I.goldNugget });
  m.addRecipe(S(I.goldNugget, 9), ['#'], { '#': I.ingotGold });
}

/** RecipesFood */
function addFoodRecipes(m: CraftingManager): void {
  m.addShapelessRecipe(S(I.bowlSoup), blk(B.mushroomBrown), blk(B.mushroomRed), I.bowlEmpty);
  m.addRecipe(S(I.cookie, 8), ['#X#'], { X: S(I.dyePowder, 1, 3), '#': I.wheat });
  m.addRecipe(S(B.melon), ['MMM', 'MMM', 'MMM'], { M: I.melon });
  m.addRecipe(S(I.melonSeeds), ['M'], { M: I.melon });
  m.addRecipe(S(I.pumpkinSeeds, 4), ['M'], { M: blk(B.pumpkin) });
  m.addShapelessRecipe(S(I.pumpkinPie), blk(B.pumpkin), I.sugar, I.egg);
  m.addShapelessRecipe(S(I.fermentedSpiderEye), I.spiderEye, blk(B.mushroomBrown), I.sugar);
  m.addShapelessRecipe(S(I.speckledMelon), I.melon, I.goldNugget);
  m.addShapelessRecipe(S(I.blazePowder, 2), I.blazeRod);
  m.addShapelessRecipe(S(I.magmaCream), I.blazePowder, I.slimeBall);
}

/** RecipesCrafting: containers, sandstone and quartz variants, bricks, panes, lamp, beacon. */
function addCraftingRecipes(m: CraftingManager): void {
  m.addRecipe(S(B.chest), ['###', '# #', '###'], { '#': blk(B.planks) });
  m.addRecipe(S(B.chestTrapped), ['#-'], { '#': blk(B.chest), '-': blk(B.tripWireSource) });
  m.addRecipe(S(B.enderChest), ['###', '#E#', '###'], { '#': blk(B.obsidian), E: I.eyeOfEnder });
  m.addRecipe(S(B.furnaceIdle), ['###', '# #', '###'], { '#': blk(B.cobblestone) });
  m.addRecipe(S(B.workbench), ['##', '##'], { '#': blk(B.planks) });
  m.addRecipe(S(B.sandStone), ['##', '##'], { '#': blk(B.sand) });
  m.addRecipe(S(B.sandStone, 4, 2), ['##', '##'], { '#': blk(B.sandStone) });
  m.addRecipe(S(B.sandStone, 1, 1), ['#', '#'], { '#': S(B.stoneSingleSlab, 1, 1) });
  m.addRecipe(S(B.blockNetherQuartz, 1, 1), ['#', '#'], { '#': S(B.stoneSingleSlab, 1, 7) });
  m.addRecipe(S(B.blockNetherQuartz, 2, 2), ['#', '#'], { '#': S(B.blockNetherQuartz, 1, 0) });
  m.addRecipe(S(B.stoneBrick, 4), ['##', '##'], { '#': blk(B.stone) });
  m.addRecipe(S(B.fenceIron, 16), ['###', '###'], { '#': I.ingotIron });
  m.addRecipe(S(B.thinGlass, 16), ['###', '###'], { '#': blk(B.glass) });
  m.addRecipe(S(B.redstoneLampIdle, 1), [' R ', 'RGR', ' R '], { R: I.redstone, G: blk(B.glowStone) });
  m.addRecipe(S(B.beacon, 1), ['GGG', 'GSG', 'OOO'], { G: blk(B.glass), S: I.netherStar, O: blk(B.obsidian) });
  m.addRecipe(S(B.netherBrick, 1), ['NN', 'NN'], { N: I.netherrackBrick });
}

/** RecipesArmor: helmet, chestplate, leggings and boots of leather, (fire = chain), iron, diamond, gold. */
function addArmorRecipes(m: CraftingManager): void {
  const patterns = [
    ['XXX', 'X X'],
    ['X X', 'XXX', 'XXX'],
    ['XXX', 'X X', 'X X'],
    ['X X', 'X X'],
  ];
  const materials = [I.leather, blk(B.fire), I.ingotIron, I.diamond, I.ingotGold];
  const pieces = [
    [I.helmetLeather, I.helmetChain, I.helmetIron, I.helmetDiamond, I.helmetGold],
    [I.plateLeather, I.plateChain, I.plateIron, I.plateDiamond, I.plateGold],
    [I.legsLeather, I.legsChain, I.legsIron, I.legsDiamond, I.legsGold],
    [I.bootsLeather, I.bootsChain, I.bootsIron, I.bootsDiamond, I.bootsGold],
  ];
  for (let mat = 0; mat < materials.length; mat++) {
    for (let p = 0; p < pieces.length; p++) m.addRecipe(S(pieces[p][mat]), patterns[p], { X: materials[mat] });
  }
}

/** RecipesDyes: wool dyeing (white wool + dye) and dye mixing. */
function addDyeRecipes(m: CraftingManager): void {
  const dye = (d: number) => S(I.dyePowder, 1, d);
  for (let d = 0; d < 16; d++) m.addShapelessRecipe(S(B.cloth, 1, ~d & 15), dye(d), S(B.cloth, 1, 0));
  m.addShapelessRecipe(S(I.dyePowder, 2, 11), blk(B.plantYellow));
  m.addShapelessRecipe(S(I.dyePowder, 2, 1), blk(B.plantRed));
  m.addShapelessRecipe(S(I.dyePowder, 3, 15), I.bone);
  m.addShapelessRecipe(S(I.dyePowder, 2, 9), dye(1), dye(15));
  m.addShapelessRecipe(S(I.dyePowder, 2, 14), dye(1), dye(11));
  m.addShapelessRecipe(S(I.dyePowder, 2, 10), dye(2), dye(15));
  m.addShapelessRecipe(S(I.dyePowder, 2, 8), dye(0), dye(15));
  m.addShapelessRecipe(S(I.dyePowder, 2, 7), dye(8), dye(15));
  m.addShapelessRecipe(S(I.dyePowder, 3, 7), dye(0), dye(15), dye(15));
  m.addShapelessRecipe(S(I.dyePowder, 2, 12), dye(4), dye(15));
  m.addShapelessRecipe(S(I.dyePowder, 2, 6), dye(4), dye(2));
  m.addShapelessRecipe(S(I.dyePowder, 2, 5), dye(4), dye(1));
  m.addShapelessRecipe(S(I.dyePowder, 2, 13), dye(5), dye(9));
  m.addShapelessRecipe(S(I.dyePowder, 3, 13), dye(4), dye(1), dye(9));
  m.addShapelessRecipe(S(I.dyePowder, 4, 13), dye(4), dye(1), dye(1), dye(15));
}

/** CraftingManager's constructor: every 1.5.2 recipe in the original registration order. */
export function registerVanillaRecipes(m: CraftingManager): void {
  addToolRecipes(m);
  addWeaponRecipes(m);
  addIngotRecipes(m);
  addFoodRecipes(m);
  addCraftingRecipes(m);
  addArmorRecipes(m);
  addDyeRecipes(m);
  m.addRecipeObject(new RecipesArmorDyes());
  m.addRecipeObject(new RecipesMapCloning());
  m.addRecipeObject(new RecipesMapExtending());
  m.addRecipeObject(new RecipeFireworks());
  m.addRecipe(S(I.paper, 3), ['###'], { '#': I.reed });
  m.addShapelessRecipe(S(I.book, 1), I.paper, I.paper, I.paper, I.leather);
  m.addShapelessRecipe(S(I.writableBook, 1), I.book, S(I.dyePowder, 1, 0), I.feather);
  m.addRecipe(S(B.fence, 2), ['###', '###'], { '#': I.stick });
  m.addRecipe(S(B.cobblestoneWall, 6, 0), ['###', '###'], { '#': blk(B.cobblestone) });
  m.addRecipe(S(B.cobblestoneWall, 6, 1), ['###', '###'], { '#': blk(B.cobblestoneMossy) });
  m.addRecipe(S(B.netherFence, 6), ['###', '###'], { '#': blk(B.netherBrick) });
  m.addRecipe(S(B.fenceGate, 1), ['#W#', '#W#'], { '#': I.stick, W: blk(B.planks) });
  m.addRecipe(S(B.jukebox, 1), ['###', '#X#', '###'], { '#': blk(B.planks), X: I.diamond });
  m.addRecipe(S(B.music, 1), ['###', '#X#', '###'], { '#': blk(B.planks), X: I.redstone });
  m.addRecipe(S(B.bookShelf, 1), ['###', 'XXX', '###'], { '#': blk(B.planks), X: I.book });
  m.addRecipe(S(B.blockSnow, 1), ['##', '##'], { '#': I.snowball });
  m.addRecipe(S(B.snow, 6), ['###'], { '#': blk(B.blockSnow) });
  m.addRecipe(S(B.blockClay, 1), ['##', '##'], { '#': I.clay });
  m.addRecipe(S(B.brick, 1), ['##', '##'], { '#': I.brick });
  m.addRecipe(S(B.glowStone, 1), ['##', '##'], { '#': I.lightStoneDust });
  m.addRecipe(S(B.blockNetherQuartz, 1), ['##', '##'], { '#': I.netherQuartz });
  m.addRecipe(S(B.cloth, 1), ['##', '##'], { '#': I.silk });
  m.addRecipe(S(B.tnt, 1), ['X#X', '#X#', 'X#X'], { X: I.gunpowder, '#': blk(B.sand) });
  m.addRecipe(S(B.stoneSingleSlab, 6, 3), ['###'], { '#': blk(B.cobblestone) });
  m.addRecipe(S(B.stoneSingleSlab, 6, 0), ['###'], { '#': blk(B.stone) });
  m.addRecipe(S(B.stoneSingleSlab, 6, 1), ['###'], { '#': blk(B.sandStone) });
  m.addRecipe(S(B.stoneSingleSlab, 6, 4), ['###'], { '#': blk(B.brick) });
  m.addRecipe(S(B.stoneSingleSlab, 6, 5), ['###'], { '#': blk(B.stoneBrick) });
  m.addRecipe(S(B.stoneSingleSlab, 6, 6), ['###'], { '#': blk(B.netherBrick) });
  m.addRecipe(S(B.stoneSingleSlab, 6, 7), ['###'], { '#': blk(B.blockNetherQuartz) });
  m.addRecipe(S(B.woodSingleSlab, 6, 0), ['###'], { '#': S(B.planks, 1, 0) });
  m.addRecipe(S(B.woodSingleSlab, 6, 2), ['###'], { '#': S(B.planks, 1, 2) });
  m.addRecipe(S(B.woodSingleSlab, 6, 1), ['###'], { '#': S(B.planks, 1, 1) });
  m.addRecipe(S(B.woodSingleSlab, 6, 3), ['###'], { '#': S(B.planks, 1, 3) });
  m.addRecipe(S(B.ladder, 3), ['# #', '###', '# #'], { '#': I.stick });
  m.addRecipe(S(I.doorWood, 1), ['##', '##', '##'], { '#': blk(B.planks) });
  m.addRecipe(S(B.trapdoor, 2), ['###', '###'], { '#': blk(B.planks) });
  m.addRecipe(S(I.doorIron, 1), ['##', '##', '##'], { '#': I.ingotIron });
  m.addRecipe(S(I.sign, 3), ['###', '###', ' X '], { '#': blk(B.planks), X: I.stick });
  m.addRecipe(S(I.cake, 1), ['AAA', 'BEB', 'CCC'], { A: I.bucketMilk, B: I.sugar, C: I.wheat, E: I.egg });
  m.addRecipe(S(I.sugar, 1), ['#'], { '#': I.reed });
  m.addRecipe(S(B.planks, 4, 0), ['#'], { '#': S(B.wood, 1, 0) });
  m.addRecipe(S(B.planks, 4, 1), ['#'], { '#': S(B.wood, 1, 1) });
  m.addRecipe(S(B.planks, 4, 2), ['#'], { '#': S(B.wood, 1, 2) });
  m.addRecipe(S(B.planks, 4, 3), ['#'], { '#': S(B.wood, 1, 3) });
  m.addRecipe(S(I.stick, 4), ['#', '#'], { '#': blk(B.planks) });
  m.addRecipe(S(B.torchWood, 4), ['X', '#'], { X: I.coal, '#': I.stick });
  m.addRecipe(S(B.torchWood, 4), ['X', '#'], { X: S(I.coal, 1, 1), '#': I.stick });
  m.addRecipe(S(I.bowlEmpty, 4), ['# #', ' # '], { '#': blk(B.planks) });
  m.addRecipe(S(I.glassBottle, 3), ['# #', ' # '], { '#': blk(B.glass) });
  m.addRecipe(S(B.rail, 16), ['X X', 'X#X', 'X X'], { X: I.ingotIron, '#': I.stick });
  m.addRecipe(S(B.railPowered, 6), ['X X', 'X#X', 'XRX'], { X: I.ingotGold, R: I.redstone, '#': I.stick });
  m.addRecipe(S(B.railActivator, 6), ['XSX', 'X#X', 'XSX'], { X: I.ingotIron, '#': blk(B.torchRedstoneActive), S: I.stick });
  m.addRecipe(S(B.railDetector, 6), ['X X', 'X#X', 'XRX'], { X: I.ingotIron, R: I.redstone, '#': blk(B.pressurePlateStone) });
  m.addRecipe(S(I.minecartEmpty, 1), ['# #', '###'], { '#': I.ingotIron });
  m.addRecipe(S(I.cauldron, 1), ['# #', '# #', '###'], { '#': I.ingotIron });
  m.addRecipe(S(I.brewingStand, 1), [' B ', '###'], { '#': blk(B.cobblestone), B: I.blazeRod });
  m.addRecipe(S(B.pumpkinLantern, 1), ['A', 'B'], { A: blk(B.pumpkin), B: blk(B.torchWood) });
  m.addRecipe(S(I.minecartCrate, 1), ['A', 'B'], { A: blk(B.chest), B: I.minecartEmpty });
  m.addRecipe(S(I.minecartPowered, 1), ['A', 'B'], { A: blk(B.furnaceIdle), B: I.minecartEmpty });
  m.addRecipe(S(I.minecartTnt, 1), ['A', 'B'], { A: blk(B.tnt), B: I.minecartEmpty });
  m.addRecipe(S(I.minecartHopper, 1), ['A', 'B'], { A: blk(B.hopperBlock), B: I.minecartEmpty });
  m.addRecipe(S(I.boat, 1), ['# #', '###'], { '#': blk(B.planks) });
  m.addRecipe(S(I.bucketEmpty, 1), ['# #', ' # '], { '#': I.ingotIron });
  m.addRecipe(S(I.flowerPot, 1), ['# #', ' # '], { '#': I.brick });
  m.addRecipe(S(I.flintAndSteel, 1), ['A ', ' B'], { A: I.ingotIron, B: I.flint });
  m.addRecipe(S(I.bread, 1), ['###'], { '#': I.wheat });
  m.addRecipe(S(B.stairsWoodOak, 4), ['#  ', '## ', '###'], { '#': S(B.planks, 1, 0) });
  m.addRecipe(S(B.stairsWoodBirch, 4), ['#  ', '## ', '###'], { '#': S(B.planks, 1, 2) });
  m.addRecipe(S(B.stairsWoodSpruce, 4), ['#  ', '## ', '###'], { '#': S(B.planks, 1, 1) });
  m.addRecipe(S(B.stairsWoodJungle, 4), ['#  ', '## ', '###'], { '#': S(B.planks, 1, 3) });
  m.addRecipe(S(I.fishingRod, 1), ['  #', ' #X', '# X'], { '#': I.stick, X: I.silk });
  m.addRecipe(S(I.carrotOnAStick, 1), ['# ', ' X'], { '#': I.fishingRod, X: I.carrot }).setCopyIngredientNBT();
  m.addRecipe(S(B.stairsCobblestone, 4), ['#  ', '## ', '###'], { '#': blk(B.cobblestone) });
  m.addRecipe(S(B.stairsBrick, 4), ['#  ', '## ', '###'], { '#': blk(B.brick) });
  m.addRecipe(S(B.stairsStoneBrick, 4), ['#  ', '## ', '###'], { '#': blk(B.stoneBrick) });
  m.addRecipe(S(B.stairsNetherBrick, 4), ['#  ', '## ', '###'], { '#': blk(B.netherBrick) });
  m.addRecipe(S(B.stairsSandStone, 4), ['#  ', '## ', '###'], { '#': blk(B.sandStone) });
  m.addRecipe(S(B.stairsNetherQuartz, 4), ['#  ', '## ', '###'], { '#': blk(B.blockNetherQuartz) });
  m.addRecipe(S(I.painting, 1), ['###', '#X#', '###'], { '#': I.stick, X: blk(B.cloth) });
  m.addRecipe(S(I.itemFrame, 1), ['###', '#X#', '###'], { '#': I.stick, X: I.leather });
  m.addRecipe(S(I.appleGold, 1, 0), ['###', '#X#', '###'], { '#': I.goldNugget, X: I.appleRed });
  m.addRecipe(S(I.appleGold, 1, 1), ['###', '#X#', '###'], { '#': blk(B.blockGold), X: I.appleRed });
  m.addRecipe(S(I.goldenCarrot, 1, 0), ['###', '#X#', '###'], { '#': I.goldNugget, X: I.carrot });
  m.addRecipe(S(B.lever, 1), ['X', '#'], { '#': blk(B.cobblestone), X: I.stick });
  m.addRecipe(S(B.tripWireSource, 2), ['I', 'S', '#'], { '#': blk(B.planks), S: I.stick, I: I.ingotIron });
  m.addRecipe(S(B.torchRedstoneActive, 1), ['X', '#'], { '#': I.stick, X: I.redstone });
  m.addRecipe(S(I.redstoneRepeater, 1), ['#X#', 'III'], { '#': blk(B.torchRedstoneActive), X: I.redstone, I: blk(B.stone) });
  m.addRecipe(S(I.comparator, 1), [' # ', '#X#', 'III'], { '#': blk(B.torchRedstoneActive), X: I.netherQuartz, I: blk(B.stone) });
  m.addRecipe(S(I.pocketSundial, 1), [' # ', '#X#', ' # '], { '#': I.ingotGold, X: I.redstone });
  m.addRecipe(S(I.compass, 1), [' # ', '#X#', ' # '], { '#': I.ingotIron, X: I.redstone });
  m.addRecipe(S(I.emptyMap, 1), ['###', '#X#', '###'], { '#': I.paper, X: I.compass });
  m.addRecipe(S(B.stoneButton, 1), ['#'], { '#': blk(B.stone) });
  m.addRecipe(S(B.woodenButton, 1), ['#'], { '#': blk(B.planks) });
  m.addRecipe(S(B.pressurePlateStone, 1), ['##'], { '#': blk(B.stone) });
  m.addRecipe(S(B.pressurePlatePlanks, 1), ['##'], { '#': blk(B.planks) });
  m.addRecipe(S(B.pressurePlateIron, 1), ['##'], { '#': I.ingotIron });
  m.addRecipe(S(B.pressurePlateGold, 1), ['##'], { '#': I.ingotGold });
  m.addRecipe(S(B.dispenser, 1), ['###', '#X#', '#R#'], { '#': blk(B.cobblestone), X: I.bow, R: I.redstone });
  m.addRecipe(S(B.dropper, 1), ['###', '# #', '#R#'], { '#': blk(B.cobblestone), R: I.redstone });
  m.addRecipe(S(B.pistonBase, 1), ['TTT', '#X#', '#R#'], { '#': blk(B.cobblestone), X: I.ingotIron, R: I.redstone, T: blk(B.planks) });
  m.addRecipe(S(B.pistonStickyBase, 1), ['S', 'P'], { S: I.slimeBall, P: blk(B.pistonBase) });
  m.addRecipe(S(I.bed, 1), ['###', 'XXX'], { '#': blk(B.cloth), X: blk(B.planks) });
  m.addRecipe(S(B.enchantmentTable, 1), [' B ', 'D#D', '###'], { '#': blk(B.obsidian), B: I.book, D: I.diamond });
  m.addRecipe(S(B.anvil, 1), ['III', ' i ', 'iii'], { I: blk(B.blockIron), i: I.ingotIron });
  m.addShapelessRecipe(S(I.eyeOfEnder, 1), I.enderPearl, I.blazePowder);
  m.addShapelessRecipe(S(I.fireballCharge, 3), I.gunpowder, I.blazePowder, I.coal);
  m.addShapelessRecipe(S(I.fireballCharge, 3), I.gunpowder, I.blazePowder, S(I.coal, 1, 1));
  m.addRecipe(S(B.daylightSensor), ['GGG', 'QQQ', 'WWW'], { G: blk(B.glass), Q: I.netherQuartz, W: blk(B.woodSingleSlab) });
  m.addRecipe(S(B.hopperBlock), ['I I', 'ICI', ' I '], { I: I.ingotIron, C: blk(B.chest) });
}

CraftingManager.vanillaRecipes = registerVanillaRecipes;
