import { Block } from '../block/Block';
import { BlockIds } from '../block/BlockIds';
import { Material } from '../block/Material';
import '../block/Blocks';
import { Enchantment } from '../enchantment/Enchantment';
import { EnchantmentData } from '../enchantment/EnchantmentHelper';
import { Potion } from '../potion/Potion';
import { PotionHelper } from '../potion/PotionHelper';
import { bindCreativeTabsItemList, CreativeTabs } from './CreativeTabs';
import { Item } from './Item';
import { EnumArmorMaterial as A, ItemArmor } from './ItemArmor';
import { ItemBlock } from './ItemBlock';
import { ItemAnvilBlock, ItemCloth, ItemColored, ItemLeaves, ItemLilyPad, ItemMultiTextureTile, ItemPiston, ItemSlab, ItemSnow } from './ItemBlockVariants';
import { ItemBow, ItemCarrotOnAStick, ItemFishingRod } from './ItemBow';
import { ItemDye } from './ItemDye';
import { ItemAppleGold, ItemFood, ItemSeedFood, ItemSeeds, ItemSoup } from './ItemFood';
import { ItemEmptyMap, ItemMap } from './ItemMap';
import { ItemBook, ItemCoal, ItemEditableBook, ItemEnchantedBook, ItemFirework, ItemFireworkCharge, ItemRecord, ItemShears, ItemSimpleFoiled, ItemWritableBook } from './ItemMisc';
import { ItemBed, ItemBoat, ItemBucket, ItemBucketMilk, ItemDoor, ItemHangingEntity, ItemMinecart, ItemMonsterPlacer, ItemRedstone, ItemSaddle, ItemSign, ItemSkull } from './ItemPlacers';
import { ItemGlassBottle, ItemPotion } from './ItemPotion';
import { ItemReed } from './ItemReed';
import type { ItemStack } from './ItemStack';
import './crafting/Recipes';
import { ItemHoe, ItemSword } from './ItemSword';
import { ItemEnderEye, ItemEnderPearl, ItemExpBottle, ItemFireball, ItemFlintAndSteel, ItemThrowable } from './ItemThrowable';
import { EnumToolMaterial as M, ItemAxe, ItemPickaxe, ItemSpade } from './ItemTool';

const T = CreativeTabs;
const B = BlockIds;

/**
 * Every item of 1.5.2 in the order of Item's static initialiser (itemID = 256 + index; records
 * use 2000-2011, i.e. ids 2256-2267), with its unlocalized name (lang key and icon name),
 * creative tab, stack size, durability and brewing effect.
 */
export const Items = {
  shovelIron: new ItemSpade(0, M.IRON).setUnlocalizedName('shovelIron'),
  pickaxeIron: new ItemPickaxe(1, M.IRON).setUnlocalizedName('pickaxeIron'),
  axeIron: new ItemAxe(2, M.IRON).setUnlocalizedName('hatchetIron'),
  flintAndSteel: new ItemFlintAndSteel(3).setUnlocalizedName('flintAndSteel'),
  appleRed: new ItemFood(4, 4, 0.3, false).setUnlocalizedName('apple'),
  bow: new ItemBow(5).setUnlocalizedName('bow'),
  arrow: new Item(6).setUnlocalizedName('arrow').setCreativeTab(T.tabCombat),
  coal: new ItemCoal(7).setUnlocalizedName('coal'),
  diamond: new Item(8).setUnlocalizedName('diamond').setCreativeTab(T.tabMaterials),
  ingotIron: new Item(9).setUnlocalizedName('ingotIron').setCreativeTab(T.tabMaterials),
  ingotGold: new Item(10).setUnlocalizedName('ingotGold').setCreativeTab(T.tabMaterials),
  swordIron: new ItemSword(11, M.IRON).setUnlocalizedName('swordIron'),
  swordWood: new ItemSword(12, M.WOOD).setUnlocalizedName('swordWood'),
  shovelWood: new ItemSpade(13, M.WOOD).setUnlocalizedName('shovelWood'),
  pickaxeWood: new ItemPickaxe(14, M.WOOD).setUnlocalizedName('pickaxeWood'),
  axeWood: new ItemAxe(15, M.WOOD).setUnlocalizedName('hatchetWood'),
  swordStone: new ItemSword(16, M.STONE).setUnlocalizedName('swordStone'),
  shovelStone: new ItemSpade(17, M.STONE).setUnlocalizedName('shovelStone'),
  pickaxeStone: new ItemPickaxe(18, M.STONE).setUnlocalizedName('pickaxeStone'),
  axeStone: new ItemAxe(19, M.STONE).setUnlocalizedName('hatchetStone'),
  swordDiamond: new ItemSword(20, M.EMERALD).setUnlocalizedName('swordDiamond'),
  shovelDiamond: new ItemSpade(21, M.EMERALD).setUnlocalizedName('shovelDiamond'),
  pickaxeDiamond: new ItemPickaxe(22, M.EMERALD).setUnlocalizedName('pickaxeDiamond'),
  axeDiamond: new ItemAxe(23, M.EMERALD).setUnlocalizedName('hatchetDiamond'),
  stick: new Item(24).setFull3D().setUnlocalizedName('stick').setCreativeTab(T.tabMaterials),
  bowlEmpty: new Item(25).setUnlocalizedName('bowl').setCreativeTab(T.tabMaterials),
  bowlSoup: new ItemSoup(26, 6).setUnlocalizedName('mushroomStew'),
  swordGold: new ItemSword(27, M.GOLD).setUnlocalizedName('swordGold'),
  shovelGold: new ItemSpade(28, M.GOLD).setUnlocalizedName('shovelGold'),
  pickaxeGold: new ItemPickaxe(29, M.GOLD).setUnlocalizedName('pickaxeGold'),
  axeGold: new ItemAxe(30, M.GOLD).setUnlocalizedName('hatchetGold'),
  silk: new ItemReed(31, B.tripWire).setUnlocalizedName('string').setCreativeTab(T.tabMaterials),
  feather: new Item(32).setUnlocalizedName('feather').setCreativeTab(T.tabMaterials),
  gunpowder: new Item(33).setUnlocalizedName('sulphur').setPotionEffect(PotionHelper.gunpowderEffect).setCreativeTab(T.tabMaterials),
  hoeWood: new ItemHoe(34, M.WOOD).setUnlocalizedName('hoeWood'),
  hoeStone: new ItemHoe(35, M.STONE).setUnlocalizedName('hoeStone'),
  hoeIron: new ItemHoe(36, M.IRON).setUnlocalizedName('hoeIron'),
  hoeDiamond: new ItemHoe(37, M.EMERALD).setUnlocalizedName('hoeDiamond'),
  hoeGold: new ItemHoe(38, M.GOLD).setUnlocalizedName('hoeGold'),
  seeds: new ItemSeeds(39, B.crops, B.tilledField).setUnlocalizedName('seeds'),
  wheat: new Item(40).setUnlocalizedName('wheat').setCreativeTab(T.tabMaterials),
  bread: new ItemFood(41, 5, 0.6, false).setUnlocalizedName('bread'),
  helmetLeather: new ItemArmor(42, A.CLOTH, 0, 0).setUnlocalizedName('helmetCloth'),
  plateLeather: new ItemArmor(43, A.CLOTH, 0, 1).setUnlocalizedName('chestplateCloth'),
  legsLeather: new ItemArmor(44, A.CLOTH, 0, 2).setUnlocalizedName('leggingsCloth'),
  bootsLeather: new ItemArmor(45, A.CLOTH, 0, 3).setUnlocalizedName('bootsCloth'),
  helmetChain: new ItemArmor(46, A.CHAIN, 1, 0).setUnlocalizedName('helmetChain'),
  plateChain: new ItemArmor(47, A.CHAIN, 1, 1).setUnlocalizedName('chestplateChain'),
  legsChain: new ItemArmor(48, A.CHAIN, 1, 2).setUnlocalizedName('leggingsChain'),
  bootsChain: new ItemArmor(49, A.CHAIN, 1, 3).setUnlocalizedName('bootsChain'),
  helmetIron: new ItemArmor(50, A.IRON, 2, 0).setUnlocalizedName('helmetIron'),
  plateIron: new ItemArmor(51, A.IRON, 2, 1).setUnlocalizedName('chestplateIron'),
  legsIron: new ItemArmor(52, A.IRON, 2, 2).setUnlocalizedName('leggingsIron'),
  bootsIron: new ItemArmor(53, A.IRON, 2, 3).setUnlocalizedName('bootsIron'),
  helmetDiamond: new ItemArmor(54, A.DIAMOND, 3, 0).setUnlocalizedName('helmetDiamond'),
  plateDiamond: new ItemArmor(55, A.DIAMOND, 3, 1).setUnlocalizedName('chestplateDiamond'),
  legsDiamond: new ItemArmor(56, A.DIAMOND, 3, 2).setUnlocalizedName('leggingsDiamond'),
  bootsDiamond: new ItemArmor(57, A.DIAMOND, 3, 3).setUnlocalizedName('bootsDiamond'),
  helmetGold: new ItemArmor(58, A.GOLD, 4, 0).setUnlocalizedName('helmetGold'),
  plateGold: new ItemArmor(59, A.GOLD, 4, 1).setUnlocalizedName('chestplateGold'),
  legsGold: new ItemArmor(60, A.GOLD, 4, 2).setUnlocalizedName('leggingsGold'),
  bootsGold: new ItemArmor(61, A.GOLD, 4, 3).setUnlocalizedName('bootsGold'),
  flint: new Item(62).setUnlocalizedName('flint').setCreativeTab(T.tabMaterials),
  porkRaw: new ItemFood(63, 3, 0.3, true).setUnlocalizedName('porkchopRaw'),
  porkCooked: new ItemFood(64, 8, 0.8, true).setUnlocalizedName('porkchopCooked'),
  painting: new ItemHangingEntity(65, 'Painting').setUnlocalizedName('painting'),
  appleGold: new ItemAppleGold(66, 4, 1.2, false).setAlwaysEdible().setFoodPotionEffect(Potion.regeneration.id, 5, 0, 1).setUnlocalizedName('appleGold'),
  sign: new ItemSign(67).setUnlocalizedName('sign'),
  doorWood: new ItemDoor(68, Material.wood).setUnlocalizedName('doorWood'),
  bucketEmpty: new ItemBucket(69, 0).setUnlocalizedName('bucket').setMaxStackSize(16),
  bucketWater: new ItemBucket(70, B.waterMoving).setUnlocalizedName('bucketWater'),
  bucketLava: new ItemBucket(71, B.lavaMoving).setUnlocalizedName('bucketLava'),
  minecartEmpty: new ItemMinecart(72, 0).setUnlocalizedName('minecart'),
  saddle: new ItemSaddle(73).setUnlocalizedName('saddle'),
  doorIron: new ItemDoor(74, Material.iron).setUnlocalizedName('doorIron'),
  redstone: new ItemRedstone(75).setUnlocalizedName('redstone').setPotionEffect(PotionHelper.redstoneEffect),
  snowball: new ItemThrowable(76, 'Snowball', 16, T.tabMisc).setUnlocalizedName('snowball'),
  boat: new ItemBoat(77).setUnlocalizedName('boat'),
  leather: new Item(78).setUnlocalizedName('leather').setCreativeTab(T.tabMaterials),
  bucketMilk: new ItemBucketMilk(79).setUnlocalizedName('milk'),
  brick: new Item(80).setUnlocalizedName('brick').setCreativeTab(T.tabMaterials),
  clay: new Item(81).setUnlocalizedName('clay').setCreativeTab(T.tabMaterials),
  reed: new ItemReed(82, B.reed).setUnlocalizedName('reeds').setCreativeTab(T.tabMaterials),
  paper: new Item(83).setUnlocalizedName('paper').setCreativeTab(T.tabMisc),
  book: new ItemBook(84).setUnlocalizedName('book').setCreativeTab(T.tabMisc),
  slimeBall: new Item(85).setUnlocalizedName('slimeball').setCreativeTab(T.tabMisc),
  minecartCrate: new ItemMinecart(86, 1).setUnlocalizedName('minecartChest'),
  minecartPowered: new ItemMinecart(87, 2).setUnlocalizedName('minecartFurnace'),
  egg: new ItemThrowable(88, 'ThrownEgg', 16, T.tabMaterials).setUnlocalizedName('egg'),
  compass: new Item(89).setUnlocalizedName('compass').setCreativeTab(T.tabTools),
  fishingRod: new ItemFishingRod(90).setUnlocalizedName('fishingRod'),
  pocketSundial: new Item(91).setUnlocalizedName('clock').setCreativeTab(T.tabTools),
  lightStoneDust: new Item(92).setUnlocalizedName('yellowDust').setPotionEffect(PotionHelper.glowstoneEffect).setCreativeTab(T.tabMaterials),
  fishRaw: new ItemFood(93, 2, 0.3, false).setUnlocalizedName('fishRaw'),
  fishCooked: new ItemFood(94, 5, 0.6, false).setUnlocalizedName('fishCooked'),
  dyePowder: new ItemDye(95).setUnlocalizedName('dyePowder'),
  bone: new Item(96).setUnlocalizedName('bone').setFull3D().setCreativeTab(T.tabMisc),
  sugar: new Item(97).setUnlocalizedName('sugar').setPotionEffect(PotionHelper.sugarEffect).setCreativeTab(T.tabMaterials),
  cake: new ItemReed(98, B.cake).setMaxStackSize(1).setUnlocalizedName('cake').setCreativeTab(T.tabFood),
  bed: new ItemBed(99).setMaxStackSize(1).setUnlocalizedName('bed'),
  redstoneRepeater: new ItemReed(100, B.redstoneRepeaterIdle).setUnlocalizedName('diode').setCreativeTab(T.tabRedstone),
  cookie: new ItemFood(101, 2, 0.1, false).setUnlocalizedName('cookie'),
  map: new ItemMap(102).setUnlocalizedName('map'),
  shears: new ItemShears(103).setUnlocalizedName('shears'),
  melon: new ItemFood(104, 2, 0.3, false).setUnlocalizedName('melon'),
  pumpkinSeeds: new ItemSeeds(105, B.pumpkinStem, B.tilledField).setUnlocalizedName('seeds_pumpkin'),
  melonSeeds: new ItemSeeds(106, B.melonStem, B.tilledField).setUnlocalizedName('seeds_melon'),
  beefRaw: new ItemFood(107, 3, 0.3, true).setUnlocalizedName('beefRaw'),
  beefCooked: new ItemFood(108, 8, 0.8, true).setUnlocalizedName('beefCooked'),
  chickenRaw: new ItemFood(109, 2, 0.3, true).setFoodPotionEffect(Potion.hunger.id, 30, 0, 0.3).setUnlocalizedName('chickenRaw'),
  chickenCooked: new ItemFood(110, 6, 0.6, true).setUnlocalizedName('chickenCooked'),
  rottenFlesh: new ItemFood(111, 4, 0.1, true).setFoodPotionEffect(Potion.hunger.id, 30, 0, 0.8).setUnlocalizedName('rottenFlesh'),
  enderPearl: new ItemEnderPearl(112).setUnlocalizedName('enderPearl'),
  blazeRod: new Item(113).setUnlocalizedName('blazeRod').setCreativeTab(T.tabMaterials),
  ghastTear: new Item(114).setUnlocalizedName('ghastTear').setPotionEffect(PotionHelper.ghastTearEffect).setCreativeTab(T.tabBrewing),
  goldNugget: new Item(115).setUnlocalizedName('goldNugget').setCreativeTab(T.tabMaterials),
  netherStalkSeeds: new ItemSeeds(116, B.netherStalk, B.slowSand).setUnlocalizedName('netherStalkSeeds').setPotionEffect(PotionHelper.netherWartEffect),
  potion: new ItemPotion(117).setUnlocalizedName('potion'),
  glassBottle: new ItemGlassBottle(118).setUnlocalizedName('glassBottle'),
  spiderEye: new ItemFood(119, 2, 0.8, false).setFoodPotionEffect(Potion.poison.id, 5, 0, 1).setUnlocalizedName('spiderEye').setPotionEffect(PotionHelper.spiderEyeEffect),
  fermentedSpiderEye: new Item(120).setUnlocalizedName('fermentedSpiderEye').setPotionEffect(PotionHelper.fermentedSpiderEyeEffect).setCreativeTab(T.tabBrewing),
  blazePowder: new Item(121).setUnlocalizedName('blazePowder').setPotionEffect(PotionHelper.blazePowderEffect).setCreativeTab(T.tabBrewing),
  magmaCream: new Item(122).setUnlocalizedName('magmaCream').setPotionEffect(PotionHelper.magmaCreamEffect).setCreativeTab(T.tabBrewing),
  brewingStand: new ItemReed(123, B.brewingStand).setUnlocalizedName('brewingStand').setCreativeTab(T.tabBrewing),
  cauldron: new ItemReed(124, B.cauldron).setUnlocalizedName('cauldron').setCreativeTab(T.tabBrewing),
  eyeOfEnder: new ItemEnderEye(125).setUnlocalizedName('eyeOfEnder'),
  speckledMelon: new Item(126).setUnlocalizedName('speckledMelon').setPotionEffect(PotionHelper.speckledMelonEffect).setCreativeTab(T.tabBrewing),
  monsterPlacer: new ItemMonsterPlacer(127).setUnlocalizedName('monsterPlacer'),
  expBottle: new ItemExpBottle(128, 'ThrownExpBottle', 64, T.tabMisc).setUnlocalizedName('expBottle'),
  fireballCharge: new ItemFireball(129).setUnlocalizedName('fireball'),
  writableBook: new ItemWritableBook(130).setUnlocalizedName('writingBook').setCreativeTab(T.tabMisc),
  writtenBook: new ItemEditableBook(131).setUnlocalizedName('writtenBook'),
  emerald: new Item(132).setUnlocalizedName('emerald').setCreativeTab(T.tabMaterials),
  itemFrame: new ItemHangingEntity(133, 'ItemFrame').setUnlocalizedName('frame'),
  flowerPot: new ItemReed(134, B.flowerPot).setUnlocalizedName('flowerPot').setCreativeTab(T.tabDecorations),
  carrot: new ItemSeedFood(135, 4, 0.6, B.carrot, B.tilledField).setUnlocalizedName('carrots'),
  potato: new ItemSeedFood(136, 1, 0.3, B.potato, B.tilledField).setUnlocalizedName('potato'),
  bakedPotato: new ItemFood(137, 6, 0.6, false).setUnlocalizedName('potatoBaked'),
  poisonousPotato: new ItemFood(138, 2, 0.3, false).setFoodPotionEffect(Potion.poison.id, 5, 0, 0.6).setUnlocalizedName('potatoPoisonous'),
  emptyMap: new ItemEmptyMap(139).setUnlocalizedName('emptyMap'),
  goldenCarrot: new ItemFood(140, 6, 1.2, false).setUnlocalizedName('carrotGolden').setPotionEffect(PotionHelper.goldenCarrotEffect),
  skull: new ItemSkull(141).setUnlocalizedName('skull'),
  carrotOnAStick: new ItemCarrotOnAStick(142).setUnlocalizedName('carrotOnAStick'),
  netherStar: new ItemSimpleFoiled(143).setUnlocalizedName('netherStar').setCreativeTab(T.tabMaterials),
  pumpkinPie: new ItemFood(144, 8, 0.3, false).setUnlocalizedName('pumpkinPie').setCreativeTab(T.tabFood),
  firework: new ItemFirework(145).setUnlocalizedName('fireworks'),
  fireworkCharge: new ItemFireworkCharge(146).setUnlocalizedName('fireworksCharge').setCreativeTab(T.tabMisc),
  enchantedBook: new ItemEnchantedBook(147).setMaxStackSize(1).setUnlocalizedName('enchantedBook'),
  comparator: new ItemReed(148, B.redstoneComparatorIdle).setUnlocalizedName('comparator').setCreativeTab(T.tabRedstone),
  netherrackBrick: new Item(149).setUnlocalizedName('netherbrick').setCreativeTab(T.tabMaterials),
  netherQuartz: new Item(150).setUnlocalizedName('netherquartz').setCreativeTab(T.tabMaterials),
  minecartTnt: new ItemMinecart(151, 3).setUnlocalizedName('minecartTnt'),
  minecartHopper: new ItemMinecart(152, 5).setUnlocalizedName('minecartHopper'),
  record13: new ItemRecord(2000, '13').setUnlocalizedName('record'),
  recordCat: new ItemRecord(2001, 'cat').setUnlocalizedName('record'),
  recordBlocks: new ItemRecord(2002, 'blocks').setUnlocalizedName('record'),
  recordChirp: new ItemRecord(2003, 'chirp').setUnlocalizedName('record'),
  recordFar: new ItemRecord(2004, 'far').setUnlocalizedName('record'),
  recordMall: new ItemRecord(2005, 'mall').setUnlocalizedName('record'),
  recordMellohi: new ItemRecord(2006, 'mellohi').setUnlocalizedName('record'),
  recordStal: new ItemRecord(2007, 'stal').setUnlocalizedName('record'),
  recordStrad: new ItemRecord(2008, 'strad').setUnlocalizedName('record'),
  recordWard: new ItemRecord(2009, 'ward').setUnlocalizedName('record'),
  record11: new ItemRecord(2010, '11').setUnlocalizedName('record'),
  recordWait: new ItemRecord(2011, 'wait').setUnlocalizedName('record'),
};

// Containers (setContainerItem in the original declarations).
Items.bucketWater.setContainerItem(Items.bucketEmpty);
Items.bucketLava.setContainerItem(Items.bucketEmpty);
Items.bucketMilk.setContainerItem(Items.bucketEmpty);

/** Subtype names of the multi-texture block items (the String[] tables of the block classes). */
export const BlockItemNames = {
  woodType: ['oak', 'spruce', 'birch', 'jungle'],
  silverfishStoneTypes: ['stone', 'cobble', 'brick'],
  stoneBrickTypes: ['default', 'mossy', 'cracked', 'chiseled'],
  sandStoneTypes: ['default', 'chiseled', 'smooth'],
  quartzBlockTypes: ['default', 'chiseled', 'lines'],
  wallTypes: ['normal', 'mossy'],
  anvilStatuses: ['intact', 'slightlyDamaged', 'veryDamaged'],
  tallGrassTypes: ['shrub', 'grass', 'fern'],
} as const;

/**
 * The tail of Block's static initialiser: the special block items (subtypes, slabs, pistons,
 * snow, lily pad, anvil), then a plain ItemBlock (and initializeBlock) for every other block.
 * Blocks that are not registered yet are skipped and get their item when they appear.
 */
export function registerBlockItems(): void {
  const list = Item.itemsList;
  const ib = (id: number) => id - 256;
  const has = (id: number) => Block.blocksList[id] !== null && list[id] === null;
  const N = BlockItemNames;
  if (has(B.cloth)) list[B.cloth] = new ItemCloth(ib(B.cloth)).setUnlocalizedName('cloth');
  if (has(B.wood)) list[B.wood] = new ItemMultiTextureTile(ib(B.wood), N.woodType).setUnlocalizedName('log');
  if (has(B.planks)) list[B.planks] = new ItemMultiTextureTile(ib(B.planks), N.woodType).setUnlocalizedName('wood');
  if (has(B.silverfish)) list[B.silverfish] = new ItemMultiTextureTile(ib(B.silverfish), N.silverfishStoneTypes).setUnlocalizedName('monsterStoneEgg');
  if (has(B.stoneBrick)) list[B.stoneBrick] = new ItemMultiTextureTile(ib(B.stoneBrick), N.stoneBrickTypes).setUnlocalizedName('stonebricksmooth');
  if (has(B.sandStone)) list[B.sandStone] = new ItemMultiTextureTile(ib(B.sandStone), N.sandStoneTypes).setUnlocalizedName('sandStone');
  if (has(B.blockNetherQuartz)) list[B.blockNetherQuartz] = new ItemMultiTextureTile(ib(B.blockNetherQuartz), N.quartzBlockTypes).setUnlocalizedName('quartzBlock');
  if (has(B.stoneSingleSlab)) list[B.stoneSingleSlab] = new ItemSlab(ib(B.stoneSingleSlab), B.stoneSingleSlab, B.stoneDoubleSlab, false).setUnlocalizedName('stoneSlab');
  if (has(B.stoneDoubleSlab)) list[B.stoneDoubleSlab] = new ItemSlab(ib(B.stoneDoubleSlab), B.stoneSingleSlab, B.stoneDoubleSlab, true).setUnlocalizedName('stoneSlab');
  if (has(B.woodSingleSlab)) list[B.woodSingleSlab] = new ItemSlab(ib(B.woodSingleSlab), B.woodSingleSlab, B.woodDoubleSlab, false).setUnlocalizedName('woodSlab');
  if (has(B.woodDoubleSlab)) list[B.woodDoubleSlab] = new ItemSlab(ib(B.woodDoubleSlab), B.woodSingleSlab, B.woodDoubleSlab, true).setUnlocalizedName('woodSlab');
  if (has(B.sapling)) list[B.sapling] = new ItemMultiTextureTile(ib(B.sapling), N.woodType).setUnlocalizedName('sapling');
  if (has(B.leaves)) list[B.leaves] = new ItemLeaves(ib(B.leaves)).setUnlocalizedName('leaves');
  if (has(B.vine)) list[B.vine] = new ItemColored(ib(B.vine), false);
  if (has(B.tallGrass)) list[B.tallGrass] = new ItemColored(ib(B.tallGrass), true).setBlockNames([...N.tallGrassTypes]);
  if (has(B.snow)) list[B.snow] = new ItemSnow(ib(B.snow));
  if (has(B.waterlily)) list[B.waterlily] = new ItemLilyPad(ib(B.waterlily));
  if (has(B.pistonBase)) list[B.pistonBase] = new ItemPiston(ib(B.pistonBase));
  if (has(B.pistonStickyBase)) list[B.pistonStickyBase] = new ItemPiston(ib(B.pistonStickyBase));
  if (has(B.cobblestoneWall)) list[B.cobblestoneWall] = new ItemMultiTextureTile(ib(B.cobblestoneWall), N.wallTypes).setUnlocalizedName('cobbleWall');
  if (has(B.anvil)) list[B.anvil] = new ItemAnvilBlock(ib(B.anvil), N.anvilStatuses).setUnlocalizedName('anvil');
  for (let id = 0; id < 256; id++) {
    const b = Block.blocksList[id];
    if (b && !list[id]) {
      list[id] = new ItemBlock(id - 256);
      b.initializeBlock();
    }
  }
  bindCreativeTabsItemList(list);
}

/** func_92116_a: one max-level enchanted book per enchantment whose type is in `types`. */
function addEnchantedBooks(types: readonly string[], out: ItemStack[]): void {
  for (const e of Enchantment.enchantmentsList) {
    if (e && types.includes(e.type.name)) out.push(Items.enchantedBook.getEnchantedItemStack(new EnchantmentData(e, e.getMaxLevel())));
  }
}
CreativeTabs.enchantedBookProvider = addEnchantedBooks;

/**
 * Every stack of the creative search tab (GuiContainerCreative.updateCreativeSearch before
 * filtering): each item with a creative tab, then every enchanted book at every level.
 */
export function getAllCreativeItems(): ItemStack[] {
  const out: ItemStack[] = [];
  for (const item of Item.itemsList) if (item && item.getCreativeTab() !== null) item.getSubItems(item.itemID, null, out);
  for (const e of Enchantment.enchantmentsList) if (e) Items.enchantedBook.addAllLevels(e, out);
  return out;
}

registerBlockItems();
