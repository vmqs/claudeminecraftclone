import { BlockIds } from '../../block/BlockIds';
import type { EntityPlayer } from '../../entity/EntityPlayer';
import { InventoryBasic } from '../../gui/inventory/InventoryBasic';
import type { ItemStack, TagCompound } from '../../item/ItemStack';
import { isUseableByPlayerAt, readItemsFromNBT, writeItemsToNBT } from './InventoryNBT';
import { TileEntity } from './TileEntity';

const f = Math.fround;

/** An ender chest (TileEntityEnderChest): only the lid animation; the items belong to the player. */
export class TileEntityEnderChest extends TileEntity {
  lidAngle = 0;
  prevLidAngle = 0;
  numUsingPlayers = 0;
  private ticksSinceSync = 0;

  override updateEntity(): void {
    super.updateEntity();
    const w = this.worldObj!;
    // The original's "% 20 * 4" parses as (n % 20) * 4: a resync every 20 ticks.
    if ((++this.ticksSinceSync % 20) * 4 === 0) this.sendUserCount();
    this.prevLidAngle = this.lidAngle;
    const step = f(0.1);
    if (this.numUsingPlayers > 0 && this.lidAngle === 0) {
      w.playSoundEffect(this.xCoord + 0.5, this.yCoord + 0.5, this.zCoord + 0.5, 'random.chestopen', 0.5, w.rand.nextFloat() * 0.1 + 0.9);
    }
    if ((this.numUsingPlayers === 0 && this.lidAngle > 0) || (this.numUsingPlayers > 0 && this.lidAngle < 1)) {
      const before = this.lidAngle;
      this.lidAngle = f(this.numUsingPlayers > 0 ? this.lidAngle + step : this.lidAngle - step);
      if (this.lidAngle > 1) this.lidAngle = 1;
      if (this.lidAngle < 0.5 && before >= 0.5) {
        w.playSoundEffect(this.xCoord + 0.5, this.yCoord + 0.5, this.zCoord + 0.5, 'random.chestclosed', 0.5, w.rand.nextFloat() * 0.1 + 0.9);
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

  override invalidate(): void {
    this.updateContainingBlockInfo();
    super.invalidate();
  }

  openChest(): void {
    this.numUsingPlayers++;
    this.sendUserCount();
  }

  closeChest(): void {
    this.numUsingPlayers--;
    this.sendUserCount();
  }

  private sendUserCount(): void {
    const w = this.worldObj!;
    if (w.addBlockEvent) w.addBlockEvent(this.xCoord, this.yCoord, this.zCoord, BlockIds.enderChest, 1, this.numUsingPlayers);
    else this.receiveClientEvent(1, this.numUsingPlayers);
  }

  isUseableByPlayer(player: EntityPlayer): boolean {
    return isUseableByPlayerAt(this, player);
  }
}

/** The 27 ender chest slots every player carries (InventoryEnderChest). */
export class InventoryEnderChest extends InventoryBasic {
  private associatedChest: TileEntityEnderChest | null = null;
  private static readonly byPlayer = new WeakMap<object, InventoryEnderChest>();

  constructor() {
    super('container.enderchest', false, 27);
  }

  /**
   * The player's ender inventory (EntityPlayer.getInventoryEnderChest). Uses the player's own
   * method when the entity code provides one, otherwise one inventory per player object.
   */
  static forPlayer(player: EntityPlayer): InventoryEnderChest {
    const own = (player as unknown as { getInventoryEnderChest?: () => InventoryEnderChest }).getInventoryEnderChest;
    if (typeof own === 'function') return own.call(player);
    let inv = InventoryEnderChest.byPlayer.get(player);
    if (!inv) InventoryEnderChest.byPlayer.set(player, (inv = new InventoryEnderChest()));
    return inv;
  }

  setAssociatedChest(chest: TileEntityEnderChest | null): void {
    this.associatedChest = chest;
  }

  /** "EnderItems" list (slot bytes read as 0..255). */
  loadInventoryFromNBT(list: TagCompound[]): void {
    for (let i = 0; i < this.getSizeInventory(); i++) this.setInventorySlotContents(i, null);
    const stacks = readItemsFromNBT({ Items: list }, this.getSizeInventory(), true);
    stacks.forEach((s, i) => s && this.setInventorySlotContents(i, s));
  }

  saveInventoryToNBT(): TagCompound[] {
    const stacks: (ItemStack | null)[] = [];
    for (let i = 0; i < this.getSizeInventory(); i++) stacks.push(this.getStackInSlot(i));
    const tag: TagCompound = {};
    writeItemsToNBT(tag, stacks);
    return tag.Items as TagCompound[];
  }

  override isUseableByPlayer(player: EntityPlayer): boolean {
    return this.associatedChest !== null && !this.associatedChest.isUseableByPlayer(player) ? false : super.isUseableByPlayer(player);
  }

  override openChest(): void {
    this.associatedChest?.openChest();
    super.openChest();
  }

  override closeChest(): void {
    this.associatedChest?.closeChest();
    super.closeChest();
    this.associatedChest = null;
  }

  override isStackValidForSlot(_slot: number, _stack: ItemStack): boolean {
    return true;
  }
}
