import { AxisAlignedBB } from '../core/AxisAlignedBB';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { CreativeTabs } from '../item/CreativeTabs';
import type { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockDirectional } from './BlockDirectional';
import { BlockIds } from './BlockIds';
import { Material } from './Material';

const f = Math.fround;

/**
 * Fence gate (107, render type 21): meta & 3 = facing, bit 4 = open. Opening swings it away
 * from the player; closed it blocks like a 1.5-high fence.
 */
export class BlockFenceGate extends BlockDirectional {
  constructor(id: number) {
    super(id, Material.wood);
    this.setCreativeTab(CreativeTabs.tabRedstone);
  }

  override getIcon(side: number, _meta: number): Icon | null {
    return Block.blocksList[BlockIds.planks]!.getBlockTextureFromSide(side);
  }

  override canPlaceBlockAt(w: IWorld, x: number, y: number, z: number): boolean {
    return !w.getBlockMaterial(x, y - 1, z).isSolid() ? false : super.canPlaceBlockAt(w, x, y, z);
  }

  override getCollisionBoundingBoxFromPool(w: IWorld, x: number, y: number, z: number): AxisAlignedBB | null {
    const meta = w.getBlockMetadata(x, y, z);
    if (BlockFenceGate.isFenceGateOpen(meta)) return null;
    if (meta !== 2 && meta !== 0) return AxisAlignedBB.getBoundingBox(f(x + 0.375), y, z, f(x + 0.625), f(y + 1.5), z + 1);
    return AxisAlignedBB.getBoundingBox(x, y, f(z + 0.375), x + 1, f(y + 1.5), f(z + 0.625));
  }

  override setBlockBoundsBasedOnState(w: IBlockAccess, x: number, y: number, z: number): void {
    const d = BlockDirectional.getDirection(w.getBlockMetadata(x, y, z));
    if (d !== 2 && d !== 0) this.setBlockBounds(0.375, 0, 0, 0.625, 1, 1);
    else this.setBlockBounds(0, 0, 0.375, 1, 1, 0.625);
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override getBlocksMovement(w: IBlockAccess, x: number, y: number, z: number): boolean {
    return BlockFenceGate.isFenceGateOpen(w.getBlockMetadata(x, y, z));
  }

  override getRenderType(): number {
    return 21;
  }

  override onBlockPlacedBy(w: IWorld, x: number, y: number, z: number, e: EntityLiving, _stack: ItemStack): void {
    w.setBlockMetadataWithNotify(x, y, z, Block.yawToDirection(e) % 4, 2);
  }

  override onBlockActivated(w: IWorld, x: number, y: number, z: number, p: EntityPlayer): boolean {
    let meta = w.getBlockMetadata(x, y, z);
    if (BlockFenceGate.isFenceGateOpen(meta)) {
      w.setBlockMetadataWithNotify(x, y, z, meta & -5, 2);
    } else {
      const facing = Block.yawToDirection(p) % 4;
      if (BlockDirectional.getDirection(meta) === (facing + 2) % 4) meta = facing;
      w.setBlockMetadataWithNotify(x, y, z, meta | 4, 2);
    }
    BlockFenceGate.playDoorSound(w, p, x, y, z);
    return true;
  }

  /** Level event 1003 (door open/close sound). */
  static playDoorSound(w: IWorld, p: EntityPlayer | null, x: number, y: number, z: number): void {
    if (w.playAuxSFXAtEntity) w.playAuxSFXAtEntity(p, 1003, x, y, z, 0);
    else w.playAuxSFX(1003, x, y, z, 0);
  }

  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, id: number): void {
    if (w.isRemote || !Block.hasRedstone(w)) return;
    const meta = w.getBlockMetadata(x, y, z);
    const powered = Block.isPowered(w, x, y, z);
    if (powered || (id > 0 && Block.blocksList[id]?.canProvidePower())) {
      if (powered && !BlockFenceGate.isFenceGateOpen(meta)) {
        w.setBlockMetadataWithNotify(x, y, z, meta | 4, 2);
        BlockFenceGate.playDoorSound(w, null, x, y, z);
      } else if (!powered && BlockFenceGate.isFenceGateOpen(meta)) {
        w.setBlockMetadataWithNotify(x, y, z, meta & -5, 2);
        BlockFenceGate.playDoorSound(w, null, x, y, z);
      }
    }
  }

  static isFenceGateOpen(meta: number): boolean {
    return (meta & 4) !== 0;
  }

  override shouldSideBeRendered(_w: IBlockAccess, _x: number, _y: number, _z: number, _side: number): boolean {
    return true;
  }

  override registerIcons(_reg: IconRegister): void {}
}
