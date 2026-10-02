import { ItemStack, type TagCompound } from '../../item/ItemStack';
import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { TileEntity } from './TileEntity';

/**
 * The "Items" list of container tile entities: one compound per non-empty slot with a byte
 * "Slot" next to the item's own {id, Count, Damage, tag}.
 */
export function writeItemsToNBT(tag: TagCompound, stacks: readonly (ItemStack | null)[]): void {
  const list: TagCompound[] = [];
  for (let i = 0; i < stacks.length; i++) {
    const s = stacks[i];
    if (s) list.push({ Slot: (i << 24) >> 24, ...s.writeToNBT() });
  }
  tag.Items = list;
}

/**
 * Reads an "Items" list into a fresh slot array. `unsignedSlot` reads the slot byte as 0..255
 * (chests and dispensers) instead of -128..127 (furnaces, hoppers, brewing stands).
 */
export function readItemsFromNBT(tag: TagCompound, size: number, unsignedSlot: boolean): (ItemStack | null)[] {
  const stacks = new Array<ItemStack | null>(size).fill(null);
  const list = Array.isArray(tag.Items) ? (tag.Items as TagCompound[]) : [];
  for (const t of list) {
    const raw = Number(t.Slot ?? 0);
    const slot = unsignedSlot ? raw & 255 : (raw << 24) >> 24;
    if (slot >= 0 && slot < size) stacks[slot] = ItemStack.loadItemStackFromNBT(t);
  }
  return stacks;
}

/** NBT short/byte/int readers over the plain-object tags. */
export const nbt = {
  getInt(tag: TagCompound, key: string): number {
    return Number(tag[key] ?? 0) | 0;
  },
  getShort(tag: TagCompound, key: string): number {
    return ((Number(tag[key] ?? 0) | 0) << 16) >> 16;
  },
  getByte(tag: TagCompound, key: string): number {
    return ((Number(tag[key] ?? 0) | 0) << 24) >> 24;
  },
  getString(tag: TagCompound, key: string): string {
    const v = tag[key];
    return v === undefined || v === null ? '' : String(v);
  },
  getFloat(tag: TagCompound, key: string): number {
    return Math.fround(Number(tag[key] ?? 0));
  },
  getBoolean(tag: TagCompound, key: string): boolean {
    return !!tag[key];
  },
  hasKey(tag: TagCompound, key: string): boolean {
    return tag[key] !== undefined;
  },
};

/** The usual isUseableByPlayer of container tile entities: still in the world and within 8 blocks. */
export function isUseableByPlayerAt(te: TileEntity, player: EntityPlayer): boolean {
  const w = te.worldObj;
  if (!w || w.getBlockTileEntity(te.xCoord, te.yCoord, te.zCoord) !== te) return false;
  return !(player.getDistanceSq(te.xCoord + 0.5, te.yCoord + 0.5, te.zCoord + 0.5) > 64);
}
