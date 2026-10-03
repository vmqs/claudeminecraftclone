import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { CreativeTabs } from '../item/CreativeTabs';
import type { ItemStack } from '../item/ItemStack';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { Material } from './Material';

/**
 * Lever (69, render type 12). meta & 7: 1-4 on a wall (east, west, south, north facing),
 * 5/6 on the floor (along X / Z), 7/0 on the ceiling; bit 8 = on. Toggling clicks and updates
 * neighbours; the power it gives only matters to redstone, which is out of scope.
 */
export class BlockLever extends Block {
  constructor(id: number) {
    super(id, Material.circuits);
    this.setCreativeTab(CreativeTabs.tabRedstone);
  }

  override getCollisionBoundingBoxFromPool(_w: IWorld, _x: number, _y: number, _z: number): AxisAlignedBB | null {
    return null;
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override getRenderType(): number {
    return 12;
  }

  override canPlaceBlockOnSide(w: IWorld, x: number, y: number, z: number, side: number): boolean {
    if (side === 0 && w.isBlockNormalCube(x, y + 1, z)) return true;
    if (side === 1 && w.doesBlockHaveSolidTopSurface(x, y - 1, z)) return true;
    if (side === 2 && w.isBlockNormalCube(x, y, z + 1)) return true;
    if (side === 3 && w.isBlockNormalCube(x, y, z - 1)) return true;
    if (side === 4 && w.isBlockNormalCube(x + 1, y, z)) return true;
    return side === 5 && w.isBlockNormalCube(x - 1, y, z);
  }

  override canPlaceBlockAt(w: IWorld, x: number, y: number, z: number): boolean {
    return (
      w.isBlockNormalCube(x - 1, y, z) ||
      w.isBlockNormalCube(x + 1, y, z) ||
      w.isBlockNormalCube(x, y, z - 1) ||
      w.isBlockNormalCube(x, y, z + 1) ||
      w.doesBlockHaveSolidTopSurface(x, y - 1, z) ||
      w.isBlockNormalCube(x, y + 1, z)
    );
  }

  override onBlockPlaced(w: IWorld, x: number, y: number, z: number, side: number, _hx: number, _hy: number, _hz: number, meta: number): number {
    const on = meta & 8;
    let m = -1;
    if (side === 0 && w.isBlockNormalCube(x, y + 1, z)) m = 0;
    if (side === 1 && w.doesBlockHaveSolidTopSurface(x, y - 1, z)) m = 5;
    if (side === 2 && w.isBlockNormalCube(x, y, z + 1)) m = 4;
    if (side === 3 && w.isBlockNormalCube(x, y, z - 1)) m = 3;
    if (side === 4 && w.isBlockNormalCube(x + 1, y, z)) m = 2;
    if (side === 5 && w.isBlockNormalCube(x - 1, y, z)) m = 1;
    return m + on;
  }

  /** On the floor or ceiling, the lever's axis follows the placer's yaw. */
  override onBlockPlacedBy(w: IWorld, x: number, y: number, z: number, e: EntityLiving, _stack: ItemStack): void {
    const meta = w.getBlockMetadata(x, y, z);
    const pos = meta & 7;
    const on = meta & 8;
    const alongZ = (Block.yawToDirection(e) & 1) === 0;
    if (pos === BlockLever.invertMetadata(1)) w.setBlockMetadataWithNotify(x, y, z, (alongZ ? 5 : 6) | on, 2);
    else if (pos === BlockLever.invertMetadata(0)) w.setBlockMetadataWithNotify(x, y, z, (alongZ ? 7 : 0) | on, 2);
  }

  static invertMetadata(side: number): number {
    switch (side) {
      case 0:
        return 0;
      case 1:
        return 5;
      case 2:
        return 4;
      case 3:
        return 3;
      case 4:
        return 2;
      case 5:
        return 1;
      default:
        return -1;
    }
  }

  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, _id: number): void {
    if (!this.checkIfAttachedToBlock(w, x, y, z)) return;
    const pos = w.getBlockMetadata(x, y, z) & 7;
    let drop = false;
    if (!w.isBlockNormalCube(x - 1, y, z) && pos === 1) drop = true;
    if (!w.isBlockNormalCube(x + 1, y, z) && pos === 2) drop = true;
    if (!w.isBlockNormalCube(x, y, z - 1) && pos === 3) drop = true;
    if (!w.isBlockNormalCube(x, y, z + 1) && pos === 4) drop = true;
    if (!w.doesBlockHaveSolidTopSurface(x, y - 1, z) && pos === 5) drop = true;
    if (!w.doesBlockHaveSolidTopSurface(x, y - 1, z) && pos === 6) drop = true;
    if (!w.isBlockNormalCube(x, y + 1, z) && pos === 0) drop = true;
    if (!w.isBlockNormalCube(x, y + 1, z) && pos === 7) drop = true;
    if (drop) {
      this.dropBlockAsItem(w, x, y, z, w.getBlockMetadata(x, y, z), 0);
      w.setBlockToAir(x, y, z);
    }
  }

  private checkIfAttachedToBlock(w: IWorld, x: number, y: number, z: number): boolean {
    if (this.canPlaceBlockAt(w, x, y, z)) return true;
    this.dropBlockAsItem(w, x, y, z, w.getBlockMetadata(x, y, z), 0);
    w.setBlockToAir(x, y, z);
    return false;
  }

  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    const pos = w.getBlockMetadata(x, y, z) & 7;
    let r = 0.1875;
    if (pos === 1) this.setBlockBounds(0, 0.2, 0.5 - r, r * 2, 0.8, 0.5 + r);
    else if (pos === 2) this.setBlockBounds(1 - r * 2, 0.2, 0.5 - r, 1, 0.8, 0.5 + r);
    else if (pos === 3) this.setBlockBounds(0.5 - r, 0.2, 0, 0.5 + r, 0.8, r * 2);
    else if (pos === 4) this.setBlockBounds(0.5 - r, 0.2, 1 - r * 2, 0.5 + r, 0.8, 1);
    else if (pos === 5 || pos === 6) {
      r = 0.25;
      this.setBlockBounds(0.5 - r, 0, 0.5 - r, 0.5 + r, 0.6, 0.5 + r);
    } else {
      r = 0.25;
      this.setBlockBounds(0.5 - r, 0.4, 0.5 - r, 0.5 + r, 1, 0.5 + r);
    }
  }

  /** Flips bit 8 with a click (pitch 0.6 on, 0.5 off) and updates the block it is attached to. */
  override onBlockActivated(w: IWorld, x: number, y: number, z: number, _p: EntityPlayer): boolean {
    if (w.isRemote) return true;
    const meta = w.getBlockMetadata(x, y, z);
    const pos = meta & 7;
    const on = 8 - (meta & 8);
    w.setBlockMetadataWithNotify(x, y, z, pos + on, 3);
    w.playSoundEffect(x + 0.5, y + 0.5, z + 0.5, 'random.click', 0.3, on > 0 ? 0.6 : 0.5);
    w.notifyBlocksOfNeighborChange(x, y, z, this.blockID);
    this.notifyAttached(w, x, y, z, pos);
    return true;
  }

  private notifyAttached(w: IWorld, x: number, y: number, z: number, pos: number): void {
    if (pos === 1) w.notifyBlocksOfNeighborChange(x - 1, y, z, this.blockID);
    else if (pos === 2) w.notifyBlocksOfNeighborChange(x + 1, y, z, this.blockID);
    else if (pos === 3) w.notifyBlocksOfNeighborChange(x, y, z - 1, this.blockID);
    else if (pos === 4) w.notifyBlocksOfNeighborChange(x, y, z + 1, this.blockID);
    else if (pos === 5 || pos === 6) w.notifyBlocksOfNeighborChange(x, y - 1, z, this.blockID);
    else if (pos === 0 || pos === 7) w.notifyBlocksOfNeighborChange(x, y + 1, z, this.blockID);
  }

  override breakBlock(w: IWorld, x: number, y: number, z: number, id: number, meta: number): void {
    if ((meta & 8) > 0) {
      w.notifyBlocksOfNeighborChange(x, y, z, this.blockID);
      this.notifyAttached(w, x, y, z, meta & 7);
    }
    super.breakBlock(w, x, y, z, id, meta);
  }

  override isProvidingWeakPower(w: IBlockAccess, x: number, y: number, z: number, _side: number): number {
    return (w.getBlockMetadata(x, y, z) & 8) > 0 ? 15 : 0;
  }

  override isProvidingStrongPower(w: IBlockAccess, x: number, y: number, z: number, side: number): number {
    const meta = w.getBlockMetadata(x, y, z);
    if ((meta & 8) === 0) return 0;
    const pos = meta & 7;
    if ((pos === 0 || pos === 7) && side === 0) return 15;
    if ((pos === 6 || pos === 5) && side === 1) return 15;
    if (pos === 4 && side === 2) return 15;
    if (pos === 3 && side === 3) return 15;
    if (pos === 2 && side === 4) return 15;
    return pos === 1 && side === 5 ? 15 : 0;
  }

  override canProvidePower(): boolean {
    return true;
  }
}
