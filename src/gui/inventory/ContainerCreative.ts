import type { EntityPlayer } from '../../entity/EntityPlayer';
import { InventoryPlayer } from '../../entity/InventoryPlayer';
import type { ItemStack } from '../../item/ItemStack';
import { Container } from './Container';
import { InventoryBasic } from './InventoryBasic';
import { Slot } from './Slot';

/** The 45 cells of the creative item grid, shared by every creative window (GuiContainerCreative.inventory). */
export const creativeGridInventory = new InventoryBasic('tmp', true, 45);

/**
 * The creative inventory window (ContainerCreative): a 9x5 grid showing a scrolled window of
 * `itemList`, and the player's hotbar below it.
 */
export class ContainerCreative extends Container {
  readonly itemList: ItemStack[] = [];

  constructor(player: EntityPlayer) {
    super();
    const inv = player.inventory;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 9; col++) this.addSlotToContainer(new Slot(creativeGridInventory, row * 9 + col, 9 + col * 18, 18 + row * 18));
    }
    for (let col = 0; col < 9; col++) this.addSlotToContainer(new Slot(inv, col, 9 + col * 18, 112));
    this.scrollTo(0);
  }

  canInteractWith(_player: EntityPlayer): boolean {
    return true;
  }

  /** Shows the rows starting at `scroll` (0..1) of the item list in the grid. */
  scrollTo(scroll: number): void {
    const rows = Math.trunc(this.itemList.length / 9) - 5 + 1;
    let first = Math.trunc(Math.fround(scroll * rows) + 0.5);
    if (first < 0) first = 0;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 9; col++) {
        const i = col + (row + first) * 9;
        creativeGridInventory.setInventorySlotContents(col + row * 9, i >= 0 && i < this.itemList.length ? this.itemList[i] : null);
      }
    }
  }

  hasMoreThan1PageOfItemsInList(): boolean {
    return this.itemList.length > 45;
  }

  protected override retrySlotClick(): void {}

  /** Shift-click on a hotbar slot clears it; the grid is handled by the screen. */
  override transferStackInSlot(_player: EntityPlayer, index: number): ItemStack | null {
    if (index >= this.inventorySlots.length - 9 && index < this.inventorySlots.length) {
      const slot = this.inventorySlots[index];
      if (slot && slot.getHasStack()) slot.putStack(null);
    }
    return null;
  }

  /** Double-click collecting only takes from the lower rows (hotbar and survival slots). */
  override canMergeSlot(_stack: ItemStack | null, slot: Slot): boolean {
    return slot.yDisplayPosition > 90;
  }

  override canDragIntoSlot(slot: Slot): boolean {
    return slot.inventory instanceof InventoryPlayer || (slot.yDisplayPosition > 90 && slot.xDisplayPosition <= 162);
  }
}
