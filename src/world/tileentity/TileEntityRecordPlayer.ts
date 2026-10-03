import { ItemStack, type TagCompound } from '../../item/ItemStack';
import { nbt } from './InventoryNBT';
import { TileEntity } from './TileEntity';

/** A jukebox (TileEntityRecordPlayer): the record inside. */
export class TileEntityRecordPlayer extends TileEntity {
  private record: ItemStack | null = null;

  override readFromNBT(tag: TagCompound): void {
    super.readFromNBT(tag);
    if (tag.RecordItem && typeof tag.RecordItem === 'object') this.setRecord(ItemStack.loadItemStackFromNBT(tag.RecordItem as TagCompound));
    else if (nbt.getInt(tag, 'Record') > 0) this.setRecord(new ItemStack(nbt.getInt(tag, 'Record'), 1, 0));
  }

  override writeToNBT(tag: TagCompound): void {
    super.writeToNBT(tag);
    const r = this.getRecord();
    if (r) {
      tag.RecordItem = r.writeToNBT();
      tag.Record = r.itemID;
    }
  }

  /** func_96097_a */
  getRecord(): ItemStack | null {
    return this.record;
  }

  /** func_96098_a */
  setRecord(stack: ItemStack | null): void {
    this.record = stack;
    this.onInventoryChanged();
  }
}
