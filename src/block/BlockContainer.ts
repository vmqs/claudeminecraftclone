import { JavaRandom } from '../core/JavaRandom';
import { MathHelper } from '../core/MathHelper';
import type { IInventory } from '../gui/inventory/IInventory';
import { ItemStack } from '../item/ItemStack';
import type { IWorld } from '../world/IWorld';
import type { ITileEntityProvider, TileEntity } from '../world/tileentity/TileEntity';
import { Block } from './Block';
import type { Material } from './Material';

const f = Math.fround;

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

  /**
   * The contents of a broken container scattered as item entities, as chests, furnaces,
   * dispensers and hoppers do: a random point in the block per slot, stacks split into piles
   * of 10-30 items, each thrown with a small gaussian motion (upward 0.2).
   */
  static dropInventory(w: IWorld, x: number, y: number, z: number, inv: IInventory, rand: JavaRandom): void {
    for (let slot = 0; slot < inv.getSizeInventory(); slot++) {
      const stack = inv.getStackInSlot(slot);
      if (!stack) continue;
      const ox = f(f(rand.nextFloat() * f(0.8)) + f(0.1));
      const oy = f(f(rand.nextFloat() * f(0.8)) + f(0.1));
      const oz = f(f(rand.nextFloat() * f(0.8)) + f(0.1));
      while (stack.stackSize > 0) {
        let n = rand.nextInt(21) + 10;
        if (n > stack.stackSize) n = stack.stackSize;
        stack.stackSize -= n;
        const pile = new ItemStack(stack.itemID, n, stack.getItemDamage());
        if (stack.hasTagCompound()) pile.setTagCompound(structuredClone(stack.getTagCompound()));
        const s = f(0.05);
        const mx = f(f(rand.nextGaussian()) * s);
        const my = f(f(f(rand.nextGaussian()) * s) + f(0.2));
        const mz = f(f(rand.nextGaussian()) * s);
        Block.spawnItemWithMotion(w, f(x + ox), f(y + oy), f(z + oz), pile, mx, my, mz);
      }
    }
  }

  /** A fresh per-block random generator (the original kept a java.util.Random per block). */
  protected static newRandom(): JavaRandom {
    return new JavaRandom();
  }
}

/** Container.calcRedstoneFromInventory: 0-15 by how full the inventory is. */
export function calcRedstoneFromInventory(inv: IInventory | null): number {
  if (!inv) return 0;
  let filled = 0;
  let fraction = 0;
  for (let i = 0; i < inv.getSizeInventory(); i++) {
    const s = inv.getStackInSlot(i);
    if (s) {
      fraction = Math.fround(fraction + Math.fround(s.stackSize / Math.min(inv.getInventoryStackLimit(), s.getMaxStackSize())));
      filled++;
    }
  }
  fraction = Math.fround(fraction / inv.getSizeInventory());
  return MathHelper.floor_float(Math.fround(fraction * 14)) + (filled > 0 ? 1 : 0);
}
