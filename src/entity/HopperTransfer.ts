import { AxisAlignedBB } from '../core/AxisAlignedBB';
import { MathHelper } from '../core/MathHelper';
import type { IInventory } from '../gui/inventory/IInventory';
import { ItemStack } from '../item/ItemStack';
import type { World } from '../world/World';
import type { Entity } from './Entity';
import { EntityList } from './EntityList';

/** Something that pulls items like a hopper (the Hopper interface of 1.5.2). */
export interface HopperLike extends IInventory {
  getWorldObj(): World;
  getXPos(): number;
  getYPos(): number;
  getZPos(): number;
}

/** ISidedInventory, recognised by its methods (furnaces, brewing stands). */
interface SidedInventory extends IInventory {
  getAccessibleSlotsFromSide(side: number): number[];
  canInsertItem(slot: number, stack: ItemStack, side: number): boolean;
  canExtractItem(slot: number, stack: ItemStack, side: number): boolean;
}

function isSided(inv: IInventory): inv is SidedInventory {
  return typeof (inv as Partial<SidedInventory>).getAccessibleSlotsFromSide === 'function';
}

function isInventory(x: unknown): x is IInventory {
  return !!x && typeof (x as Partial<IInventory>).getSizeInventory === 'function' && typeof (x as Partial<IInventory>).getStackInSlot === 'function';
}

/**
 * The item moving rules of TileEntityHopper used by hopper minecarts: take one item from the
 * inventory above (or pick up a dropped item there), merging into the first slots that fit.
 */
export const HopperTransfer = {
  /** suckItemsIntoHopper */
  suckItemsIntoHopper(hopper: HopperLike): boolean {
    const above = HopperTransfer.getInventoryAtLocation(hopper.getWorldObj(), hopper.getXPos(), hopper.getYPos() + 1, hopper.getZPos());
    if (above) {
      const side = 0;
      const slots = isSided(above) ? above.getAccessibleSlotsFromSide(side) : [...Array(above.getSizeInventory()).keys()];
      for (const slot of slots) if (HopperTransfer.pullFromSlot(hopper, above, slot, side)) return true;
      return false;
    }
    const item = HopperTransfer.findItemAt(hopper.getWorldObj(), hopper.getXPos(), hopper.getYPos() + 1, hopper.getZPos());
    return item ? HopperTransfer.insertEntityItem(hopper, item) : false;
  },

  /** func_102012_a: moves one item of a slot into the hopper, or puts it back. */
  pullFromSlot(hopper: IInventory, from: IInventory, slot: number, side: number): boolean {
    const s = from.getStackInSlot(slot);
    if (!s || (isSided(from) && !from.canExtractItem(slot, s, side))) return false;
    const backup = s.copy();
    const rest = HopperTransfer.insertStack(hopper, from.decrStackSize(slot, 1), -1);
    if (!rest || rest.stackSize === 0) {
      from.onInventoryChanged();
      return true;
    }
    from.setInventorySlotContents(slot, backup);
    return false;
  },

  /** func_96114_a: puts a dropped item's stack into the inventory; the entity dies when emptied. */
  insertEntityItem(inv: IInventory, item: Entity): boolean {
    const e = item as Entity & { getEntityItem(): ItemStack; setEntityItemStack(s: ItemStack): void };
    const rest = HopperTransfer.insertStack(inv, e.getEntityItem().copy(), -1);
    if (rest && rest.stackSize !== 0) {
      e.setEntityItemStack(rest);
      return false;
    }
    e.setDead();
    return true;
  },

  /** insertStack: fills empty or matching slots in order; returns what is left (or null). */
  insertStack(inv: IInventory, stack: ItemStack | null, side: number): ItemStack | null {
    const slots = isSided(inv) && side > -1 ? inv.getAccessibleSlotsFromSide(side) : [...Array(inv.getSizeInventory()).keys()];
    for (const slot of slots) {
      if (!stack || stack.stackSize <= 0) break;
      stack = HopperTransfer.insertIntoSlot(inv, stack, slot, side);
    }
    return stack && stack.stackSize === 0 ? null : stack;
  },

  insertIntoSlot(inv: IInventory, stack: ItemStack, slot: number, side: number): ItemStack | null {
    if (!inv.isStackValidForSlot(slot, stack) || (isSided(inv) && !inv.canInsertItem(slot, stack, side))) return stack;
    const there = inv.getStackInSlot(slot);
    let moved = false;
    let rest: ItemStack | null = stack;
    if (!there) {
      inv.setInventorySlotContents(slot, stack);
      rest = null;
      moved = true;
    } else if (HopperTransfer.canMerge(there, stack)) {
      const n = Math.min(stack.stackSize, stack.getMaxStackSize() - there.stackSize);
      stack.stackSize -= n;
      there.stackSize += n;
      moved = n > 0;
    }
    if (moved) inv.onInventoryChanged();
    return rest;
  },

  canMerge(a: ItemStack, b: ItemStack): boolean {
    if (a.itemID !== b.itemID || a.getItemDamage() !== b.getItemDamage()) return false;
    return a.stackSize > a.getMaxStackSize() ? false : ItemStack.areItemStackTagsEqual(a, b);
  },

  /** A tile entity inventory at the block (chests as their double inventory), else a random inventory entity there. */
  getInventoryAtLocation(w: World, x: number, y: number, z: number): IInventory | null {
    const bx = MathHelper.floor_double(x);
    const by = MathHelper.floor_double(y);
    const bz = MathHelper.floor_double(z);
    const te = w.getBlockTileEntity(bx, by, bz);
    if (isInventory(te)) {
      const block = w.getBlockId(bx, by, bz);
      const chestInv = HopperTransfer.chestInventory?.(w, bx, by, bz, block);
      return chestInv ?? te;
    }
    const list = w.getEntitiesWithinAABBExcludingEntity(null, AxisAlignedBB.getBoundingBox(x, y, z, x + 1, y + 1, z + 1), (e) => isInventory(e) && e.isEntityAlive());
    return list.length > 0 ? (list[w.rand.nextInt(list.length)] as unknown as IInventory) : null;
  },

  /** BlockChest.getInventory (large chests), installed by the block code; null = the tile entity itself. */
  chestInventory: null as ((w: World, x: number, y: number, z: number, blockId: number) => IInventory | null) | null,

  /** func_96119_a: the first dropped item in the block-sized box at (x, y, z). */
  findItemAt(w: World, x: number, y: number, z: number): Entity | null {
    const list = w.getEntitiesWithinAABBExcludingEntity(null, AxisAlignedBB.getBoundingBox(x, y, z, x + 1, y + 1, z + 1), (e) => e.isEntityAlive() && EntityList.getEntityString(e) === 'Item');
    return list.length > 0 ? list[0] : null;
  },
};
