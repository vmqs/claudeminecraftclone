import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import { Facing } from '../core/Facing';
import type { JavaRandom } from '../core/JavaRandom';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import type { TileEntity } from '../world/tileentity/TileEntity';
import { TileEntityPiston } from '../world/tileentity/TileEntityPiston';
import { Block } from './Block';
import { BlockContainer } from './BlockContainer';
import { Material } from './Material';

const f = Math.fround;

/** A block in motion (36, render type -1): TileEntityPiston carries the real block; drawn by its renderer. */
export class BlockPistonMoving extends BlockContainer {
  constructor(id: number) {
    super(id, Material.piston);
    this.setHardness(-1);
  }

  createNewTileEntity(_w: IWorld): TileEntity | null {
    return null;
  }

  override onBlockAdded(_w: IWorld, _x: number, _y: number, _z: number): void {}

  override breakBlock(w: IWorld, x: number, y: number, z: number, id: number, meta: number): void {
    const te = w.getBlockTileEntity(x, y, z);
    if (te instanceof TileEntityPiston) te.clearPistonTileEntity();
    else super.breakBlock(w, x, y, z, id, meta);
  }

  override canPlaceBlockAt(_w: IWorld, _x: number, _y: number, _z: number): boolean {
    return false;
  }

  override canPlaceBlockOnSide(_w: IWorld, _x: number, _y: number, _z: number, _side: number): boolean {
    return false;
  }

  override getRenderType(): number {
    return -1;
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  /** A stray moving block without its tile entity is cleared on use. */
  override onBlockActivated(w: IWorld, x: number, y: number, z: number, _p: EntityPlayer): boolean {
    if (!w.isRemote && w.getBlockTileEntity(x, y, z) === null) {
      w.setBlockToAir(x, y, z);
      return true;
    }
    return false;
  }

  override idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return 0;
  }

  /** Drops what the carried block would drop. */
  override dropBlockAsItemWithChance(w: IWorld, x: number, y: number, z: number, _meta: number, _chance: number, _fortune: number): void {
    if (w.isRemote) return;
    const te = this.getTileEntityAtLocation(w, x, y, z);
    if (te) Block.blocksList[te.getStoredBlockID()]?.dropBlockAsItem(w, x, y, z, te.getBlockMetadata(), 0);
  }

  override onNeighborBlockChange(_w: IWorld, _x: number, _y: number, _z: number, _id: number): void {}

  static getTileEntity(blockId: number, meta: number, facing: number, extending: boolean, renderHead: boolean): TileEntity {
    return new TileEntityPiston(blockId, meta, facing, extending, renderHead);
  }

  override getCollisionBoundingBoxFromPool(w: IWorld, x: number, y: number, z: number): AxisAlignedBB | null {
    const te = this.getTileEntityAtLocation(w, x, y, z);
    if (!te) return null;
    let p = te.getProgress(0);
    if (te.isExtending()) p = f(1 - p);
    return this.getAxisAlignedBB(w, x, y, z, te.getStoredBlockID(), p, te.getPistonOrientation());
  }

  /** The carried block's bounds, shifted back by the remaining distance. */
  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    const te = this.getTileEntityAtLocation(w, x, y, z);
    if (!te) return;
    const b = Block.blocksList[te.getStoredBlockID()];
    if (!b || b === this) return;
    b.setBlockBoundsBasedOnState(w, x, y, z);
    let p = te.getProgress(0);
    if (te.isExtending()) p = f(1 - p);
    const o = te.getPistonOrientation();
    this.minX = b.getBlockBoundsMinX() - f(Facing.offsetsXForSide[o] * p);
    this.minY = b.getBlockBoundsMinY() - f(Facing.offsetsYForSide[o] * p);
    this.minZ = b.getBlockBoundsMinZ() - f(Facing.offsetsZForSide[o] * p);
    this.maxX = b.getBlockBoundsMaxX() - f(Facing.offsetsXForSide[o] * p);
    this.maxY = b.getBlockBoundsMaxY() - f(Facing.offsetsYForSide[o] * p);
    this.maxZ = b.getBlockBoundsMaxZ() - f(Facing.offsetsZForSide[o] * p);
  }

  /** The carried block's collision box stretched over the path it still has to travel. */
  getAxisAlignedBB(w: IWorld, x: number, y: number, z: number, blockId: number, progress: number, facing: number): AxisAlignedBB | null {
    if (blockId === 0 || blockId === this.blockID) return null;
    const box = Block.blocksList[blockId]?.getCollisionBoundingBoxFromPool(w, x, y, z) ?? null;
    if (!box) return null;
    const ox = Facing.offsetsXForSide[facing];
    const oy = Facing.offsetsYForSide[facing];
    const oz = Facing.offsetsZForSide[facing];
    if (ox < 0) box.minX -= f(ox * progress);
    else box.maxX -= f(ox * progress);
    if (oy < 0) box.minY -= f(oy * progress);
    else box.maxY -= f(oy * progress);
    if (oz < 0) box.minZ -= f(oz * progress);
    else box.maxZ -= f(oz * progress);
    return box;
  }

  private getTileEntityAtLocation(w: IBlockAccess, x: number, y: number, z: number): TileEntityPiston | null {
    const te = w.getBlockTileEntity?.(x, y, z) ?? null;
    return te instanceof TileEntityPiston ? te : null;
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return 0;
  }

  override registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon('piston_top');
  }
}
