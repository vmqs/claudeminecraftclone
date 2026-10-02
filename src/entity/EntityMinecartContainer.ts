import { Container } from '../gui/inventory/Container';
import { decrStackInArray, type IInventory, takeStackFromArray } from '../gui/inventory/IInventory';
import { ItemStack } from '../item/ItemStack';
import type { World } from '../world/World';
import type { DamageSource } from './DamageSource';
import { EntityItem } from './EntityItem';
import { EntityMinecart } from './EntityMinecart';
import type { EntityPlayer } from './EntityPlayer';

const f = Math.fround;

/**
 * A minecart with an inventory (EntityMinecartContainer: chest and hopper carts): spills its
 * contents when it dies, opens a chest window on right click, and rolls slower the fuller it is.
 */
export abstract class EntityMinecartContainer extends EntityMinecart implements IInventory {
  private readonly items: (ItemStack | null)[] = new Array(36).fill(null);
  private dropContentsWhenDead = true;

  constructor(world: World, x?: number, y?: number, z?: number) {
    super(world, x, y, z);
  }

  abstract getSizeInventory(): number;

  override killMinecart(src: DamageSource): void {
    super.killMinecart(src);
    this.spillContents();
  }

  /** Scatters every stack in random chunks of 10-30 items (also what setDead does). */
  private spillContents(): void {
    for (let i = 0; i < this.getSizeInventory(); i++) {
      const s = this.getStackInSlot(i);
      if (!s) continue;
      const ox = f(f(this.rand.nextFloat() * f(0.8)) + f(0.1));
      const oy = f(f(this.rand.nextFloat() * f(0.8)) + f(0.1));
      const oz = f(f(this.rand.nextFloat() * f(0.8)) + f(0.1));
      while (s.stackSize > 0) {
        let n = this.rand.nextInt(21) + 10;
        if (n > s.stackSize) n = s.stackSize;
        s.stackSize -= n;
        const part = new ItemStack(s.itemID, n, s.getItemDamage());
        if (s.hasTagCompound()) part.setTagCompound(structuredClone(s.getTagCompound()));
        const item = new EntityItem(this.worldObj, this.posX + ox, this.posY + oy, this.posZ + oz, part);
        const k = f(0.05);
        item.motionX = f(f(this.rand.nextGaussian()) * k);
        item.motionY = f(f(f(this.rand.nextGaussian()) * k) + f(0.2));
        item.motionZ = f(f(this.rand.nextGaussian()) * k);
        this.worldObj.spawnEntityInWorld(item);
      }
    }
  }

  getStackInSlot(slot: number): ItemStack | null {
    return this.items[slot] ?? null;
  }

  decrStackSize(slot: number, n: number): ItemStack | null {
    return decrStackInArray(this.items, slot, n);
  }

  getStackInSlotOnClosing(slot: number): ItemStack | null {
    return takeStackFromArray(this.items, slot);
  }

  setInventorySlotContents(slot: number, stack: ItemStack | null): void {
    this.items[slot] = stack;
    if (stack && stack.stackSize > this.getInventoryStackLimit()) stack.stackSize = this.getInventoryStackLimit();
  }

  onInventoryChanged(): void {}

  isUseableByPlayer(player: EntityPlayer): boolean {
    return !this.isDead && !(player.getDistanceSqToEntity(this) > 64);
  }

  openChest(): void {}

  closeChest(): void {}

  isStackValidForSlot(_slot: number, _stack: ItemStack): boolean {
    return true;
  }

  getInvName(): string {
    return this.isInvNameLocalized() ? this.getCustomName()! : 'container.minecart';
  }

  getInventoryStackLimit(): number {
    return 64;
  }

  override setDead(): void {
    if (this.dropContentsWhenDead) this.spillContents();
    super.setDead();
  }

  /** Descriptor data (mineshaft chest carts): "Items" as [{ Slot, id, Count, Damage }]. */
  readEntityFromNBT(tag: Record<string, unknown>): void {
    const items = tag['Items'];
    if (!Array.isArray(items)) return;
    this.items.fill(null);
    for (const it of items as { Slot?: number; id?: number; Count?: number; Damage?: number }[]) {
      const slot = (it.Slot ?? -1) & 255;
      if (slot >= 0 && slot < this.items.length && it.id) this.items[slot] = new ItemStack(it.id, it.Count ?? 1, it.Damage ?? 0);
    }
  }

  override interact(player: EntityPlayer): boolean {
    player.displayGUIChest(this);
    return true;
  }

  /** Fuller carts roll further: 0.98 + 0.001 per empty comparator level. */
  protected override applyDrag(): void {
    const empty = 15 - Container.calcRedstoneFromInventory(this);
    const k = f(f(0.98) + f(empty * f(0.001)));
    this.motionX *= k;
    this.motionY *= 0;
    this.motionZ *= k;
  }
}
