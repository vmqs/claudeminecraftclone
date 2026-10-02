import type { JavaRandom } from '../core/JavaRandom';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { ItemStack } from '../item/ItemStack';
import type { IWorld } from '../world/IWorld';
import { TileEntityCommandBlock } from '../world/tileentity/TileEntityCommandBlock';
import type { TileEntity } from '../world/tileentity/TileEntity';
import { Block } from './Block';
import { BlockContainer } from './BlockContainer';
import { BlockGuiHooks } from './BlockGuiHooks';
import { Material } from './Material';

/** Command block (137): runs its command on a rising redstone edge (redstone is out of scope). */
export class BlockCommandBlock extends BlockContainer {
  constructor(id: number) {
    super(id, Material.iron);
  }

  createNewTileEntity(_w: IWorld): TileEntity {
    return new TileEntityCommandBlock();
  }

  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, _id: number): void {
    if (w.isRemote) return;
    const powered = Block.isPowered(w, x, y, z);
    const meta = w.getBlockMetadata(x, y, z);
    const wasPowered = (meta & 1) !== 0;
    if (powered && !wasPowered) {
      w.setBlockMetadataWithNotify(x, y, z, meta | 1, 4);
      w.scheduleBlockUpdate(x, y, z, this.blockID, this.tickRate(w));
    } else if (!powered && wasPowered) {
      w.setBlockMetadataWithNotify(x, y, z, meta & -2, 4);
    }
  }

  override updateTick(w: IWorld, x: number, y: number, z: number, _rand: JavaRandom): void {
    const te = w.getBlockTileEntity(x, y, z);
    if (te instanceof TileEntityCommandBlock) {
      te.setSuccessCount(te.executeCommandOnPowered());
      w.notifyComparatorsOfChange(x, y, z, this.blockID);
    }
  }

  override tickRate(_w: IWorld): number {
    return 1;
  }

  /** Opens the command editor (the original reuses displayGUIEditSign for it). */
  override onBlockActivated(w: IWorld, x: number, y: number, z: number, p: EntityPlayer): boolean {
    const te = w.getBlockTileEntity(x, y, z);
    if (te instanceof TileEntityCommandBlock) BlockGuiHooks.open({ kind: 'commandBlock', player: p, world: w, x, y, z, tileEntity: te });
    return true;
  }

  override hasComparatorInputOverride(): boolean {
    return true;
  }

  override getComparatorInputOverride(w: IWorld, x: number, y: number, z: number, _side: number): number {
    const te = w.getBlockTileEntity(x, y, z);
    return te instanceof TileEntityCommandBlock ? te.getSuccessCount() : 0;
  }

  override onBlockPlacedBy(w: IWorld, x: number, y: number, z: number, _e: EntityLiving, stack: ItemStack): void {
    const te = w.getBlockTileEntity(x, y, z);
    if (te instanceof TileEntityCommandBlock && stack.hasDisplayName()) te.setCommandSenderName(stack.getDisplayName());
  }
}
