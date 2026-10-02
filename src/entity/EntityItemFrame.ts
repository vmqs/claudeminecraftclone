import { ItemIds } from '../block/BlockIds';
import { ItemStack } from '../item/ItemStack';
import type { World } from '../world/World';
import { EntityHanging } from './EntityHanging';
import type { EntityPlayer } from './EntityPlayer';

const f = Math.fround;

/**
 * An item frame (EntityItemFrame): 9x9 pixels on a wall. Right click puts the held item in
 * (Creative keeps the stack), clicking again turns it a quarter; it drops the frame and the
 * item when knocked off.
 */
export class EntityItemFrame extends EntityHanging {
  private itemDropChance = 1;
  /** DataWatcher 2 and 3. */
  private displayed: ItemStack | null = null;
  private itemRotation = 0;

  constructor(world: World);
  constructor(world: World, x: number, y: number, z: number, direction: number);
  constructor(world: World, x?: number, y?: number, z?: number, direction?: number) {
    super(world, x, y, z, direction);
    if (direction !== undefined) this.setDirection(direction);
  }

  getWidthPixels(): number {
    return 9;
  }

  getHeightPixels(): number {
    return 9;
  }

  override isInRangeToRenderDist(distSq: number): boolean {
    const d = 16 * 64 * this.renderDistanceWeight;
    return distSq < d * d;
  }

  dropItemStack(): void {
    this.entityDropItem(new ItemStack(ItemIds.itemFrame, 1, 0), 0);
    const s = this.getDisplayedItem();
    if (s && this.rand.nextFloat() < f(this.itemDropChance)) this.entityDropItem(s.copy(), 0);
  }

  getDisplayedItem(): ItemStack | null {
    return this.displayed;
  }

  setDisplayedItem(stack: ItemStack): void {
    const s = stack.copy();
    s.stackSize = 1;
    this.displayed = s;
  }

  getRotation(): number {
    return this.itemRotation;
  }

  setItemRotation(r: number): void {
    this.itemRotation = r % 4;
  }

  override interact(player: EntityPlayer): boolean {
    if (!this.getDisplayedItem()) {
      const held = player.getHeldItem();
      if (held) {
        this.setDisplayedItem(held);
        if (!player.capabilities.isCreativeMode && --held.stackSize <= 0) player.inventory.setInventorySlotContents(player.inventory.currentItem, null);
      }
    } else {
      this.setItemRotation(this.getRotation() + 1);
    }
    return true;
  }
}
