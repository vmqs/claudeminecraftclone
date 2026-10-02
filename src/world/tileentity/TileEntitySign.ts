import type { TagCompound } from '../../item/ItemStack';
import { nbt } from './InventoryNBT';
import { TileEntity } from './TileEntity';

/** A sign (TileEntitySign): four lines of at most 15 characters. */
export class TileEntitySign extends TileEntity {
  static readonly MAX_LINE_LENGTH = 15;
  signText: string[] = ['', '', '', ''];
  /** The line the sign editor's cursor is on (-1 when not editing). */
  lineBeingEdited = -1;
  private editable = true;

  override writeToNBT(tag: TagCompound): void {
    super.writeToNBT(tag);
    for (let i = 0; i < 4; i++) tag['Text' + (i + 1)] = this.signText[i];
  }

  override readFromNBT(tag: TagCompound): void {
    this.editable = false;
    super.readFromNBT(tag);
    for (let i = 0; i < 4; i++) {
      let line = nbt.getString(tag, 'Text' + (i + 1));
      if (line.length > TileEntitySign.MAX_LINE_LENGTH) line = line.substring(0, TileEntitySign.MAX_LINE_LENGTH);
      this.signText[i] = line;
    }
  }

  /** Sets the text from the editor (lines cut to 15 characters) and marks the chunk modified. */
  setSignText(lines: readonly string[]): void {
    for (let i = 0; i < 4; i++) this.signText[i] = (lines[i] ?? '').substring(0, TileEntitySign.MAX_LINE_LENGTH);
    this.onInventoryChanged();
    this.worldObj?.markBlockForUpdate(this.xCoord, this.yCoord, this.zCoord);
  }

  isEditable(): boolean {
    return this.editable;
  }

  setEditable(v: boolean): void {
    this.editable = v;
  }
}
