import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { MovingObjectPosition } from '../core/MovingObjectPosition';
import type { Vec3 } from '../core/Vec3';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { CreativeTabs } from '../item/CreativeTabs';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockFenceGate } from './BlockFenceGate';
import { BlockHalfSlab } from './BlockHalfSlab';
import { BlockIds } from './BlockIds';
import { BlockStairs } from './BlockStairs';
import { Material } from './Material';

/**
 * Trapdoor (96, render type 0 with its bounds): meta & 3 = the wall it hinges on
 * (0 south, 1 north, 2 east, 3 west of the trapdoor), 4 = open, 8 = in the upper half.
 */
export class BlockTrapDoor extends Block {
  constructor(id: number, material: Material) {
    super(id, material);
    this.setBlockBounds(0, 0, 0, 1, 1, 1);
    this.setCreativeTab(CreativeTabs.tabRedstone);
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override getBlocksMovement(w: IBlockAccess, x: number, y: number, z: number): boolean {
    return !BlockTrapDoor.isTrapdoorOpen(w.getBlockMetadata(x, y, z));
  }

  override getRenderType(): number {
    return 0;
  }

  override getSelectedBoundingBoxFromPool(w: IWorld, x: number, y: number, z: number): AxisAlignedBB {
    this.setBlockBoundsBasedOnState(w, x, y, z);
    return super.getSelectedBoundingBoxFromPool(w, x, y, z);
  }

  override getCollisionBoundingBoxFromPool(w: IWorld, x: number, y: number, z: number): AxisAlignedBB | null {
    this.setBlockBoundsBasedOnState(w, x, y, z);
    return super.getCollisionBoundingBoxFromPool(w, x, y, z);
  }

  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    this.setBlockBoundsForBlockRender(w.getBlockMetadata(x, y, z));
  }

  override setBlockBoundsForItemRender(): void {
    const t = 0.1875;
    this.setBlockBounds(0, 0.5 - t / 2, 0, 1, 0.5 + t / 2, 1);
  }

  setBlockBoundsForBlockRender(meta: number): void {
    const t = 0.1875;
    if ((meta & 8) !== 0) this.setBlockBounds(0, 1 - t, 0, 1, 1, 1);
    else this.setBlockBounds(0, 0, 0, 1, t, 1);
    if (BlockTrapDoor.isTrapdoorOpen(meta)) {
      const d = meta & 3;
      if (d === 0) this.setBlockBounds(0, 0, 1 - t, 1, 1, 1);
      if (d === 1) this.setBlockBounds(0, 0, 0, 1, 1, t);
      if (d === 2) this.setBlockBounds(1 - t, 0, 0, 1, 1, 1);
      if (d === 3) this.setBlockBounds(0, 0, 0, t, 1, 1);
    }
  }

  override onBlockClicked(_w: IWorld, _x: number, _y: number, _z: number, _p: EntityPlayer): void {}

  override onBlockActivated(w: IWorld, x: number, y: number, z: number, p: EntityPlayer): boolean {
    if (this.blockMaterial === Material.iron) return true;
    w.setBlockMetadataWithNotify(x, y, z, w.getBlockMetadata(x, y, z) ^ 4, 2);
    BlockFenceGate.playDoorSound(w, p, x, y, z);
    return true;
  }

  onPoweredBlockChange(w: IWorld, x: number, y: number, z: number, powered: boolean): void {
    const meta = w.getBlockMetadata(x, y, z);
    if ((meta & 4) > 0 !== powered) {
      w.setBlockMetadataWithNotify(x, y, z, meta ^ 4, 2);
      BlockFenceGate.playDoorSound(w, null, x, y, z);
    }
  }

  /** Pops off when the block it hinges on goes. */
  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, id: number): void {
    if (w.isRemote) return;
    const meta = w.getBlockMetadata(x, y, z);
    let sx = x;
    let sz = z;
    const d = meta & 3;
    if (d === 0) sz = z + 1;
    if (d === 1) sz = z - 1;
    if (d === 2) sx = x + 1;
    if (d === 3) sx = x - 1;
    if (!BlockTrapDoor.isValidSupportBlock(w.getBlockId(sx, y, sz))) {
      w.setBlockToAir(x, y, z);
      this.dropBlockAsItem(w, x, y, z, meta, 0);
    }
    if (!Block.hasRedstone(w)) return;
    const powered = Block.isPowered(w, x, y, z);
    if (powered || (id > 0 && Block.blocksList[id]?.canProvidePower())) this.onPoweredBlockChange(w, x, y, z, powered);
  }

  override collisionRayTrace(w: IWorld, x: number, y: number, z: number, start: Vec3, end: Vec3): MovingObjectPosition | null {
    this.setBlockBoundsBasedOnState(w, x, y, z);
    return super.collisionRayTrace(w, x, y, z, start, end);
  }

  /** Hinge from the clicked face; the upper-half bit from where the side was hit. */
  override onBlockPlaced(_w: IWorld, _x: number, _y: number, _z: number, side: number, _hx: number, hy: number, _hz: number, _meta: number): number {
    let meta = 0;
    if (side === 2) meta = 0;
    if (side === 3) meta = 1;
    if (side === 4) meta = 2;
    if (side === 5) meta = 3;
    if (side !== 1 && side !== 0 && hy > 0.5) meta |= 8;
    return meta;
  }

  override canPlaceBlockOnSide(w: IWorld, x: number, y: number, z: number, side: number): boolean {
    if (side === 0 || side === 1) return false;
    if (side === 2) z++;
    if (side === 3) z--;
    if (side === 4) x++;
    if (side === 5) x--;
    return BlockTrapDoor.isValidSupportBlock(w.getBlockId(x, y, z));
  }

  static isTrapdoorOpen(meta: number): boolean {
    return (meta & 4) !== 0;
  }

  private static isValidSupportBlock(id: number): boolean {
    if (id <= 0) return false;
    const b = Block.blocksList[id];
    return (b !== null && b.blockMaterial.isOpaque() && b.renderAsNormalBlock()) || id === BlockIds.glowStone || b instanceof BlockHalfSlab || b instanceof BlockStairs;
  }
}
