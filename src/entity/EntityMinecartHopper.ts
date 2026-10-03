import { Block } from '../block/Block';
import { BlockIds } from '../block/BlockIds';
import type { World } from '../world/World';
import type { DamageSource } from './DamageSource';
import { EntityList } from './EntityList';
import { EntityMinecart } from './EntityMinecart';
import { EntityMinecartContainer } from './EntityMinecartContainer';
import type { EntityPlayer } from './EntityPlayer';
import { type HopperLike, HopperTransfer } from './HopperTransfer';
import type { TagCompound } from '../item/ItemStack';
import { NBT } from '../world/storage/NBT';

/**
 * A hopper minecart (EntityMinecartHopper, "MinecartHopper"): 5 slots, every 4 ticks pulls an
 * item from the inventory above or picks up items it rolls over; a powered activator rail
 * would lock it (never, without redstone).
 */
export class EntityMinecartHopper extends EntityMinecartContainer implements HopperLike {
  private isBlocked = true;
  private transferTicker = -1;

  constructor(world: World, x?: number, y?: number, z?: number) {
    super(world, x, y, z);
  }

  getMinecartType(): number {
    return 5;
  }

  override getDefaultDisplayTile(): Block | null {
    return Block.blocksList[BlockIds.hopperBlock];
  }

  override getDefaultDisplayTileOffset(): number {
    return 1;
  }

  getSizeInventory(): number {
    return 5;
  }

  override interact(player: EntityPlayer): boolean {
    player.displayGUIHopperMinecart(this);
    return true;
  }

  override onActivatorRailPass(_x: number, _y: number, _z: number, powered: boolean): void {
    const unlocked = !powered;
    if (unlocked !== this.getBlocked()) this.setBlocked(unlocked);
  }

  getBlocked(): boolean {
    return this.isBlocked;
  }

  setBlocked(v: boolean): void {
    this.isBlocked = v;
  }

  getWorldObj(): World {
    return this.worldObj;
  }

  getXPos(): number {
    return this.posX;
  }

  getYPos(): number {
    return this.posY;
  }

  getZPos(): number {
    return this.posZ;
  }

  override onUpdate(): void {
    super.onUpdate();
    if (!this.isEntityAlive() || !this.getBlocked()) return;
    this.transferTicker--;
    if (this.canTransfer()) return;
    this.setTransferTicker(0);
    if (this.pullItems()) {
      this.setTransferTicker(4);
      this.onInventoryChanged();
    }
  }

  /** func_96112_aD: from the inventory above, else the first item lying on the cart. */
  private pullItems(): boolean {
    if (HopperTransfer.suckItemsIntoHopper(this)) return true;
    const items = this.worldObj.getEntitiesWithinAABBExcludingEntity(null, this.boundingBox.expand(0.25, 0, 0.25), (e) => e.isEntityAlive() && EntityList.getEntityString(e) === 'Item');
    if (items.length > 0) HopperTransfer.insertEntityItem(this, items[0]);
    return false;
  }

  override killMinecart(src: DamageSource): void {
    super.killMinecart(src);
    this.dropItemWithOffset(BlockIds.hopperBlock, 1, 0);
  }

  setTransferTicker(v: number): void {
    this.transferTicker = v;
  }

  canTransfer(): boolean {
    return this.transferTicker > 0;
  }

  override writeEntityToNBT(tag: TagCompound): void {
    super.writeEntityToNBT(tag);
    NBT.setInteger(tag, 'TransferCooldown', this.transferTicker);
  }

  override readEntityFromNBT(tag: TagCompound): void {
    super.readEntityFromNBT(tag);
    this.transferTicker = NBT.getInteger(tag, 'TransferCooldown');
  }
}

EntityMinecart.minecartTypes.set(5, EntityMinecartHopper);
