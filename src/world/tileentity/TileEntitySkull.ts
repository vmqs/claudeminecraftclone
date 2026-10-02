import type { TagCompound } from '../../item/ItemStack';
import { nbt } from './InventoryNBT';
import { TileEntity } from './TileEntity';

/** A mob head (TileEntitySkull): type 0 skeleton, 1 wither, 2 zombie, 3 player (ExtraType = name), 4 creeper. */
export class TileEntitySkull extends TileEntity {
  private skullType = 0;
  /** 0..15, in sixteenths of a turn, for heads standing on the floor. */
  private skullRotation = 0;
  private extraType = '';

  override writeToNBT(tag: TagCompound): void {
    super.writeToNBT(tag);
    tag.SkullType = ((this.skullType & 255) << 24) >> 24;
    tag.Rot = ((this.skullRotation & 255) << 24) >> 24;
    tag.ExtraType = this.extraType;
  }

  override readFromNBT(tag: TagCompound): void {
    super.readFromNBT(tag);
    this.skullType = nbt.getByte(tag, 'SkullType');
    this.skullRotation = nbt.getByte(tag, 'Rot');
    if (nbt.hasKey(tag, 'ExtraType')) this.extraType = nbt.getString(tag, 'ExtraType');
  }

  setSkullType(type: number, extra: string): void {
    this.skullType = type;
    this.extraType = extra;
  }

  getSkullType(): number {
    return this.skullType;
  }

  /** func_82119_b */
  getSkullRotation(): number {
    return this.skullRotation;
  }

  setSkullRotation(r: number): void {
    this.skullRotation = r;
  }

  getExtraType(): string {
    return this.extraType;
  }
}
