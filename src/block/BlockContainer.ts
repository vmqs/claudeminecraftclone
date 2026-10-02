import type { IWorld } from '../world/IWorld';
import type { ITileEntityProvider, TileEntity } from '../world/tileentity/TileEntity';
import { Block } from './Block';
import type { Material } from './Material';

/**
 * A block with a tile entity (BlockContainer): the chunk creates the tile entity when the block
 * is set, and breaking the block removes it.
 */
export abstract class BlockContainer extends Block implements ITileEntityProvider {
  protected constructor(id: number, material: Material) {
    super(id, material);
    this.isBlockContainer = true;
  }

  abstract createNewTileEntity(world: IWorld): TileEntity | null;

  override breakBlock(w: IWorld, x: number, y: number, z: number, id: number, meta: number): void {
    super.breakBlock(w, x, y, z, id, meta);
    w.removeBlockTileEntity(x, y, z);
  }

  /** Block events go to the tile entity (chest lids, note blocks, pistons). */
  override onBlockEventReceived(w: IWorld, x: number, y: number, z: number, id: number, param: number): boolean {
    super.onBlockEventReceived(w, x, y, z, id, param);
    const te = w.getBlockTileEntity(x, y, z);
    return te ? te.receiveClientEvent(id, param) : false;
  }
}
