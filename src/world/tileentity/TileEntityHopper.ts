import { AxisAlignedBB } from '../../core/AxisAlignedBB';
import { Facing } from '../../core/Facing';
import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import type { EntityPlayer } from '../../entity/EntityPlayer';
import { decrStackInArray, type IInventory, takeStackFromArray } from '../../gui/inventory/IInventory';
import { ItemStack, type TagCompound } from '../../item/ItemStack';
import type { IWorld } from '../IWorld';
import { isInventory, isSidedInventory } from './ISidedInventory';
import { isUseableByPlayerAt, nbt, readItemsFromNBT, writeItemsToNBT } from './InventoryNBT';
import { getChestInventory, TileEntityChest } from './TileEntityChest';
import { TileEntity } from './TileEntity';

/** An EntityItem as the hopper sees it. */
interface ItemEntityLike extends Entity {
  getEntityItem(): ItemStack;
  setEntityItemStack(stack: ItemStack): void;
}

function isItemEntity(e: Entity): e is ItemEntityLike {
  const o = e as Partial<ItemEntityLike>;
  return typeof o.getEntityItem === 'function' && typeof o.setEntityItemStack === 'function' && !e.isDead;
}

/** What can feed a hopper (the Hopper interface: the block and the hopper minecart). */
export interface HopperLike extends IInventory {
  getWorldObj(): IWorld | null;
  getXPos(): number;
  getYPos(): number;
  getZPos(): number;
}

/**
 * A hopper (TileEntityHopper): 5 slots; every 8 ticks it pushes one item into the inventory it
 * faces and pulls one from the inventory (or item entity) above, unless powered (meta bit 8).
 */
export class TileEntityHopper extends TileEntity implements HopperLike {
  private hopperItemStacks: (ItemStack | null)[] = new Array<ItemStack | null>(5).fill(null);
  private inventoryName: string | null = null;
  private transferCooldown = -1;

  /** BlockHopper.getDirectionFromMetadata */
  static getDirectionFromMetadata(meta: number): number {
    return meta & 7;
  }

  /** BlockHopper.getIsBlockNotPoweredFromMetadata */
  static getIsBlockNotPoweredFromMetadata(meta: number): boolean {
    return (meta & 8) !== 8;
  }

  override readFromNBT(tag: TagCompound): void {
    super.readFromNBT(tag);
    if (nbt.hasKey(tag, 'CustomName')) this.inventoryName = nbt.getString(tag, 'CustomName');
    this.transferCooldown = nbt.getInt(tag, 'TransferCooldown');
    this.hopperItemStacks = readItemsFromNBT(tag, 5, false);
  }

  override writeToNBT(tag: TagCompound): void {
    super.writeToNBT(tag);
    writeItemsToNBT(tag, this.hopperItemStacks);
    tag.TransferCooldown = this.transferCooldown;
    if (this.isInvNameLocalized()) tag.CustomName = this.inventoryName;
  }

  getSizeInventory(): number {
    return this.hopperItemStacks.length;
  }

  getStackInSlot(slot: number): ItemStack | null {
    return this.hopperItemStacks[slot] ?? null;
  }

  decrStackSize(slot: number, n: number): ItemStack | null {
    return decrStackInArray(this.hopperItemStacks, slot, n);
  }

  getStackInSlotOnClosing(slot: number): ItemStack | null {
    return takeStackFromArray(this.hopperItemStacks, slot);
  }

  setInventorySlotContents(slot: number, stack: ItemStack | null): void {
    this.hopperItemStacks[slot] = stack;
    if (stack && stack.stackSize > this.getInventoryStackLimit()) stack.stackSize = this.getInventoryStackLimit();
  }

  getInvName(): string {
    return this.isInvNameLocalized() ? this.inventoryName! : 'container.hopper';
  }

  isInvNameLocalized(): boolean {
    return this.inventoryName !== null && this.inventoryName.length > 0;
  }

  setInventoryName(name: string): void {
    this.inventoryName = name;
  }

  getInventoryStackLimit(): number {
    return 64;
  }

  isUseableByPlayer(player: EntityPlayer): boolean {
    return isUseableByPlayerAt(this, player);
  }

  openChest(): void {}

  closeChest(): void {}

  isStackValidForSlot(_slot: number, _stack: ItemStack): boolean {
    return true;
  }

  override updateEntity(): void {
    const w = this.worldObj;
    if (w && !w.isRemote) {
      this.transferCooldown--;
      if (!this.isCoolingDown()) {
        this.setTransferCooldown(0);
        this.updateHopper();
      }
    }
  }

  /** func_98045_j: one push and one pull; true when something moved. */
  updateHopper(): boolean {
    const w = this.worldObj;
    if (!w || w.isRemote) return false;
    if (!this.isCoolingDown() && TileEntityHopper.getIsBlockNotPoweredFromMetadata(this.getBlockMetadata())) {
      const pushed = this.insertItemToInventory();
      const pulled = TileEntityHopper.suckItemsIntoHopper(this);
      if (pushed || pulled) {
        this.setTransferCooldown(8);
        this.onInventoryChanged();
        return true;
      }
    }
    return false;
  }

  private insertItemToInventory(): boolean {
    const out = this.getOutputInventory();
    if (!out) return false;
    for (let i = 0; i < this.getSizeInventory(); i++) {
      const s = this.getStackInSlot(i);
      if (!s) continue;
      const before = s.copy();
      const rest = TileEntityHopper.insertStack(out, this.decrStackSize(i, 1), Facing.oppositeSide[TileEntityHopper.getDirectionFromMetadata(this.getBlockMetadata())]);
      if (!rest || rest.stackSize === 0) {
        out.onInventoryChanged();
        return true;
      }
      this.setInventorySlotContents(i, before);
    }
    return false;
  }

  /** Pulls one item from the inventory above, or picks up an item entity lying on top. */
  static suckItemsIntoHopper(hopper: HopperLike): boolean {
    const above = TileEntityHopper.getInventoryAboveHopper(hopper);
    if (above) {
      const side = 0;
      if (isSidedInventory(above)) {
        for (const slot of above.getAccessibleSlotsFromSide(side)) if (TileEntityHopper.pullFromSlot(hopper, above, slot, side)) return true;
      } else {
        const n = above.getSizeInventory();
        for (let slot = 0; slot < n; slot++) if (TileEntityHopper.pullFromSlot(hopper, above, slot, side)) return true;
      }
    } else {
      const item = TileEntityHopper.getItemEntityAt(hopper.getWorldObj()!, hopper.getXPos(), hopper.getYPos() + 1, hopper.getZPos());
      if (item) return TileEntityHopper.insertItemEntity(hopper, item);
    }
    return false;
  }

  /** func_102012_a */
  private static pullFromSlot(hopper: HopperLike, inv: IInventory, slot: number, side: number): boolean {
    const s = inv.getStackInSlot(slot);
    if (s && TileEntityHopper.canExtractItemFromInventory(inv, s, slot, side)) {
      const before = s.copy();
      const rest = TileEntityHopper.insertStack(hopper, inv.decrStackSize(slot, 1), -1);
      if (!rest || rest.stackSize === 0) {
        inv.onInventoryChanged();
        return true;
      }
      inv.setInventorySlotContents(slot, before);
    }
    return false;
  }

  /** func_96114_a: puts as much of an item entity as fits; kills the entity when all went in. */
  static insertItemEntity(inv: IInventory, item: ItemEntityLike | null): boolean {
    if (!item) return false;
    const rest = TileEntityHopper.insertStack(inv, item.getEntityItem().copy(), -1);
    if (rest && rest.stackSize !== 0) {
      item.setEntityItemStack(rest);
      return false;
    }
    item.setDead();
    return true;
  }

  /** Inserts a stack into an inventory (respecting sided slots); returns what is left, or null. */
  static insertStack(inv: IInventory, stack: ItemStack | null, side: number): ItemStack | null {
    if (isSidedInventory(inv) && side > -1) {
      const slots = inv.getAccessibleSlotsFromSide(side);
      for (let i = 0; i < slots.length && stack && stack.stackSize > 0; i++) stack = TileEntityHopper.insertIntoSlot(inv, stack, slots[i], side);
    } else {
      const n = inv.getSizeInventory();
      for (let i = 0; i < n && stack && stack.stackSize > 0; i++) stack = TileEntityHopper.insertIntoSlot(inv, stack, i, side);
    }
    if (stack && stack.stackSize === 0) stack = null;
    return stack;
  }

  private static canInsertItemToInventory(inv: IInventory, stack: ItemStack, slot: number, side: number): boolean {
    if (!inv.isStackValidForSlot(slot, stack)) return false;
    return !isSidedInventory(inv) || inv.canInsertItem(slot, stack, side);
  }

  private static canExtractItemFromInventory(inv: IInventory, stack: ItemStack, slot: number, side: number): boolean {
    return !isSidedInventory(inv) || inv.canExtractItem(slot, stack, side);
  }

  /** func_102014_c */
  private static insertIntoSlot(inv: IInventory, stack: ItemStack, slot: number, side: number): ItemStack | null {
    const there = inv.getStackInSlot(slot);
    let rest: ItemStack | null = stack;
    if (TileEntityHopper.canInsertItemToInventory(inv, stack, slot, side)) {
      let moved = false;
      if (!there) {
        inv.setInventorySlotContents(slot, stack);
        rest = null;
        moved = true;
      } else if (TileEntityHopper.areItemStacksEqualItem(there, stack)) {
        const room = stack.getMaxStackSize() - there.stackSize;
        const n = Math.min(stack.stackSize, room);
        stack.stackSize -= n;
        there.stackSize += n;
        moved = n > 0;
      }
      if (moved) {
        if (inv instanceof TileEntityHopper) inv.setTransferCooldown(8);
        inv.onInventoryChanged();
      }
    }
    return rest;
  }

  private getOutputInventory(): IInventory | null {
    const d = TileEntityHopper.getDirectionFromMetadata(this.getBlockMetadata());
    return TileEntityHopper.getInventoryAtLocation(
      this.worldObj!,
      this.xCoord + Facing.offsetsXForSide[d],
      this.yCoord + Facing.offsetsYForSide[d],
      this.zCoord + Facing.offsetsZForSide[d],
    );
  }

  static getInventoryAboveHopper(hopper: HopperLike): IInventory | null {
    return TileEntityHopper.getInventoryAtLocation(hopper.getWorldObj()!, hopper.getXPos(), hopper.getYPos() + 1, hopper.getZPos());
  }

  /** func_96119_a: the first item entity in the block at (x, y, z). */
  static getItemEntityAt(w: IWorld, x: number, y: number, z: number): ItemEntityLike | null {
    const list = w.getEntitiesWithinAABBExcludingEntity(null, AxisAlignedBB.getBoundingBox(x, y, z, x + 1, y + 1, z + 1));
    for (const e of list) if (isItemEntity(e)) return e;
    return null;
  }

  /** An inventory tile entity (a double chest as one) or an inventory entity (minecart) at (x, y, z). */
  static getInventoryAtLocation(w: IWorld, x: number, y: number, z: number): IInventory | null {
    let inv: IInventory | null = null;
    const bx = MathHelper.floor_double(x);
    const by = MathHelper.floor_double(y);
    const bz = MathHelper.floor_double(z);
    const te = w.getBlockTileEntity(bx, by, bz);
    if (te && isInventory(te)) {
      inv = te;
      if (te instanceof TileEntityChest) inv = getChestInventory(w, bx, by, bz);
    }
    if (!inv) {
      const list = w.getEntitiesWithinAABBExcludingEntity(null, AxisAlignedBB.getBoundingBox(x, y, z, x + 1, y + 1, z + 1)).filter((e) => !e.isDead && isInventory(e));
      if (list.length > 0) inv = list[w.rand.nextInt(list.length)] as unknown as IInventory;
    }
    return inv;
  }

  private static areItemStacksEqualItem(a: ItemStack, b: ItemStack): boolean {
    if (a.itemID !== b.itemID) return false;
    if (a.getItemDamage() !== b.getItemDamage()) return false;
    return a.stackSize > a.getMaxStackSize() ? false : ItemStack.areItemStackTagsEqual(a, b);
  }

  getXPos(): number {
    return this.xCoord;
  }

  getYPos(): number {
    return this.yCoord;
  }

  getZPos(): number {
    return this.zCoord;
  }

  setTransferCooldown(n: number): void {
    this.transferCooldown = n;
  }

  isCoolingDown(): boolean {
    return this.transferCooldown > 0;
  }
}
