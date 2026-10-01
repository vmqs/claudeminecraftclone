import { CreativeTabs } from '../item/CreativeTabs';
import { Block } from './Block';
import { BlockCactus } from './BlockCactus';
import { BlockClay } from './BlockClay';
import { BlockCloth } from './BlockCloth';
import { BlockDeadBush } from './BlockDeadBush';
import { BlockDirt } from './BlockDirt';
import { BlockFlower } from './BlockFlower';
import { BlockFlowing } from './BlockFlowing';
import { BlockGlass } from './BlockGlass';
import { BlockGrass } from './BlockGrass';
import { BlockGravel } from './BlockGravel';
import { BlockIce } from './BlockIce';
import { BlockLeaves } from './BlockLeaves';
import { BlockLog } from './BlockLog';
import { BlockMushroom } from './BlockMushroom';
import { BlockObsidian } from './BlockObsidian';
import { BlockOre } from './BlockOre';
import { BlockRedstoneOre } from './BlockRedstoneOre';
import { BlockReed } from './BlockReed';
import { BlockSand } from './BlockSand';
import { BlockSandStone } from './BlockSandStone';
import { BlockSapling } from './BlockSapling';
import { BlockSnow } from './BlockSnow';
import { BlockStationary } from './BlockStationary';
import { BlockStone } from './BlockStone';
import { BlockTallGrass } from './BlockTallGrass';
import { BlockTorch } from './BlockTorch';
import { BlockWood } from './BlockWood';
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
  glass: new BlockGlass(20, Material.glass, false).setHardness(0.3).setStepSound(S.soundGlassFootstep).setUnlocalizedName('glass'),
  oreLapis: new BlockOre(21).setHardness(3).setResistance(5).setStepSound(S.soundStoneFootstep).setUnlocalizedName('oreLapis'),
  sandStone: new BlockSandStone(24).setStepSound(S.soundStoneFootstep).setHardness(0.8).setUnlocalizedName('sandStone'),
  tallGrass: new BlockTallGrass(31).setHardness(0).setStepSound(S.soundGrassFootstep).setUnlocalizedName('tallgrass'),
  deadBush: new BlockDeadBush(32).setHardness(0).setStepSound(S.soundGrassFootstep).setUnlocalizedName('deadbush'),
  cloth: new BlockCloth(35).setHardness(0.8).setStepSound(S.soundClothFootstep).setUnlocalizedName('cloth'),
  plantYellow: new BlockFlower(37).setHardness(0).setStepSound(S.soundGrassFootstep).setUnlocalizedName('flower'),
  plantRed: new BlockFlower(38).setHardness(0).setStepSound(S.soundGrassFootstep).setUnlocalizedName('rose'),
  mushroomBrown: new BlockMushroom(39, 'mushroom_brown').setHardness(0).setStepSound(S.soundGrassFootstep).setLightValue(0.125).setUnlocalizedName('mushroom'),
  mushroomRed: new BlockMushroom(40, 'mushroom_red').setHardness(0).setStepSound(S.soundGrassFootstep).setUnlocalizedName('mushroom'),
  brick: new Block(45, Material.rock).setHardness(2).setResistance(10).setStepSound(S.soundStoneFootstep).setUnlocalizedName('brick').setCreativeTab(CreativeTabs.tabBlock),
  cobblestoneMossy: new Block(48, Material.rock)
    .setHardness(2)
    .setResistance(10)
    .setStepSound(S.soundStoneFootstep)
    .setUnlocalizedName('stoneMoss')
    .setCreativeTab(CreativeTabs.tabBlock),
  obsidian: new BlockObsidian(49).setHardness(50).setResistance(2000).setStepSound(S.soundStoneFootstep).setUnlocalizedName('obsidian'),
  torchWood: new BlockTorch(50).setHardness(0).setLightValue(0.9375).setStepSound(S.soundWoodFootstep).setUnlocalizedName('torch'),
  oreDiamond: new BlockOre(56).setHardness(3).setResistance(5).setStepSound(S.soundStoneFootstep).setUnlocalizedName('oreDiamond'),
  oreRedstone: new BlockRedstoneOre(73, false)
    .setHardness(3)
    .setResistance(5)
    .setStepSound(S.soundStoneFootstep)
    .setUnlocalizedName('oreRedstone')
    .setCreativeTab(CreativeTabs.tabBlock),
  oreRedstoneGlowing: new BlockRedstoneOre(74, true).setLightValue(0.625).setHardness(3).setResistance(5).setStepSound(S.soundStoneFootstep).setUnlocalizedName('oreRedstone'),
  snow: new BlockSnow(78).setHardness(0.1).setStepSound(S.soundSnowFootstep).setUnlocalizedName('snow').setLightOpacity(0),
  ice: new BlockIce(79).setHardness(0.5).setLightOpacity(3).setStepSound(S.soundGlassFootstep).setUnlocalizedName('ice'),
  cactus: new BlockCactus(81).setHardness(0.4).setStepSound(S.soundClothFootstep).setUnlocalizedName('cactus'),
  blockClay: new BlockClay(82).setHardness(0.6).setStepSound(S.soundGravelFootstep).setUnlocalizedName('clay'),
  reed: new BlockReed(83).setHardness(0).setStepSound(S.soundGrassFootstep).setUnlocalizedName('reeds').disableStats(),
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
