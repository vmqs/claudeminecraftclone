import type { Material } from '../block/Material';
import type { BiomeGenBase } from './biome/BiomeGenBase';
import type { TileEntity } from './tileentity/TileEntity';

/**
 * Read-only world view used by rendering code (RenderBlocks, Block.getBlockTexture,
 * colorMultiplier, ...). Implemented by World and by the mesher's ChunkCache.
 */
export interface IBlockAccess {
  getBlockId(x: number, y: number, z: number): number;
  getBlockMetadata(x: number, y: number, z: number): number;
  /** Packed lightmap coordinates: sky << 20 | max(block, minBlockLight) << 4. */
  getLightBrightnessForSkyBlocks(x: number, y: number, z: number, minBlockLight: number): number;
  getBrightness(x: number, y: number, z: number, minLight: number): number;
  getLightBrightness(x: number, y: number, z: number): number;
  getBlockMaterial(x: number, y: number, z: number): Material;
  isBlockOpaqueCube(x: number, y: number, z: number): boolean;
  isBlockNormalCube(x: number, y: number, z: number): boolean;
  isAirBlock(x: number, y: number, z: number): boolean;
  getBiomeGenForCoords(x: number, z: number): BiomeGenBase;
  getHeight(): number;
  extendedLevelsInChunkCache(): boolean;
  doesBlockHaveSolidTopSurface(x: number, y: number, z: number): boolean;
  isBlockProvidingPowerTo(x: number, y: number, z: number, side: number): number;
  /** The tile entity at a position; absent in the mesher's snapshot (ChunkCache). */
  getBlockTileEntity?(x: number, y: number, z: number): TileEntity | null;
}

export enum EnumSkyBlock {
  Sky = 0,
  Block = 1,
}

/** defaultLightValue of EnumSkyBlock (Sky 15, Block 0). */
export const SKY_BLOCK_DEFAULT = [15, 0] as const;
