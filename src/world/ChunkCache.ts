import { Block, materialOf } from '../block/Block';
import type { Material } from '../block/Material';
import { getBiome, type BiomeGenBase } from './biome/BiomeGenBase';
import { type IBlockAccess, SKY_BLOCK_DEFAULT, EnumSkyBlock } from './IBlockAccess';

/** Padding around a 16^3 section in a mesher snapshot. */
export const SNAPSHOT_PAD = 2;
export const SNAPSHOT_SIZE = 16 + SNAPSHOT_PAD * 2;
const S = SNAPSHOT_SIZE;
const S2 = S * S;

/** Copied block data around one section (the mesher's input). Index ((y * S) + z) * S + x. */
export interface SectionSnapshot {
  /** World coordinates of the snapshot's (0,0,0) cell = section origin - SNAPSHOT_PAD. */
  x0: number;
  y0: number;
  z0: number;
  ids: Uint8Array;
  meta: Uint8Array;
  sky: Uint8Array;
  blk: Uint8Array;
  /** Biome ids of the S x S columns, index z * S + x. */
  biomes: Uint8Array;
  /** extendedLevelsInChunkCache: the section's column range is empty. */
  empty: boolean;
}

export function allocSnapshot(): SectionSnapshot {
  return {
    x0: 0,
    y0: 0,
    z0: 0,
    ids: new Uint8Array(S * S2),
    meta: new Uint8Array(S * S2),
    sky: new Uint8Array(S * S2),
    blk: new Uint8Array(S * S2),
    biomes: new Uint8Array(S2),
    empty: false,
  };
}

const lightBrightnessTable = (() => {
  const t = new Float32Array(16);
  for (let i = 0; i <= 15; i++) {
    const v = Math.fround(1 - i / 15);
    t[i] = Math.fround((1 - v) / (v * 3 + 1));
  }
  return t;
})();

/**
 * ChunkCache over a padded snapshot: what RenderBlocks reads while meshing one section.
 * Reads outside the snapshot return air and default light.
 */
export class ChunkCache implements IBlockAccess {
  constructor(
    readonly snap: SectionSnapshot,
    readonly skylightSubtracted = 0,
  ) {}

  private index(x: number, y: number, z: number): number {
    const lx = x - this.snap.x0;
    const ly = y - this.snap.y0;
    const lz = z - this.snap.z0;
    if (lx < 0 || ly < 0 || lz < 0 || lx >= S || ly >= S || lz >= S) return -1;
    return (ly * S + lz) * S + lx;
  }

  getBlockId(x: number, y: number, z: number): number {
    if (y < 0 || y >= 256) return 0;
    const i = this.index(x, y, z);
    return i < 0 ? 0 : this.snap.ids[i];
  }

  getBlockMetadata(x: number, y: number, z: number): number {
    if (y < 0 || y >= 256) return 0;
    const i = this.index(x, y, z);
    return i < 0 ? 0 : this.snap.meta[i];
  }

  private savedLight(type: EnumSkyBlock, x: number, y: number, z: number): number {
    if (y < 0) y = 0;
    if (y >= 256) y = 255;
    const i = this.index(x, y, z);
    if (i < 0) return SKY_BLOCK_DEFAULT[type];
    return type === EnumSkyBlock.Sky ? this.snap.sky[i] : this.snap.blk[i];
  }

  getSkyBlockTypeBrightness(type: EnumSkyBlock, x: number, y: number, z: number): number {
    if (y < 0) y = 0;
    if (y >= 256) y = 255;
    if (Block.useNeighborBrightness[this.getBlockId(x, y, z)]) {
      let v = this.savedLight(type, x, y + 1, z);
      const a = this.savedLight(type, x + 1, y, z);
      const b = this.savedLight(type, x - 1, y, z);
      const c = this.savedLight(type, x, y, z + 1);
      const d = this.savedLight(type, x, y, z - 1);
      if (a > v) v = a;
      if (b > v) v = b;
      if (c > v) v = c;
      if (d > v) v = d;
      return v;
    }
    return this.savedLight(type, x, y, z);
  }

  getLightBrightnessForSkyBlocks(x: number, y: number, z: number, minBlock: number): number {
    const sky = this.getSkyBlockTypeBrightness(EnumSkyBlock.Sky, x, y, z);
    let blk = this.getSkyBlockTypeBrightness(EnumSkyBlock.Block, x, y, z);
    if (blk < minBlock) blk = minBlock;
    return (sky << 20) | (blk << 4);
  }

  getLightValue(x: number, y: number, z: number): number {
    if (y < 0) return 0;
    if (y >= 256) return Math.max(0, 15 - this.skylightSubtracted);
    const sky = this.savedLight(EnumSkyBlock.Sky, x, y, z) - this.skylightSubtracted;
    const blk = this.savedLight(EnumSkyBlock.Block, x, y, z);
    return blk > sky ? blk : sky;
  }

  getBrightness(x: number, y: number, z: number, min: number): number {
    let v = this.getLightValue(x, y, z);
    if (v < min) v = min;
    return lightBrightnessTable[v];
  }

  getLightBrightness(x: number, y: number, z: number): number {
    return lightBrightnessTable[this.getLightValue(x, y, z)];
  }

  getBlockMaterial(x: number, y: number, z: number): Material {
    return materialOf(this.getBlockId(x, y, z));
  }

  isBlockOpaqueCube(x: number, y: number, z: number): boolean {
    const b = Block.blocksList[this.getBlockId(x, y, z)];
    return b ? b.isOpaqueCube() : false;
  }

  isBlockNormalCube(x: number, y: number, z: number): boolean {
    const b = Block.blocksList[this.getBlockId(x, y, z)];
    return b ? b.blockMaterial.blocksMovement() && b.renderAsNormalBlock() : false;
  }

  isAirBlock(x: number, y: number, z: number): boolean {
    return !Block.blocksList[this.getBlockId(x, y, z)];
  }

  getBiomeGenForCoords(x: number, z: number): BiomeGenBase {
    let lx = x - this.snap.x0;
    let lz = z - this.snap.z0;
    if (lx < 0) lx = 0;
    if (lz < 0) lz = 0;
    if (lx >= S) lx = S - 1;
    if (lz >= S) lz = S - 1;
    return getBiome(this.snap.biomes[lz * S + lx]);
  }

  getHeight(): number {
    return 256;
  }

  extendedLevelsInChunkCache(): boolean {
    return this.snap.empty;
  }

  doesBlockHaveSolidTopSurface(x: number, y: number, z: number): boolean {
    const b = Block.blocksList[this.getBlockId(x, y, z)];
    return b ? b.hasSolidTopSurface(this.getBlockMetadata(x, y, z)) : false;
  }

  isBlockProvidingPowerTo(x: number, y: number, z: number, side: number): number {
    const b = Block.blocksList[this.getBlockId(x, y, z)];
    return b ? b.isProvidingStrongPower(this, x, y, z, side) : 0;
  }
}
