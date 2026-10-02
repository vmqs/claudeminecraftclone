import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import { Facing } from '../core/Facing';
import type { JavaRandom } from '../core/JavaRandom';
import type { Entity } from '../entity/Entity';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockIds } from './BlockIds';
import type { Material } from './Material';

/** Slabs (BlockHalfSlab): meta & 7 = type, bit 8 = upper half; the double slab is a full cube. */
export abstract class BlockHalfSlab extends Block {
  protected readonly isDoubleSlab: boolean;

  constructor(id: number, isDouble: boolean, material: Material) {
    super(id, material);
    this.isDoubleSlab = isDouble;
    if (isDouble) Block.opaqueCubeLookup[id] = true;
    else this.setBlockBounds(0, 0, 0, 1, 0.5, 1);
    this.setLightOpacity(255);
  }

  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    if (this.isDoubleSlab) this.setBlockBounds(0, 0, 0, 1, 1, 1);
    else if ((w.getBlockMetadata(x, y, z) & 8) !== 0) this.setBlockBounds(0, 0.5, 0, 1, 1, 1);
    else this.setBlockBounds(0, 0, 0, 1, 0.5, 1);
  }

  override setBlockBoundsForItemRender(): void {
    if (this.isDoubleSlab) this.setBlockBounds(0, 0, 0, 1, 1, 1);
    else this.setBlockBounds(0, 0, 0, 1, 0.5, 1);
  }

  override addCollisionBoxesToList(w: IWorld, x: number, y: number, z: number, mask: AxisAlignedBB, list: AxisAlignedBB[], e: Entity | null): void {
    this.setBlockBoundsBasedOnState(w, x, y, z);
    super.addCollisionBoxesToList(w, x, y, z, mask, list, e);
  }

  override isOpaqueCube(): boolean {
    return this.isDoubleSlab;
  }

  /** Placed against the underside of a block, or on the upper half of a side: the top slab. */
  override onBlockPlaced(_w: IWorld, _x: number, _y: number, _z: number, side: number, _hx: number, hy: number, _hz: number, meta: number): number {
    if (this.isDoubleSlab) return meta;
    return side !== 0 && (side === 1 || !(hy > 0.5)) ? meta : meta | 8;
  }

  override quantityDropped(_rand: JavaRandom): number {
    return this.isDoubleSlab ? 2 : 1;
  }

  override damageDropped(meta: number): number {
    return meta & 7;
  }

  override renderAsNormalBlock(): boolean {
    return this.isDoubleSlab;
  }

  /** Hides faces between slabs of the same half; (x, y, z) is the neighbour on `side`. */
  override shouldSideBeRendered(w: IBlockAccess, x: number, y: number, z: number, side: number): boolean {
    if (this.isDoubleSlab) return super.shouldSideBeRendered(w, x, y, z, side);
    if (side !== 1 && side !== 0 && !super.shouldSideBeRendered(w, x, y, z, side)) return false;
    const o = Facing.oppositeSide[side];
    const sx = x + Facing.offsetsXForSide[o];
    const sy = y + Facing.offsetsYForSide[o];
    const sz = z + Facing.offsetsZForSide[o];
    const top = (w.getBlockMetadata(sx, sy, sz) & 8) !== 0;
    if (top) {
      if (side === 0) return true;
      if (side === 1 && super.shouldSideBeRendered(w, x, y, z, side)) return true;
      return !BlockHalfSlab.isBlockSingleSlab(w.getBlockId(x, y, z)) || (w.getBlockMetadata(x, y, z) & 8) === 0;
    }
    if (side === 1) return true;
    if (side === 0 && super.shouldSideBeRendered(w, x, y, z, side)) return true;
    return !BlockHalfSlab.isBlockSingleSlab(w.getBlockId(x, y, z)) || (w.getBlockMetadata(x, y, z) & 8) !== 0;
  }

  static isBlockSingleSlab(id: number): boolean {
    return id === BlockIds.stoneSingleSlab || id === BlockIds.woodSingleSlab;
  }

  /** The item name of a slab type (ItemSlab uses it). */
  abstract getFullSlabName(meta: number): string;

  isDouble(): boolean {
    return this.isDoubleSlab;
  }

  override usesNeighborBrightness(): boolean {
    return true;
  }

  /** A top slab (or double slab) has a solid top surface (World.isBlockTopFacingSurfaceSolid). */
  override hasSolidTopSurface(meta: number): boolean {
    return this.isDoubleSlab || (meta & 8) === 8;
  }

  override getDamageValue(w: IWorld, x: number, y: number, z: number): number {
    return super.getDamageValue(w, x, y, z) & 7;
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    if (BlockHalfSlab.isBlockSingleSlab(this.blockID)) return this.blockID;
    if (this.blockID === BlockIds.stoneDoubleSlab) return BlockIds.stoneSingleSlab;
    return this.blockID === BlockIds.woodDoubleSlab ? BlockIds.woodSingleSlab : BlockIds.stoneSingleSlab;
  }
}
