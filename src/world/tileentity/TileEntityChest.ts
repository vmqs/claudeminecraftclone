import { Block } from '../../block/Block';
import { BlockIds } from '../../block/BlockIds';
import { AxisAlignedBB } from '../../core/AxisAlignedBB';
import { EntityList } from '../../entity/EntityList';
import type { EntityPlayer } from '../../entity/EntityPlayer';
import { decrStackInArray, type IInventory, takeStackFromArray } from '../../gui/inventory/IInventory';
import type { ItemStack, TagCompound } from '../../item/ItemStack';
import type { IWorld } from '../IWorld';
import { InventoryLargeChest } from './InventoryLargeChest';
import { isUseableByPlayerAt, nbt, readItemsFromNBT, writeItemsToNBT } from './InventoryNBT';
import { TileEntity } from './TileEntity';

const f = Math.fround;

/** 1 for the trapped chest (146), 0 for the normal chest (54), -1 for anything else. */
export function chestTypeOf(id: number): number {
  if (id === BlockIds.chest) return 0;
  if (id === BlockIds.chestTrapped) return 1;
  return -1;
}

/**
 * A chest (TileEntityChest): 27 slots, the links to an adjacent chest of the same kind (a
 * double chest), the number of players looking inside and the lid animation they drive.
 */
export class TileEntityChest extends TileEntity implements IInventory {
  private chestContents: (ItemStack | null)[] = new Array<ItemStack | null>(36).fill(null);
  adjacentChestChecked = false;
  adjacentChestZNeg: TileEntityChest | null = null;
  adjacentChestXPos: TileEntityChest | null = null;
  adjacentChestXNeg: TileEntityChest | null = null;
  adjacentChestZPosition: TileEntityChest | null = null;
  lidAngle = 0;
  prevLidAngle = 0;
  numUsingPlayers = 0;
  private ticksSinceSync = 0;
  /** 0 normal, 1 trapped, -1 not known yet (func_94046_i). */
  private cachedChestType = -1;
  private customName: string | null = null;

  getSizeInventory(): number {
    return 27;
  }

  getStackInSlot(slot: number): ItemStack | null {
    return this.chestContents[slot] ?? null;
  }

  decrStackSize(slot: number, n: number): ItemStack | null {
    if (!this.chestContents[slot]) return null;
    const s = decrStackInArray(this.chestContents, slot, n);
    this.onInventoryChanged();
    return s;
  }

  getStackInSlotOnClosing(slot: number): ItemStack | null {
    return takeStackFromArray(this.chestContents, slot);
  }

  setInventorySlotContents(slot: number, stack: ItemStack | null): void {
    this.chestContents[slot] = stack;
    if (stack && stack.stackSize > this.getInventoryStackLimit()) stack.stackSize = this.getInventoryStackLimit();
    this.onInventoryChanged();
  }

  getInvName(): string {
    return this.isInvNameLocalized() ? this.customName! : 'container.chest';
  }

  isInvNameLocalized(): boolean {
    return this.customName !== null && this.customName.length > 0;
  }

  /** func_94043_a: a name from a renamed chest item. */
  setChestGuiName(name: string): void {
    this.customName = name;
  }

  override readFromNBT(tag: TagCompound): void {
    super.readFromNBT(tag);
    this.chestContents = readItemsFromNBT(tag, this.getSizeInventory(), true);
    if (nbt.hasKey(tag, 'CustomName')) this.customName = nbt.getString(tag, 'CustomName');
  }

  override writeToNBT(tag: TagCompound): void {
    super.writeToNBT(tag);
    writeItemsToNBT(tag, this.chestContents);
    if (this.isInvNameLocalized()) tag.CustomName = this.customName;
  }

  getInventoryStackLimit(): number {
    return 64;
  }

  isUseableByPlayer(player: EntityPlayer): boolean {
    return isUseableByPlayerAt(this, player);
  }

  override updateContainingBlockInfo(): void {
    super.updateContainingBlockInfo();
    this.adjacentChestChecked = false;
  }

  /** func_90009_a: forget a cached neighbour that is gone or no longer in that place. */
  private checkNeighbour(other: TileEntityChest, dir: number): void {
    if (other.isInvalid()) {
      this.adjacentChestChecked = false;
    } else if (this.adjacentChestChecked) {
      if (dir === 0 && this.adjacentChestZPosition !== other) this.adjacentChestChecked = false;
      else if (dir === 1 && this.adjacentChestXNeg !== other) this.adjacentChestChecked = false;
      else if (dir === 2 && this.adjacentChestZNeg !== other) this.adjacentChestChecked = false;
      else if (dir === 3 && this.adjacentChestXPos !== other) this.adjacentChestChecked = false;
    }
  }

  /** Finds the chest of the same kind on each side (a double chest has exactly one). */
  checkForAdjacentChests(): void {
    if (this.adjacentChestChecked) return;
    this.adjacentChestChecked = true;
    this.adjacentChestZNeg = null;
    this.adjacentChestXPos = null;
    this.adjacentChestXNeg = null;
    this.adjacentChestZPosition = null;
    const at = (x: number, y: number, z: number): TileEntityChest | null => {
      if (!this.isSameChestType(x, y, z)) return null;
      const te = this.worldObj!.getBlockTileEntity(x, y, z);
      return te instanceof TileEntityChest ? te : null;
    };
    const x = this.xCoord;
    const y = this.yCoord;
    const z = this.zCoord;
    this.adjacentChestXNeg = at(x - 1, y, z);
    this.adjacentChestXPos = at(x + 1, y, z);
    this.adjacentChestZNeg = at(x, y, z - 1);
    this.adjacentChestZPosition = at(x, y, z + 1);
    this.adjacentChestZNeg?.checkNeighbour(this, 0);
    this.adjacentChestZPosition?.checkNeighbour(this, 2);
    this.adjacentChestXPos?.checkNeighbour(this, 1);
    this.adjacentChestXNeg?.checkNeighbour(this, 3);
  }

  /** func_94044_a: a chest block of the same kind (normal or trapped) at (x, y, z). */
  private isSameChestType(x: number, y: number, z: number): boolean {
    const type = chestTypeOf(this.worldObj!.getBlockId(x, y, z));
    return type >= 0 && type === this.getChestType();
  }

  override updateEntity(): void {
    super.updateEntity();
    this.checkForAdjacentChests();
    this.ticksSinceSync++;
    const w = this.worldObj!;
    if (!w.isRemote && this.numUsingPlayers !== 0 && (this.ticksSinceSync + this.xCoord + this.yCoord + this.zCoord) % 200 === 0) {
      this.numUsingPlayers = 0;
      const r = 5;
      const box = AxisAlignedBB.getBoundingBox(f(this.xCoord - r), f(this.yCoord - r), f(this.zCoord - r), f(this.xCoord + 1 + r), f(this.yCoord + 1 + r), f(this.zCoord + 1 + r));
      for (const e of w.getEntitiesWithinAABBExcludingEntity(null, box)) {
        if (!e.isPlayerEntity) continue;
        const container = (e as unknown as EntityPlayer).openContainer as unknown as { getLowerChestInventory?: () => IInventory };
        const inv = container.getLowerChestInventory?.();
        if (inv && (inv === this || (inv instanceof InventoryLargeChest && inv.isPartOfLargeChest(this)))) this.numUsingPlayers++;
      }
    }
    this.prevLidAngle = this.lidAngle;
    const step = f(0.1);
    if (this.numUsingPlayers > 0 && this.lidAngle === 0 && this.adjacentChestZNeg === null && this.adjacentChestXNeg === null) {
      let sx = this.xCoord + 0.5;
      let sz = this.zCoord + 0.5;
      if (this.adjacentChestZPosition !== null) sz += 0.5;
      if (this.adjacentChestXPos !== null) sx += 0.5;
      w.playSoundEffect(sx, this.yCoord + 0.5, sz, 'random.chestopen', 0.5, w.rand.nextFloat() * 0.1 + 0.9);
    }
    if ((this.numUsingPlayers === 0 && this.lidAngle > 0) || (this.numUsingPlayers > 0 && this.lidAngle < 1)) {
      const before = this.lidAngle;
      this.lidAngle = f(this.numUsingPlayers > 0 ? this.lidAngle + step : this.lidAngle - step);
      if (this.lidAngle > 1) this.lidAngle = 1;
      const half = 0.5;
      if (this.lidAngle < half && before >= half && this.adjacentChestZNeg === null && this.adjacentChestXNeg === null) {
        let sx = this.xCoord + 0.5;
        let sz = this.zCoord + 0.5;
        if (this.adjacentChestZPosition !== null) sz += 0.5;
        if (this.adjacentChestXPos !== null) sx += 0.5;
        w.playSoundEffect(sx, this.yCoord + 0.5, sz, 'random.chestclosed', 0.5, w.rand.nextFloat() * 0.1 + 0.9);
      }
      if (this.lidAngle < 0) this.lidAngle = 0;
    }
  }

  override receiveClientEvent(id: number, param: number): boolean {
    if (id === 1) {
      this.numUsingPlayers = param;
      return true;
    }
    return super.receiveClientEvent(id, param);
  }

  openChest(): void {
    if (this.numUsingPlayers < 0) this.numUsingPlayers = 0;
    this.numUsingPlayers++;
    this.notifyUsers();
  }

  closeChest(): void {
    const b = this.getBlockType();
    if (b && chestTypeOf(b.blockID) >= 0) {
      this.numUsingPlayers--;
      this.notifyUsers();
    }
  }

  /** Sends the user count as block event 1 and updates neighbours (trapped chests power them). */
  private notifyUsers(): void {
    const w = this.worldObj!;
    const id = this.getBlockType()?.blockID ?? BlockIds.chest;
    if (w.addBlockEvent) w.addBlockEvent(this.xCoord, this.yCoord, this.zCoord, id, 1, this.numUsingPlayers);
    else this.receiveClientEvent(1, this.numUsingPlayers);
    w.notifyBlocksOfNeighborChange(this.xCoord, this.yCoord, this.zCoord, id);
    w.notifyBlocksOfNeighborChange(this.xCoord, this.yCoord - 1, this.zCoord, id);
  }

  isStackValidForSlot(_slot: number, _stack: ItemStack): boolean {
    return true;
  }

  override invalidate(): void {
    super.invalidate();
    this.updateContainingBlockInfo();
    this.checkForAdjacentChests();
  }

  /** func_98041_l: 1 for a trapped chest, 0 otherwise. */
  getChestType(): number {
    if (this.cachedChestType === -1) {
      if (this.worldObj === null) return 0;
      const b: Block | null = this.getBlockType();
      const type = b ? chestTypeOf(b.blockID) : -1;
      if (type < 0) return 0;
      this.cachedChestType = type;
    }
    return this.cachedChestType;
  }
}

/** isOcelotBlockingChest: a sitting ocelot on top of the chest keeps it shut. */
export function isOcelotBlockingChest(w: IWorld, x: number, y: number, z: number): boolean {
  const box = AxisAlignedBB.getBoundingBox(x, y + 1, z, x + 1, y + 2, z + 1);
  for (const e of w.getEntitiesWithinAABBExcludingEntity(null, box)) {
    if (EntityList.getEntityString(e) !== 'Ozelot') continue;
    if ((e as unknown as { isSitting?: () => boolean }).isSitting?.()) return true;
  }
  return false;
}

/**
 * BlockChest.getInventory: the chest's inventory, joined with an adjacent chest of the same
 * block into a "container.chestDouble", or null when a solid block or a sitting ocelot sits on
 * top of either half.
 */
export function getChestInventory(w: IWorld, x: number, y: number, z: number): IInventory | null {
  const te = w.getBlockTileEntity(x, y, z);
  if (!(te instanceof TileEntityChest)) return null;
  const id = w.getBlockId(x, y, z);
  if (w.isBlockNormalCube(x, y + 1, z) || isOcelotBlockingChest(w, x, y, z)) return null;
  const blocked = (nx: number, nz: number) => w.getBlockId(nx, y, nz) === id && (w.isBlockNormalCube(nx, y + 1, nz) || isOcelotBlockingChest(w, nx, y, nz));
  if (blocked(x - 1, z) || blocked(x + 1, z) || blocked(x, z - 1) || blocked(x, z + 1)) return null;
  const chestAt = (nx: number, nz: number): IInventory | null => {
    const o = w.getBlockTileEntity(nx, y, nz);
    return o instanceof TileEntityChest ? o : null;
  };
  let inv: IInventory = te;
  const name = 'container.chestDouble';
  if (w.getBlockId(x - 1, y, z) === id) inv = new InventoryLargeChest(name, chestAt(x - 1, z), inv);
  if (w.getBlockId(x + 1, y, z) === id) inv = new InventoryLargeChest(name, inv, chestAt(x + 1, z));
  if (w.getBlockId(x, y, z - 1) === id) inv = new InventoryLargeChest(name, chestAt(x, z - 1), inv);
  if (w.getBlockId(x, y, z + 1) === id) inv = new InventoryLargeChest(name, inv, chestAt(x, z + 1));
  return inv;
}
