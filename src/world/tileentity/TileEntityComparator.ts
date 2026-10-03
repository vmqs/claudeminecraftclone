import type { TagCompound } from '../../item/ItemStack';
import { nbt } from './InventoryNBT';
import { TileEntity } from './TileEntity';

/** A comparator (TileEntityComparator): its output signal (redstone logic is out of scope). */
export class TileEntityComparator extends TileEntity {
  private outputSignal = 0;

  override writeToNBT(tag: TagCompound): void {
    super.writeToNBT(tag);
    tag.OutputSignal = this.outputSignal;
  }

  override readFromNBT(tag: TagCompound): void {
    super.readFromNBT(tag);
    this.outputSignal = nbt.getInt(tag, 'OutputSignal');
  }

  getOutputSignal(): number {
    return this.outputSignal;
  }

  setOutputSignal(v: number): void {
    this.outputSignal = v;
  }
}
