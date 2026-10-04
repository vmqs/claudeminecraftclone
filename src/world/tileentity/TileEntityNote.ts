import { BlockIds } from '../../block/BlockIds';
import { Material } from '../../block/Material';
import type { TagCompound } from '../../item/ItemStack';
import type { IWorld } from '../IWorld';
import { nbt } from './InventoryNBT';
import { TileEntity } from './TileEntity';
import { NBT } from '../storage/NBT';

/** A note block (TileEntityNote, savegame id "Music"): the pitch 0..24. */
export class TileEntityNote extends TileEntity {
  note = 0;
  previousRedstoneState = false;

  override writeToNBT(tag: TagCompound): void {
    super.writeToNBT(tag);
    NBT.setByte(tag, 'note', this.note);
  }

  override readFromNBT(tag: TagCompound): void {
    super.readFromNBT(tag);
    this.note = nbt.getByte(tag, 'note');
    if (this.note < 0) this.note = 0;
    if (this.note > 24) this.note = 24;
  }

  /** Right click: the next of the 25 pitches. */
  changePitch(): void {
    this.note = (this.note + 1) % 25;
    this.onInventoryChanged();
  }

  /**
   * Plays the note unless a block sits on top: block event (instrument, pitch), the instrument
   * chosen by the material below (0 harp, 1 bass drum on rock, 2 snare on sand, 3 clicks on
   * glass, 4 bass guitar on wood).
   */
  triggerNote(w: IWorld, x: number, y: number, z: number): void {
    if (w.getBlockMaterial(x, y + 1, z) !== Material.air) return;
    const below = w.getBlockMaterial(x, y - 1, z);
    let instrument = 0;
    if (below === Material.rock) instrument = 1;
    if (below === Material.sand) instrument = 2;
    if (below === Material.glass) instrument = 3;
    if (below === Material.wood) instrument = 4;
    w.addBlockEvent?.(x, y, z, BlockIds.music, instrument, this.note);
  }
}
