import { CreativeTabs } from '../item/CreativeTabs';
import '../world/tileentity/TileEntities';
import { Block } from './Block';
import { BlockAnvil } from './BlockAnvil';
import { BlockPressurePlate, BlockPressurePlateWeighted } from './BlockBasePressurePlate';
import { BlockBeacon } from './BlockBeacon';
import { BlockBed } from './BlockBed';
import { BlockBookshelf } from './BlockBookshelf';
import { BlockBrewingStand } from './BlockBrewingStand';
import { BlockButtonStone, BlockButtonWood } from './BlockButton';
import { BlockCactus } from './BlockCactus';
import { BlockCake } from './BlockCake';
import { BlockCarrot } from './BlockCarrot';
import { BlockCauldron } from './BlockCauldron';
import { BlockChest } from './BlockChest';
import { BlockClay } from './BlockClay';
import { BlockCloth } from './BlockCloth';
import { BlockCocoa } from './BlockCocoa';
import { BlockCommandBlock } from './BlockCommandBlock';
import { BlockCrops } from './BlockCrops';
import { BlockDaylightDetector } from './BlockDaylightDetector';
import { BlockDeadBush } from './BlockDeadBush';
import { BlockDirt } from './BlockDirt';
import { BlockDispenser, BlockDropper } from './BlockDispenser';
import { BlockDoor } from './BlockDoor';
import { BlockDragonEgg } from './BlockDragonEgg';
import { BlockEnchantmentTable } from './BlockEnchantmentTable';
import { BlockEndPortal } from './BlockEndPortal';
import { BlockEndPortalFrame } from './BlockEndPortalFrame';
import { BlockEnderChest } from './BlockEnderChest';
import { BlockFarmland } from './BlockFarmland';
import { BlockFence } from './BlockFence';
import { BlockFenceGate } from './BlockFenceGate';
import { BlockFire } from './BlockFire';
import { BlockFlower } from './BlockFlower';
import { BlockFlowerPot } from './BlockFlowerPot';
import { BlockFlowing } from './BlockFlowing';
import { BlockFurnace } from './BlockFurnace';
import { BlockGlass } from './BlockGlass';
import { BlockGlowStone } from './BlockGlowStone';
import { BlockGrass } from './BlockGrass';
import { BlockGravel } from './BlockGravel';
import { BlockHopper } from './BlockHopper';
import { BlockIce } from './BlockIce';
import { BlockJukeBox } from './BlockJukeBox';
import { BlockLadder } from './BlockLadder';
import { BlockLeaves } from './BlockLeaves';
import { BlockLever } from './BlockLever';
import { BlockLilyPad } from './BlockLilyPad';
import { BlockLockedChest } from './BlockLockedChest';
import { BlockLog } from './BlockLog';
import { BlockMelon } from './BlockMelon';
import { BlockMobSpawner } from './BlockMobSpawner';
import { BlockMushroom } from './BlockMushroom';
import { BlockMushroomCap } from './BlockMushroomCap';
import { BlockMycelium } from './BlockMycelium';
import { BlockNetherStalk } from './BlockNetherStalk';
import { BlockNetherrack } from './BlockNetherrack';
import { BlockNote } from './BlockNote';
import { BlockObsidian } from './BlockObsidian';
import { BlockOre } from './BlockOre';
import { BlockOreStorage } from './BlockOreStorage';
import { BlockPane } from './BlockPane';
import { BlockPistonBase } from './BlockPistonBase';
import { BlockPistonExtension } from './BlockPistonExtension';
import { BlockPistonMoving } from './BlockPistonMoving';
import { BlockPortal } from './BlockPortal';
import { BlockPotato } from './BlockPotato';
import { BlockPoweredOre } from './BlockPoweredOre';
import { BlockPumpkin } from './BlockPumpkin';
import { BlockQuartz } from './BlockQuartz';
import { BlockRail, BlockRailPowered, BlockDetectorRail } from './BlockRailBase';
import { BlockRedstoneLight } from './BlockRedstoneLight';
import { BlockRedstoneRepeater, BlockComparator } from './BlockRedstoneLogic';
import { BlockRedstoneOre } from './BlockRedstoneOre';
import { BlockRedstoneTorch } from './BlockRedstoneTorch';
import { BlockRedstoneWire } from './BlockRedstoneWire';
import { BlockReed } from './BlockReed';
import { BlockSand } from './BlockSand';
import { BlockSandStone } from './BlockSandStone';
import { BlockSapling } from './BlockSapling';
import { BlockSign } from './BlockSign';
import { BlockSilverfish } from './BlockSilverfish';
import { BlockSkull } from './BlockSkull';
import { BlockSnow } from './BlockSnow';
import { BlockSnowBlock } from './BlockSnowBlock';
import { BlockSoulSand } from './BlockSoulSand';
import { BlockSponge } from './BlockSponge';
import { BlockStairs } from './BlockStairs';
import { BlockStationary } from './BlockStationary';
import { BlockStem } from './BlockStem';
import { BlockStep } from './BlockStep';
import { BlockStone } from './BlockStone';
import { BlockStoneBrick } from './BlockStoneBrick';
import { BlockTNT } from './BlockTNT';
import { BlockTallGrass } from './BlockTallGrass';
import { BlockTorch } from './BlockTorch';
import { BlockTrapDoor } from './BlockTrapDoor';
import { BlockTripWire } from './BlockTripWire';
import { BlockTripWireSource } from './BlockTripWireSource';
import { BlockVine } from './BlockVine';
import { BlockWall } from './BlockWall';
import { BlockWeb } from './BlockWeb';
import { BlockWood } from './BlockWood';
import { BlockWoodSlab } from './BlockWoodSlab';
import { BlockWorkbench } from './BlockWorkbench';
import { Material } from './Material';
import { StepSounds as S } from './StepSound';

/**
 * The block registry: one line per block with the exact 1.5.2 constructor arguments and
 * properties (see Block.java). To add a block, create its subclass file and add a line
 * here; `finishBlockRegistry()` at the bottom derives the lookup tables.
 *
 * Import this module (not individual block files) before using any block.
 */
export const Blocks = {
  stone: new BlockStone(1).setHardness(1.5).setResistance(10).setStepSound(S.soundStoneFootstep).setUnlocalizedName('stone'),
  grass: new BlockGrass(2).setHardness(0.6).setStepSound(S.soundGrassFootstep).setUnlocalizedName('grass'),
  dirt: new BlockDirt(3).setHardness(0.5).setStepSound(S.soundGravelFootstep).setUnlocalizedName('dirt'),
  cobblestone: new Block(4, Material.rock).setHardness(2).setResistance(10).setStepSound(S.soundStoneFootstep).setUnlocalizedName('stonebrick').setCreativeTab(CreativeTabs.tabBlock),
  planks: new BlockWood(5).setHardness(2).setResistance(5).setStepSound(S.soundWoodFootstep).setUnlocalizedName('wood'),
  sapling: new BlockSapling(6).setHardness(0).setStepSound(S.soundGrassFootstep).setUnlocalizedName('sapling'),
  bedrock: new Block(7, Material.rock)
    .setBlockUnbreakable()
    .setResistance(6000000)
    .setStepSound(S.soundStoneFootstep)
    .setUnlocalizedName('bedrock')
    .disableStats()
    .setCreativeTab(CreativeTabs.tabBlock),
  waterMoving: new BlockFlowing(8, Material.water).setHardness(100).setLightOpacity(3).setUnlocalizedName('water').disableStats(),
  waterStill: new BlockStationary(9, Material.water).setHardness(100).setLightOpacity(3).setUnlocalizedName('water').disableStats(),
  lavaMoving: new BlockFlowing(10, Material.lava).setHardness(0).setLightValue(1).setUnlocalizedName('lava').disableStats(),
  lavaStill: new BlockStationary(11, Material.lava).setHardness(100).setLightValue(1).setUnlocalizedName('lava').disableStats(),
  sand: new BlockSand(12).setHardness(0.5).setStepSound(S.soundSandFootstep).setUnlocalizedName('sand'),
  gravel: new BlockGravel(13).setHardness(0.6).setStepSound(S.soundGravelFootstep).setUnlocalizedName('gravel'),
  oreGold: new BlockOre(14).setHardness(3).setResistance(5).setStepSound(S.soundStoneFootstep).setUnlocalizedName('oreGold'),
  oreIron: new BlockOre(15).setHardness(3).setResistance(5).setStepSound(S.soundStoneFootstep).setUnlocalizedName('oreIron'),
  oreCoal: new BlockOre(16).setHardness(3).setResistance(5).setStepSound(S.soundStoneFootstep).setUnlocalizedName('oreCoal'),
  wood: new BlockLog(17).setHardness(2).setStepSound(S.soundWoodFootstep).setUnlocalizedName('log'),
  leaves: new BlockLeaves(18).setHardness(0.2).setLightOpacity(1).setStepSound(S.soundGrassFootstep).setUnlocalizedName('leaves'),
  sponge: new BlockSponge(19).setHardness(0.6).setStepSound(S.soundGrassFootstep).setUnlocalizedName('sponge'),
  glass: new BlockGlass(20, Material.glass, false).setHardness(0.3).setStepSound(S.soundGlassFootstep).setUnlocalizedName('glass'),
  oreLapis: new BlockOre(21).setHardness(3).setResistance(5).setStepSound(S.soundStoneFootstep).setUnlocalizedName('oreLapis'),
  blockLapis: new Block(22, Material.rock).setHardness(3).setResistance(5).setStepSound(S.soundStoneFootstep).setUnlocalizedName('blockLapis').setCreativeTab(CreativeTabs.tabBlock),
  dispenser: new BlockDispenser(23).setHardness(3.5).setStepSound(S.soundStoneFootstep).setUnlocalizedName('dispenser'),
  sandStone: new BlockSandStone(24).setStepSound(S.soundStoneFootstep).setHardness(0.8).setUnlocalizedName('sandStone'),
  music: new BlockNote(25).setHardness(0.8).setUnlocalizedName('musicBlock'),
  bed: new BlockBed(26).setHardness(0.2).setUnlocalizedName('bed').disableStats(),
  railPowered: new BlockRailPowered(27).setHardness(0.7).setStepSound(S.soundMetalFootstep).setUnlocalizedName('goldenRail'),
  railDetector: new BlockDetectorRail(28).setHardness(0.7).setStepSound(S.soundMetalFootstep).setUnlocalizedName('detectorRail'),
  pistonStickyBase: new BlockPistonBase(29, true).setUnlocalizedName('pistonStickyBase'),
  web: new BlockWeb(30).setLightOpacity(1).setHardness(4).setUnlocalizedName('web'),
  tallGrass: new BlockTallGrass(31).setHardness(0).setStepSound(S.soundGrassFootstep).setUnlocalizedName('tallgrass'),
  deadBush: new BlockDeadBush(32).setHardness(0).setStepSound(S.soundGrassFootstep).setUnlocalizedName('deadbush'),
  pistonBase: new BlockPistonBase(33, false).setUnlocalizedName('pistonBase'),
  pistonExtension: new BlockPistonExtension(34),
  cloth: new BlockCloth(35).setHardness(0.8).setStepSound(S.soundClothFootstep).setUnlocalizedName('cloth'),
  pistonMoving: new BlockPistonMoving(36),
  plantYellow: new BlockFlower(37).setHardness(0).setStepSound(S.soundGrassFootstep).setUnlocalizedName('flower'),
  plantRed: new BlockFlower(38).setHardness(0).setStepSound(S.soundGrassFootstep).setUnlocalizedName('rose'),
  mushroomBrown: new BlockMushroom(39, 'mushroom_brown').setHardness(0).setStepSound(S.soundGrassFootstep).setLightValue(0.125).setUnlocalizedName('mushroom'),
  mushroomRed: new BlockMushroom(40, 'mushroom_red').setHardness(0).setStepSound(S.soundGrassFootstep).setUnlocalizedName('mushroom'),
  blockGold: new BlockOreStorage(41).setHardness(3).setResistance(10).setStepSound(S.soundMetalFootstep).setUnlocalizedName('blockGold'),
  blockIron: new BlockOreStorage(42).setHardness(5).setResistance(10).setStepSound(S.soundMetalFootstep).setUnlocalizedName('blockIron'),
  stoneDoubleSlab: new BlockStep(43, true).setHardness(2).setResistance(10).setStepSound(S.soundStoneFootstep).setUnlocalizedName('stoneSlab'),
  stoneSingleSlab: new BlockStep(44, false).setHardness(2).setResistance(10).setStepSound(S.soundStoneFootstep).setUnlocalizedName('stoneSlab'),
  brick: new Block(45, Material.rock).setHardness(2).setResistance(10).setStepSound(S.soundStoneFootstep).setUnlocalizedName('brick').setCreativeTab(CreativeTabs.tabBlock),
  tnt: new BlockTNT(46).setHardness(0).setStepSound(S.soundGrassFootstep).setUnlocalizedName('tnt'),
  bookShelf: new BlockBookshelf(47).setHardness(1.5).setStepSound(S.soundWoodFootstep).setUnlocalizedName('bookshelf'),
  cobblestoneMossy: new Block(48, Material.rock)
    .setHardness(2)
    .setResistance(10)
    .setStepSound(S.soundStoneFootstep)
    .setUnlocalizedName('stoneMoss')
    .setCreativeTab(CreativeTabs.tabBlock),
  obsidian: new BlockObsidian(49).setHardness(50).setResistance(2000).setStepSound(S.soundStoneFootstep).setUnlocalizedName('obsidian'),
  torchWood: new BlockTorch(50).setHardness(0).setLightValue(0.9375).setStepSound(S.soundWoodFootstep).setUnlocalizedName('torch'),
  fire: new BlockFire(51).setHardness(0).setLightValue(1).setStepSound(S.soundWoodFootstep).setUnlocalizedName('fire').disableStats(),
  mobSpawner: new BlockMobSpawner(52).setHardness(5).setStepSound(S.soundMetalFootstep).setUnlocalizedName('mobSpawner').disableStats(),
  stairsWoodOak: new BlockStairs(53, Block.blocksList[5]!, 0).setUnlocalizedName('stairsWood'),
  chest: new BlockChest(54, 0).setHardness(2.5).setStepSound(S.soundWoodFootstep).setUnlocalizedName('chest'),
  redstoneWire: new BlockRedstoneWire(55).setHardness(0).setStepSound(S.soundPowderFootstep).setUnlocalizedName('redstoneDust').disableStats(),
  oreDiamond: new BlockOre(56).setHardness(3).setResistance(5).setStepSound(S.soundStoneFootstep).setUnlocalizedName('oreDiamond'),
  blockDiamond: new BlockOreStorage(57).setHardness(5).setResistance(10).setStepSound(S.soundMetalFootstep).setUnlocalizedName('blockDiamond'),
  workbench: new BlockWorkbench(58).setHardness(2.5).setStepSound(S.soundWoodFootstep).setUnlocalizedName('workbench'),
  crops: new BlockCrops(59).setUnlocalizedName('crops'),
  tilledField: new BlockFarmland(60).setHardness(0.6).setStepSound(S.soundGravelFootstep).setUnlocalizedName('farmland'),
  furnaceIdle: new BlockFurnace(61, false).setHardness(3.5).setStepSound(S.soundStoneFootstep).setUnlocalizedName('furnace').setCreativeTab(CreativeTabs.tabDecorations),
  furnaceBurning: new BlockFurnace(62, true).setHardness(3.5).setStepSound(S.soundStoneFootstep).setLightValue(0.875).setUnlocalizedName('furnace'),
  signPost: new BlockSign(63, true).setHardness(1).setStepSound(S.soundWoodFootstep).setUnlocalizedName('sign').disableStats(),
  doorWood: new BlockDoor(64, Material.wood).setHardness(3).setStepSound(S.soundWoodFootstep).setUnlocalizedName('doorWood').disableStats(),
  ladder: new BlockLadder(65).setHardness(0.4).setStepSound(S.soundLadderFootstep).setUnlocalizedName('ladder'),
  rail: new BlockRail(66).setHardness(0.7).setStepSound(S.soundMetalFootstep).setUnlocalizedName('rail'),
  stairsCobblestone: new BlockStairs(67, Block.blocksList[4]!, 0).setUnlocalizedName('stairsStone'),
  signWall: new BlockSign(68, false).setHardness(1).setStepSound(S.soundWoodFootstep).setUnlocalizedName('sign').disableStats(),
  lever: new BlockLever(69).setHardness(0.5).setStepSound(S.soundWoodFootstep).setUnlocalizedName('lever'),
  pressurePlateStone: new BlockPressurePlate(70, 'stone', Material.rock, 'mobs').setHardness(0.5).setStepSound(S.soundStoneFootstep).setUnlocalizedName('pressurePlate'),
  doorIron: new BlockDoor(71, Material.iron).setHardness(5).setStepSound(S.soundMetalFootstep).setUnlocalizedName('doorIron').disableStats(),
  pressurePlatePlanks: new BlockPressurePlate(72, 'wood', Material.wood, 'everything').setHardness(0.5).setStepSound(S.soundWoodFootstep).setUnlocalizedName('pressurePlate'),
  oreRedstone: new BlockRedstoneOre(73, false)
    .setHardness(3)
    .setResistance(5)
    .setStepSound(S.soundStoneFootstep)
    .setUnlocalizedName('oreRedstone')
    .setCreativeTab(CreativeTabs.tabBlock),
  oreRedstoneGlowing: new BlockRedstoneOre(74, true).setLightValue(0.625).setHardness(3).setResistance(5).setStepSound(S.soundStoneFootstep).setUnlocalizedName('oreRedstone'),
  torchRedstoneIdle: new BlockRedstoneTorch(75, false).setHardness(0).setStepSound(S.soundWoodFootstep).setUnlocalizedName('notGate'),
  torchRedstoneActive: new BlockRedstoneTorch(76, true).setHardness(0).setLightValue(0.5).setStepSound(S.soundWoodFootstep).setUnlocalizedName('notGate').setCreativeTab(CreativeTabs.tabRedstone),
  stoneButton: new BlockButtonStone(77).setHardness(0.5).setStepSound(S.soundStoneFootstep).setUnlocalizedName('button'),
  snow: new BlockSnow(78).setHardness(0.1).setStepSound(S.soundSnowFootstep).setUnlocalizedName('snow').setLightOpacity(0),
  ice: new BlockIce(79).setHardness(0.5).setLightOpacity(3).setStepSound(S.soundGlassFootstep).setUnlocalizedName('ice'),
  blockSnow: new BlockSnowBlock(80).setHardness(0.2).setStepSound(S.soundSnowFootstep).setUnlocalizedName('snow'),
  cactus: new BlockCactus(81).setHardness(0.4).setStepSound(S.soundClothFootstep).setUnlocalizedName('cactus'),
  blockClay: new BlockClay(82).setHardness(0.6).setStepSound(S.soundGravelFootstep).setUnlocalizedName('clay'),
  reed: new BlockReed(83).setHardness(0).setStepSound(S.soundGrassFootstep).setUnlocalizedName('reeds').disableStats(),
  jukebox: new BlockJukeBox(84).setHardness(2).setResistance(10).setStepSound(S.soundStoneFootstep).setUnlocalizedName('jukebox'),
  fence: new BlockFence(85, 'wood', Material.wood).setHardness(2).setResistance(5).setStepSound(S.soundWoodFootstep).setUnlocalizedName('fence'),
  pumpkin: new BlockPumpkin(86, false).setHardness(1).setStepSound(S.soundWoodFootstep).setUnlocalizedName('pumpkin'),
  netherrack: new BlockNetherrack(87).setHardness(0.4).setStepSound(S.soundStoneFootstep).setUnlocalizedName('hellrock'),
  slowSand: new BlockSoulSand(88).setHardness(0.5).setStepSound(S.soundSandFootstep).setUnlocalizedName('hellsand'),
  glowStone: new BlockGlowStone(89, Material.glass).setHardness(0.3).setStepSound(S.soundGlassFootstep).setLightValue(1).setUnlocalizedName('lightgem'),
  portal: new BlockPortal(90).setHardness(-1).setStepSound(S.soundGlassFootstep).setLightValue(0.75).setUnlocalizedName('portal'),
  pumpkinLantern: new BlockPumpkin(91, true).setHardness(1).setStepSound(S.soundWoodFootstep).setLightValue(1).setUnlocalizedName('litpumpkin'),
  cake: new BlockCake(92).setHardness(0.5).setStepSound(S.soundClothFootstep).setUnlocalizedName('cake').disableStats(),
  redstoneRepeaterIdle: new BlockRedstoneRepeater(93, false).setHardness(0).setStepSound(S.soundWoodFootstep).setUnlocalizedName('diode').disableStats(),
  redstoneRepeaterActive: new BlockRedstoneRepeater(94, true).setHardness(0).setLightValue(0.625).setStepSound(S.soundWoodFootstep).setUnlocalizedName('diode').disableStats(),
  lockedChest: new BlockLockedChest(95).setHardness(0).setLightValue(1).setStepSound(S.soundWoodFootstep).setUnlocalizedName('lockedchest').setTickRandomly(true),
  trapdoor: new BlockTrapDoor(96, Material.wood).setHardness(3).setStepSound(S.soundWoodFootstep).setUnlocalizedName('trapdoor').disableStats(),
  silverfish: new BlockSilverfish(97).setHardness(0.75).setUnlocalizedName('monsterStoneEgg'),
  stoneBrick: new BlockStoneBrick(98).setHardness(1.5).setResistance(10).setStepSound(S.soundStoneFootstep).setUnlocalizedName('stonebricksmooth'),
  mushroomCapBrown: new BlockMushroomCap(99, Material.wood, 0).setHardness(0.2).setStepSound(S.soundWoodFootstep).setUnlocalizedName('mushroom'),
  mushroomCapRed: new BlockMushroomCap(100, Material.wood, 1).setHardness(0.2).setStepSound(S.soundWoodFootstep).setUnlocalizedName('mushroom'),
  fenceIron: new BlockPane(101, 'fenceIron', 'fenceIron', Material.iron, true).setHardness(5).setResistance(10).setStepSound(S.soundMetalFootstep).setUnlocalizedName('fenceIron'),
  thinGlass: new BlockPane(102, 'glass', 'thinglass_top', Material.glass, false).setHardness(0.3).setStepSound(S.soundGlassFootstep).setUnlocalizedName('thinGlass'),
  melon: new BlockMelon(103).setHardness(1).setStepSound(S.soundWoodFootstep).setUnlocalizedName('melon'),
  pumpkinStem: new BlockStem(104, Block.blocksList[86]!).setHardness(0).setStepSound(S.soundWoodFootstep).setUnlocalizedName('pumpkinStem'),
  melonStem: new BlockStem(105, Block.blocksList[103]!).setHardness(0).setStepSound(S.soundWoodFootstep).setUnlocalizedName('pumpkinStem'),
  vine: new BlockVine(106).setHardness(0.2).setStepSound(S.soundGrassFootstep).setUnlocalizedName('vine'),
  fenceGate: new BlockFenceGate(107).setHardness(2).setResistance(5).setStepSound(S.soundWoodFootstep).setUnlocalizedName('fenceGate'),
  stairsBrick: new BlockStairs(108, Block.blocksList[45]!, 0).setUnlocalizedName('stairsBrick'),
  stairsStoneBrick: new BlockStairs(109, Block.blocksList[98]!, 0).setUnlocalizedName('stairsStoneBrickSmooth'),
  mycelium: new BlockMycelium(110).setHardness(0.6).setStepSound(S.soundGrassFootstep).setUnlocalizedName('mycel'),
  waterlily: new BlockLilyPad(111).setHardness(0).setStepSound(S.soundGrassFootstep).setUnlocalizedName('waterlily'),
  netherBrick: new Block(112, Material.rock).setHardness(2).setResistance(10).setStepSound(S.soundStoneFootstep).setUnlocalizedName('netherBrick').setCreativeTab(CreativeTabs.tabBlock),
  netherFence: new BlockFence(113, 'netherBrick', Material.rock).setHardness(2).setResistance(10).setStepSound(S.soundStoneFootstep).setUnlocalizedName('netherFence'),
  stairsNetherBrick: new BlockStairs(114, Block.blocksList[112]!, 0).setUnlocalizedName('stairsNetherBrick'),
  netherStalk: new BlockNetherStalk(115).setUnlocalizedName('netherStalk'),
  enchantmentTable: new BlockEnchantmentTable(116).setHardness(5).setResistance(2000).setUnlocalizedName('enchantmentTable'),
  brewingStand: new BlockBrewingStand(117).setHardness(0.5).setLightValue(0.125).setUnlocalizedName('brewingStand'),
  cauldron: new BlockCauldron(118).setHardness(2).setUnlocalizedName('cauldron'),
  endPortal: new BlockEndPortal(119, Material.portal).setHardness(-1).setResistance(6000000),
  endPortalFrame: new BlockEndPortalFrame(120).setStepSound(S.soundGlassFootstep).setLightValue(0.125).setHardness(-1).setUnlocalizedName('endPortalFrame').setResistance(6000000).setCreativeTab(CreativeTabs.tabDecorations),
  whiteStone: new Block(121, Material.rock).setHardness(3).setResistance(15).setStepSound(S.soundStoneFootstep).setUnlocalizedName('whiteStone').setCreativeTab(CreativeTabs.tabBlock),
  dragonEgg: new BlockDragonEgg(122).setHardness(3).setResistance(15).setStepSound(S.soundStoneFootstep).setLightValue(0.125).setUnlocalizedName('dragonEgg'),
  redstoneLampIdle: new BlockRedstoneLight(123, false).setHardness(0.3).setStepSound(S.soundGlassFootstep).setUnlocalizedName('redstoneLight').setCreativeTab(CreativeTabs.tabRedstone),
  redstoneLampActive: new BlockRedstoneLight(124, true).setHardness(0.3).setStepSound(S.soundGlassFootstep).setUnlocalizedName('redstoneLight'),
  woodDoubleSlab: new BlockWoodSlab(125, true).setHardness(2).setResistance(5).setStepSound(S.soundWoodFootstep).setUnlocalizedName('woodSlab'),
  woodSingleSlab: new BlockWoodSlab(126, false).setHardness(2).setResistance(5).setStepSound(S.soundWoodFootstep).setUnlocalizedName('woodSlab'),
  cocoaPlant: new BlockCocoa(127).setHardness(0.2).setResistance(5).setStepSound(S.soundWoodFootstep).setUnlocalizedName('cocoa'),
  stairsSandStone: new BlockStairs(128, Block.blocksList[24]!, 0).setUnlocalizedName('stairsSandStone'),
  oreEmerald: new BlockOre(129).setHardness(3).setResistance(5).setStepSound(S.soundStoneFootstep).setUnlocalizedName('oreEmerald'),
  enderChest: new BlockEnderChest(130).setHardness(22.5).setResistance(1000).setStepSound(S.soundStoneFootstep).setUnlocalizedName('enderChest').setLightValue(0.5),
  tripWireSource: new BlockTripWireSource(131).setUnlocalizedName('tripWireSource'),
  tripWire: new BlockTripWire(132).setUnlocalizedName('tripWire'),
  blockEmerald: new BlockOreStorage(133).setHardness(5).setResistance(10).setStepSound(S.soundMetalFootstep).setUnlocalizedName('blockEmerald'),
  stairsWoodSpruce: new BlockStairs(134, Block.blocksList[5]!, 1).setUnlocalizedName('stairsWoodSpruce'),
  stairsWoodBirch: new BlockStairs(135, Block.blocksList[5]!, 2).setUnlocalizedName('stairsWoodBirch'),
  stairsWoodJungle: new BlockStairs(136, Block.blocksList[5]!, 3).setUnlocalizedName('stairsWoodJungle'),
  commandBlock: new BlockCommandBlock(137).setUnlocalizedName('commandBlock'),
  beacon: new BlockBeacon(138).setUnlocalizedName('beacon').setLightValue(1),
  cobblestoneWall: new BlockWall(139, Block.blocksList[4]!).setUnlocalizedName('cobbleWall'),
  flowerPot: new BlockFlowerPot(140).setHardness(0).setStepSound(S.soundPowderFootstep).setUnlocalizedName('flowerPot'),
  carrot: new BlockCarrot(141).setUnlocalizedName('carrots'),
  potato: new BlockPotato(142).setUnlocalizedName('potatoes'),
  woodenButton: new BlockButtonWood(143).setHardness(0.5).setStepSound(S.soundWoodFootstep).setUnlocalizedName('button'),
  skull: new BlockSkull(144).setHardness(1).setStepSound(S.soundStoneFootstep).setUnlocalizedName('skull'),
  anvil: new BlockAnvil(145).setHardness(5).setStepSound(S.soundAnvilFootstep).setResistance(2000).setUnlocalizedName('anvil'),
  chestTrapped: new BlockChest(146, 1).setHardness(2.5).setStepSound(S.soundWoodFootstep).setUnlocalizedName('chestTrap'),
  pressurePlateGold: new BlockPressurePlateWeighted(147, 'blockGold', Material.iron, 64).setHardness(0.5).setStepSound(S.soundWoodFootstep).setUnlocalizedName('weightedPlate_light'),
  pressurePlateIron: new BlockPressurePlateWeighted(148, 'blockIron', Material.iron, 640).setHardness(0.5).setStepSound(S.soundWoodFootstep).setUnlocalizedName('weightedPlate_heavy'),
  redstoneComparatorIdle: new BlockComparator(149, false).setHardness(0).setStepSound(S.soundWoodFootstep).setUnlocalizedName('comparator').disableStats(),
  redstoneComparatorActive: new BlockComparator(150, true).setHardness(0).setLightValue(0.625).setStepSound(S.soundWoodFootstep).setUnlocalizedName('comparator').disableStats(),
  daylightSensor: new BlockDaylightDetector(151).setHardness(0.2).setStepSound(S.soundWoodFootstep).setUnlocalizedName('daylightDetector'),
  blockRedstone: new BlockPoweredOre(152).setHardness(5).setResistance(10).setStepSound(S.soundMetalFootstep).setUnlocalizedName('blockRedstone'),
  oreNetherQuartz: new BlockOre(153).setHardness(3).setResistance(5).setStepSound(S.soundStoneFootstep).setUnlocalizedName('netherquartz'),
  hopperBlock: new BlockHopper(154).setHardness(3).setResistance(8).setStepSound(S.soundWoodFootstep).setUnlocalizedName('hopper'),
  blockNetherQuartz: new BlockQuartz(155).setStepSound(S.soundStoneFootstep).setHardness(0.8).setUnlocalizedName('quartzBlock'),
  stairsNetherQuartz: new BlockStairs(156, Block.blocksList[155]!, 0).setUnlocalizedName('stairsQuartz'),
  railActivator: new BlockRailPowered(157).setHardness(0.7).setStepSound(S.soundMetalFootstep).setUnlocalizedName('activatorRail'),
  dropper: new BlockDropper(158).setHardness(3.5).setStepSound(S.soundStoneFootstep).setUnlocalizedName('dropper'),
};

/**
 * Derives the tables that depend on every block existing (the tail of Block's static
 * initialiser): useNeighborBrightness, and canBlockGrass[0] = true.
 */
export function finishBlockRegistry(): void {
  for (let id = 0; id < 256; id++) {
    const b = Block.blocksList[id];
    if (!b) continue;
    Block.useNeighborBrightness[id] =
      (id > 0 && b.getRenderType() === 10) ||
      (id > 0 && b.usesNeighborBrightness()) ||
      id === 60 ||
      Block.canBlockGrass[id] ||
      Block.lightOpacity[id] === 0;
  }
  Block.canBlockGrass[0] = true;
}

finishBlockRegistry();

export { Block };
