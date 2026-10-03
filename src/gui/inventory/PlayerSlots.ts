import type { InventoryPlayer } from '../../entity/InventoryPlayer';
import type { Container } from './Container';
import { Slot } from './Slot';

/** Opens Container.addSlotToContainer to the shared helper below. */
interface SlotAdder {
  addSlotToContainer(slot: Slot): Slot;
}

/**
 * The player's 27 main slots in three rows starting at `top`, then the hotbar 58 px below,
 * at x = 8 + 18 * column: the lower half every 176-wide container window shares.
 */
export function addPlayerSlots(container: Container, inv: InventoryPlayer, top: number, left = 8): void {
  const c = container as unknown as SlotAdder;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 9; col++) c.addSlotToContainer(new Slot(inv, col + row * 9 + 9, left + col * 18, top + row * 18));
  }
  for (let col = 0; col < 9; col++) c.addSlotToContainer(new Slot(inv, col, left + col * 18, top + 58));
}

/** The localized title of an inventory: its custom name, or its translated container key. */
export function inventoryTitle(inv: { isInvNameLocalized(): boolean; getInvName(): string }, translate: (key: string) => string): string {
  return inv.isInvNameLocalized() ? inv.getInvName() : translate(inv.getInvName());
}
