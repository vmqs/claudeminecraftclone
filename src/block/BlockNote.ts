import type { EntityPlayer } from '../entity/EntityPlayer';
import { CreativeTabs } from '../item/CreativeTabs';
import type { IWorld } from '../world/IWorld';
import type { TileEntity } from '../world/tileentity/TileEntity';
import { TileEntityNote } from '../world/tileentity/TileEntityNote';
import { Block } from './Block';
import { BlockContainer } from './BlockContainer';
import { Material } from './Material';

/** Note block (25): right click raises the pitch and plays, left click plays; the instrument depends on the block below. */
export class BlockNote extends BlockContainer {
  static readonly instruments = ['harp', 'bd', 'snare', 'hat', 'bassattack'];

  constructor(id: number) {
    super(id, Material.wood);
    this.setCreativeTab(CreativeTabs.tabRedstone);
  }

  /** Plays on a rising redstone edge (only when the world simulates redstone). */
  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, _id: number): void {
    if (!Block.hasRedstone(w)) return;
    const powered = Block.isPowered(w, x, y, z);
    const te = w.getBlockTileEntity(x, y, z);
    if (te instanceof TileEntityNote && te.previousRedstoneState !== powered) {
      if (powered) te.triggerNote(w, x, y, z);
      te.previousRedstoneState = powered;
    }
  }

  override onBlockActivated(w: IWorld, x: number, y: number, z: number, _p: EntityPlayer): boolean {
    if (w.isRemote) return true;
    const te = w.getBlockTileEntity(x, y, z);
    if (te instanceof TileEntityNote) {
      te.changePitch();
      te.triggerNote(w, x, y, z);
    }
    return true;
  }

  override onBlockClicked(w: IWorld, x: number, y: number, z: number, _p: EntityPlayer): void {
    if (w.isRemote) return;
    const te = w.getBlockTileEntity(x, y, z);
    if (te instanceof TileEntityNote) te.triggerNote(w, x, y, z);
  }

  createNewTileEntity(_w: IWorld): TileEntity {
    return new TileEntityNote();
  }

  /** The note itself: "note.<instrument>" at pitch 2^((n-12)/12), volume 3, and a note particle coloured by n. */
  override onBlockEventReceived(w: IWorld, x: number, y: number, z: number, instrument: number, note: number): boolean {
    const pitch = Math.fround(Math.pow(2, (note - 12) / 12));
    const name = BlockNote.instruments[instrument] ?? 'harp';
    w.playSoundEffect(x + 0.5, y + 0.5, z + 0.5, 'note.' + name, 3, pitch);
    w.spawnParticle('note', x + 0.5, y + 1.2, z + 0.5, note / 24, 0, 0);
    return true;
  }
}
