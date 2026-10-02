import { CreativeTabs } from '../item/CreativeTabs';
import '../world/tileentity/TileEntities';
import { Block } from './Block';
import { BlockBookshelf } from './BlockBookshelf';
import { BlockCactus } from './BlockCactus';
import { BlockClay } from './BlockClay';
import { BlockCloth } from './BlockCloth';
import { BlockCommandBlock } from './BlockCommandBlock';
import { BlockDeadBush } from './BlockDeadBush';
import { BlockDirt } from './BlockDirt';
import { BlockFence } from './BlockFence';
import { BlockFenceGate } from './BlockFenceGate';
import { BlockFlower } from './BlockFlower';
import { BlockFlowing } from './BlockFlowing';
import { BlockGlass } from './BlockGlass';
import { BlockGlowStone } from './BlockGlowStone';
import { BlockGrass } from './BlockGrass';
import { BlockGravel } from './BlockGravel';
import { BlockIce } from './BlockIce';
import { BlockLeaves } from './BlockLeaves';
import { BlockLog } from './BlockLog';
import { BlockMelon } from './BlockMelon';
import { BlockMushroom } from './BlockMushroom';
import { BlockMushroomCap } from './BlockMushroomCap';
import { BlockMycelium } from './BlockMycelium';
import { BlockNetherrack } from './BlockNetherrack';
import { BlockObsidian } from './BlockObsidian';
import { BlockOre } from './BlockOre';
import { BlockOreStorage } from './BlockOreStorage';
import { BlockPane } from './BlockPane';
import { BlockPoweredOre } from './BlockPoweredOre';
import { BlockPumpkin } from './BlockPumpkin';
import { BlockQuartz } from './BlockQuartz';
import { BlockRedstoneLight } from './BlockRedstoneLight';
import { BlockRedstoneOre } from './BlockRedstoneOre';
import { BlockReed } from './BlockReed';
import { BlockSand } from './BlockSand';
import { BlockSandStone } from './BlockSandStone';
import { BlockSapling } from './BlockSapling';
import { BlockSilverfish } from './BlockSilverfish';
import { BlockSnow } from './BlockSnow';
import { BlockSnowBlock } from './BlockSnowBlock';
import { BlockSoulSand } from './BlockSoulSand';
import { BlockSponge } from './BlockSponge';
import { BlockStairs } from './BlockStairs';
import { BlockStationary } from './BlockStationary';
import { BlockStep } from './BlockStep';
import { BlockStone } from './BlockStone';
import { BlockStoneBrick } from './BlockStoneBrick';
import { BlockTallGrass } from './BlockTallGrass';
import { BlockTorch } from './BlockTorch';
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
  sandStone: new BlockSandStone(24).setStepSound(S.soundStoneFootstep).setHardness(0.8).setUnlocalizedName('sandStone'),
  web: new BlockWeb(30).setLightOpacity(1).setHardness(4).setUnlocalizedName('web'),
  tallGrass: new BlockTallGrass(31).setHardness(0).setStepSound(S.soundGrassFootstep).setUnlocalizedName('tallgrass'),
  deadBush: new BlockDeadBush(32).setHardness(0).setStepSound(S.soundGrassFootstep).setUnlocalizedName('deadbush'),
  cloth: new BlockCloth(35).setHardness(0.8).setStepSound(S.soundClothFootstep).setUnlocalizedName('cloth'),
  plantYellow: new BlockFlower(37).setHardness(0).setStepSound(S.soundGrassFootstep).setUnlocalizedName('flower'),
  plantRed: new BlockFlower(38).setHardness(0).setStepSound(S.soundGrassFootstep).setUnlocalizedName('rose'),
  mushroomBrown: new BlockMushroom(39, 'mushroom_brown').setHardness(0).setStepSound(S.soundGrassFootstep).setLightValue(0.125).setUnlocalizedName('mushroom'),
  mushroomRed: new BlockMushroom(40, 'mushroom_red').setHardness(0).setStepSound(S.soundGrassFootstep).setUnlocalizedName('mushroom'),
  blockGold: new BlockOreStorage(41).setHardness(3).setResistance(10).setStepSound(S.soundMetalFootstep).setUnlocalizedName('blockGold'),
  blockIron: new BlockOreStorage(42).setHardness(5).setResistance(10).setStepSound(S.soundMetalFootstep).setUnlocalizedName('blockIron'),
  stoneDoubleSlab: new BlockStep(43, true).setHardness(2).setResistance(10).setStepSound(S.soundStoneFootstep).setUnlocalizedName('stoneSlab'),
  stoneSingleSlab: new BlockStep(44, false).setHardness(2).setResistance(10).setStepSound(S.soundStoneFootstep).setUnlocalizedName('stoneSlab'),
  brick: new Block(45, Material.rock).setHardness(2).setResistance(10).setStepSound(S.soundStoneFootstep).setUnlocalizedName('brick').setCreativeTab(CreativeTabs.tabBlock),
  bookShelf: new BlockBookshelf(47).setHardness(1.5).setStepSound(S.soundWoodFootstep).setUnlocalizedName('bookshelf'),
  cobblestoneMossy: new Block(48, Material.rock)
    .setHardness(2)
    .setResistance(10)
    .setStepSound(S.soundStoneFootstep)
    .setUnlocalizedName('stoneMoss')
    .setCreativeTab(CreativeTabs.tabBlock),
  obsidian: new BlockObsidian(49).setHardness(50).setResistance(2000).setStepSound(S.soundStoneFootstep).setUnlocalizedName('obsidian'),
  torchWood: new BlockTorch(50).setHardness(0).setLightValue(0.9375).setStepSound(S.soundWoodFootstep).setUnlocalizedName('torch'),
  stairsWoodOak: new BlockStairs(53, Block.blocksList[5]!, 0).setUnlocalizedName('stairsWood'),
  oreDiamond: new BlockOre(56).setHardness(3).setResistance(5).setStepSound(S.soundStoneFootstep).setUnlocalizedName('oreDiamond'),
  blockDiamond: new BlockOreStorage(57).setHardness(5).setResistance(10).setStepSound(S.soundMetalFootstep).setUnlocalizedName('blockDiamond'),
  workbench: new BlockWorkbench(58).setHardness(2.5).setStepSound(S.soundWoodFootstep).setUnlocalizedName('workbench'),
  stairsCobblestone: new BlockStairs(67, Block.blocksList[4]!, 0).setUnlocalizedName('stairsStone'),
  oreRedstone: new BlockRedstoneOre(73, false)
    .setHardness(3)
    .setResistance(5)
    .setStepSound(S.soundStoneFootstep)
    .setUnlocalizedName('oreRedstone')
    .setCreativeTab(CreativeTabs.tabBlock),
  oreRedstoneGlowing: new BlockRedstoneOre(74, true).setLightValue(0.625).setHardness(3).setResistance(5).setStepSound(S.soundStoneFootstep).setUnlocalizedName('oreRedstone'),
  snow: new BlockSnow(78).setHardness(0.1).setStepSound(S.soundSnowFootstep).setUnlocalizedName('snow').setLightOpacity(0),
  ice: new BlockIce(79).setHardness(0.5).setLightOpacity(3).setStepSound(S.soundGlassFootstep).setUnlocalizedName('ice'),
  blockSnow: new BlockSnowBlock(80).setHardness(0.2).setStepSound(S.soundSnowFootstep).setUnlocalizedName('snow'),
  cactus: new BlockCactus(81).setHardness(0.4).setStepSound(S.soundClothFootstep).setUnlocalizedName('cactus'),
  blockClay: new BlockClay(82).setHardness(0.6).setStepSound(S.soundGravelFootstep).setUnlocalizedName('clay'),
  reed: new BlockReed(83).setHardness(0).setStepSound(S.soundGrassFootstep).setUnlocalizedName('reeds').disableStats(),
  fence: new BlockFence(85, 'wood', Material.wood).setHardness(2).setResistance(5).setStepSound(S.soundWoodFootstep).setUnlocalizedName('fence'),
  pumpkin: new BlockPumpkin(86, false).setHardness(1).setStepSound(S.soundWoodFootstep).setUnlocalizedName('pumpkin'),
  netherrack: new BlockNetherrack(87).setHardness(0.4).setStepSound(S.soundStoneFootstep).setUnlocalizedName('hellrock'),
  slowSand: new BlockSoulSand(88).setHardness(0.5).setStepSound(S.soundSandFootstep).setUnlocalizedName('hellsand'),
  glowStone: new BlockGlowStone(89, Material.glass).setHardness(0.3).setStepSound(S.soundGlassFootstep).setLightValue(1).setUnlocalizedName('lightgem'),
  pumpkinLantern: new BlockPumpkin(91, true).setHardness(1).setStepSound(S.soundWoodFootstep).setLightValue(1).setUnlocalizedName('litpumpkin'),
  silverfish: new BlockSilverfish(97).setHardness(0.75).setUnlocalizedName('monsterStoneEgg'),
  stoneBrick: new BlockStoneBrick(98).setHardness(1.5).setResistance(10).setStepSound(S.soundStoneFootstep).setUnlocalizedName('stonebricksmooth'),
  mushroomCapBrown: new BlockMushroomCap(99, Material.wood, 0).setHardness(0.2).setStepSound(S.soundWoodFootstep).setUnlocalizedName('mushroom'),
  mushroomCapRed: new BlockMushroomCap(100, Material.wood, 1).setHardness(0.2).setStepSound(S.soundWoodFootstep).setUnlocalizedName('mushroom'),
  fenceIron: new BlockPane(101, 'fenceIron', 'fenceIron', Material.iron, true).setHardness(5).setResistance(10).setStepSound(S.soundMetalFootstep).setUnlocalizedName('fenceIron'),
  thinGlass: new BlockPane(102, 'glass', 'thinglass_top', Material.glass, false).setHardness(0.3).setStepSound(S.soundGlassFootstep).setUnlocalizedName('thinGlass'),
  melon: new BlockMelon(103).setHardness(1).setStepSound(S.soundWoodFootstep).setUnlocalizedName('melon'),
  fenceGate: new BlockFenceGate(107).setHardness(2).setResistance(5).setStepSound(S.soundWoodFootstep).setUnlocalizedName('fenceGate'),
  stairsBrick: new BlockStairs(108, Block.blocksList[45]!, 0).setUnlocalizedName('stairsBrick'),
  stairsStoneBrick: new BlockStairs(109, Block.blocksList[98]!, 0).setUnlocalizedName('stairsStoneBrickSmooth'),
  mycelium: new BlockMycelium(110).setHardness(0.6).setStepSound(S.soundGrassFootstep).setUnlocalizedName('mycel'),
  netherBrick: new Block(112, Material.rock).setHardness(2).setResistance(10).setStepSound(S.soundStoneFootstep).setUnlocalizedName('netherBrick').setCreativeTab(CreativeTabs.tabBlock),
  netherFence: new BlockFence(113, 'netherBrick', Material.rock).setHardness(2).setResistance(10).setStepSound(S.soundStoneFootstep).setUnlocalizedName('netherFence'),
  stairsNetherBrick: new BlockStairs(114, Block.blocksList[112]!, 0).setUnlocalizedName('stairsNetherBrick'),
  whiteStone: new Block(121, Material.rock).setHardness(3).setResistance(15).setStepSound(S.soundStoneFootstep).setUnlocalizedName('whiteStone').setCreativeTab(CreativeTabs.tabBlock),
  redstoneLampIdle: new BlockRedstoneLight(123, false).setHardness(0.3).setStepSound(S.soundGlassFootstep).setUnlocalizedName('redstoneLight').setCreativeTab(CreativeTabs.tabRedstone),
  redstoneLampActive: new BlockRedstoneLight(124, true).setHardness(0.3).setStepSound(S.soundGlassFootstep).setUnlocalizedName('redstoneLight'),
  woodDoubleSlab: new BlockWoodSlab(125, true).setHardness(2).setResistance(5).setStepSound(S.soundWoodFootstep).setUnlocalizedName('woodSlab'),
  woodSingleSlab: new BlockWoodSlab(126, false).setHardness(2).setResistance(5).setStepSound(S.soundWoodFootstep).setUnlocalizedName('woodSlab'),
  stairsSandStone: new BlockStairs(128, Block.blocksList[24]!, 0).setUnlocalizedName('stairsSandStone'),
  oreEmerald: new BlockOre(129).setHardness(3).setResistance(5).setStepSound(S.soundStoneFootstep).setUnlocalizedName('oreEmerald'),
  blockEmerald: new BlockOreStorage(133).setHardness(5).setResistance(10).setStepSound(S.soundMetalFootstep).setUnlocalizedName('blockEmerald'),
  stairsWoodSpruce: new BlockStairs(134, Block.blocksList[5]!, 1).setUnlocalizedName('stairsWoodSpruce'),
  stairsWoodBirch: new BlockStairs(135, Block.blocksList[5]!, 2).setUnlocalizedName('stairsWoodBirch'),
  stairsWoodJungle: new BlockStairs(136, Block.blocksList[5]!, 3).setUnlocalizedName('stairsWoodJungle'),
  commandBlock: new BlockCommandBlock(137).setUnlocalizedName('commandBlock'),
  cobblestoneWall: new BlockWall(139, Block.blocksList[4]!).setUnlocalizedName('cobbleWall'),
  blockRedstone: new BlockPoweredOre(152).setHardness(5).setResistance(10).setStepSound(S.soundMetalFootstep).setUnlocalizedName('blockRedstone'),
  oreNetherQuartz: new BlockOre(153).setHardness(3).setResistance(5).setStepSound(S.soundStoneFootstep).setUnlocalizedName('netherquartz'),
  blockNetherQuartz: new BlockQuartz(155).setStepSound(S.soundStoneFootstep).setHardness(0.8).setUnlocalizedName('quartzBlock'),
  stairsNetherQuartz: new BlockStairs(156, Block.blocksList[155]!, 0).setUnlocalizedName('stairsQuartz'),
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
