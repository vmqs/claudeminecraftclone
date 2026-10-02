import { MathHelper } from '../../core/MathHelper';
import type { EntityPlayer } from '../../entity/EntityPlayer';
import { ItemStack } from '../../item/ItemStack';
import type { IInventory } from './IInventory';
import type { Slot } from './Slot';

/** slotClick modes (the third argument), as in 1.5.2. */
export const ClickMode = {
  /** Left/right click: take, put, swap or split. */
  PICKUP: 0,
  /** Shift-click: transferStackInSlot. */
  QUICK_MOVE: 1,
  /** Number key 1-9: swap with that hotbar slot (button = hotbar index). */
  SWAP: 2,
  /** Middle click in Creative: a full stack copy on the cursor. */
  CLONE: 3,
  /** Q over a slot: drop one (button 0) or the stack (button 1). */
  THROW: 4,
  /** Click-drag spreading (button = getDragData(event, mode)). */
  DRAG: 5,
  /** Double click: collect matching items onto the cursor. */
  PICKUP_ALL: 6,
} as const;

/** Slot number for clicks outside the window (drops the cursor stack). */
export const OUTSIDE_WINDOW = -999;

/**
 * A container window's slots and the click logic (Container): crafting tables, chests, the
 * player inventory. Subclasses add slots with addSlotToContainer and implement
 * canInteractWith and transferStackInSlot (shift-click).
 */
export abstract class Container {
  readonly inventoryItemStacks: (ItemStack | null)[] = [];
  readonly inventorySlots: Slot[] = [];
  windowId = 0;
  private transactionID = 0;
  /** field_94535_f: 0 = spread evenly (left drag), 1 = one each (right drag). */
  private dragMode = -1;
  /** field_94536_g: 0 = idle, 1 = collecting slots, 2 = finished. */
  private dragEvent = 0;
  /** field_94537_h */
  private readonly dragSlots = new Set<Slot>();

  protected addSlotToContainer(slot: Slot): Slot {
    slot.slotNumber = this.inventorySlots.length;
    this.inventorySlots.push(slot);
    this.inventoryItemStacks.push(null);
    return slot;
  }

  getInventory(): (ItemStack | null)[] {
    return this.inventorySlots.map((s) => s.getStack());
  }

  /** Remembers the current contents (the server sent changes to clients here). */
  detectAndSendChanges(): void {
    for (let i = 0; i < this.inventorySlots.length; i++) {
      const now = this.inventorySlots[i].getStack();
      if (!ItemStack.areItemStacksEqual(this.inventoryItemStacks[i], now)) this.inventoryItemStacks[i] = now ? now.copy() : null;
    }
  }

  enchantItem(_player: EntityPlayer, _button: number): boolean {
    return false;
  }

  getSlotFromInventory(inv: IInventory, index: number): Slot | null {
    return this.inventorySlots.find((s) => s.isSlotInInventory(inv, index)) ?? null;
  }

  getSlot(i: number): Slot {
    return this.inventorySlots[i];
  }

  /** Shift-click: move the slot's stack elsewhere; returns what was moved, or null when done. */
  transferStackInSlot(_player: EntityPlayer, index: number): ItemStack | null {
    const s = this.inventorySlots[index];
    return s ? s.getStack() : null;
  }

  /** Handles one click on slot `slotId` (or OUTSIDE_WINDOW) and returns the clicked stack's copy. */
  slotClick(slotId: number, button: number, mode: number, player: EntityPlayer): ItemStack | null {
    const inv = player.inventory;
    if (mode === ClickMode.DRAG) {
      this.handleDrag(slotId, button, player);
      return null;
    }
    if (this.dragEvent !== 0) {
      this.resetDrag();
      return null;
    }
    if ((mode === ClickMode.PICKUP || mode === ClickMode.QUICK_MOVE) && (button === 0 || button === 1)) {
      if (slotId === OUTSIDE_WINDOW) {
        const held = inv.getItemStack();
        if (held) {
          if (button === 0) {
            player.dropPlayerItem(held);
            inv.setItemStack(null);
          } else {
            player.dropPlayerItem(held.splitStack(1));
            if (held.stackSize === 0) inv.setItemStack(null);
          }
        }
        return null;
      }
      if (slotId < 0) return null;
      if (mode === ClickMode.QUICK_MOVE) return this.quickMove(slotId, button, player);
      return this.pickup(slotId, button, player);
    }
    if (mode === ClickMode.SWAP && button >= 0 && button < 9) {
      this.swapWithHotbar(slotId, button, player);
      return null;
    }
    if (mode === ClickMode.CLONE && player.capabilities.isCreativeMode && inv.getItemStack() === null && slotId >= 0) {
      const s = this.inventorySlots[slotId];
      if (s && s.getHasStack()) {
        const copy = s.getStack()!.copy();
        copy.stackSize = copy.getMaxStackSize();
        inv.setItemStack(copy);
      }
      return null;
    }
    if (mode === ClickMode.THROW && inv.getItemStack() === null && slotId >= 0) {
      const s = this.inventorySlots[slotId];
      if (s && s.getHasStack() && s.canTakeStack(player)) {
        const thrown = s.decrStackSize(button === 0 ? 1 : s.getStack()!.stackSize);
        s.onPickupFromSlot(player, thrown);
        player.dropPlayerItem(thrown);
      }
      return null;
    }
    if (mode === ClickMode.PICKUP_ALL && slotId >= 0) {
      this.collectToCursor(slotId, button, player);
      this.detectAndSendChanges();
    }
    return null;
  }

  private quickMove(slotId: number, button: number, player: EntityPlayer): ItemStack | null {
    const slot = this.inventorySlots[slotId];
    if (!slot || !slot.canTakeStack(player)) return null;
    const moved = this.transferStackInSlot(player, slotId);
    if (!moved) return null;
    const id = moved.itemID;
    const result = moved.copy();
    // Keep moving while the same item is left in the slot.
    if (slot.getStack()?.itemID === id) this.retrySlotClick(slotId, button, true, player);
    return result;
  }

  private pickup(slotId: number, button: number, player: EntityPlayer): ItemStack | null {
    const inv = player.inventory;
    const slot = this.inventorySlots[slotId];
    if (!slot) return null;
    let inSlot = slot.getStack();
    const held = inv.getItemStack();
    const result = inSlot ? inSlot.copy() : null;
    if (!inSlot) {
      // Put down all (left) or one (right).
      if (held && slot.isItemValid(held)) {
        const n = Math.min(button === 0 ? held.stackSize : 1, slot.getSlotStackLimit());
        slot.putStack(held.splitStack(n));
        if (held.stackSize === 0) inv.setItemStack(null);
      }
    } else if (slot.canTakeStack(player)) {
      if (!held) {
        // Pick up all (left) or half rounded up (right).
        const n = button === 0 ? inSlot.stackSize : Math.trunc((inSlot.stackSize + 1) / 2);
        inv.setItemStack(slot.decrStackSize(n));
        if (inSlot.stackSize === 0) slot.putStack(null);
        slot.onPickupFromSlot(player, inv.getItemStack());
      } else if (slot.isItemValid(held)) {
        if (inSlot.itemID === held.itemID && inSlot.getItemDamage() === held.getItemDamage() && ItemStack.areItemStackTagsEqual(inSlot, held)) {
          // Add all (left) or one (right) to the same item.
          let n = button === 0 ? held.stackSize : 1;
          n = Math.min(n, slot.getSlotStackLimit() - inSlot.stackSize, held.getMaxStackSize() - inSlot.stackSize);
          held.splitStack(n);
          if (held.stackSize === 0) inv.setItemStack(null);
          inSlot.stackSize += n;
        } else if (held.stackSize <= slot.getSlotStackLimit()) {
          slot.putStack(held);
          inv.setItemStack(inSlot);
        }
      } else if (
        inSlot.itemID === held.itemID &&
        held.getMaxStackSize() > 1 &&
        (!inSlot.getHasSubtypes() || inSlot.getItemDamage() === held.getItemDamage()) &&
        ItemStack.areItemStackTagsEqual(inSlot, held)
      ) {
        // Output slots (crafting result): take everything onto the cursor stack if it fits.
        const n = inSlot.stackSize;
        if (n > 0 && n + held.stackSize <= held.getMaxStackSize()) {
          held.stackSize += n;
          inSlot = slot.decrStackSize(n);
          if (inSlot && inSlot.stackSize === 0) slot.putStack(null);
          slot.onPickupFromSlot(player, inv.getItemStack());
        }
      }
    }
    slot.onSlotChanged();
    return result;
  }

  private swapWithHotbar(slotId: number, hotbar: number, player: EntityPlayer): void {
    const inv = player.inventory;
    const slot = this.inventorySlots[slotId];
    if (!slot.canTakeStack(player)) return;
    const hotbarStack = inv.getStackInSlot(hotbar);
    let canSwap = hotbarStack === null || (slot.inventory === inv && slot.isItemValid(hotbarStack));
    let freeSlot = -1;
    if (!canSwap) {
      freeSlot = inv.getFirstEmptyStack();
      canSwap = freeSlot > -1;
    }
    if (slot.getHasStack() && canSwap) {
      const taken = slot.getStack()!;
      inv.setInventorySlotContents(hotbar, taken.copy());
      if ((slot.inventory !== inv || !(hotbarStack && slot.isItemValid(hotbarStack))) && hotbarStack !== null) {
        if (freeSlot > -1) {
          inv.addItemStackToInventory(hotbarStack);
          slot.decrStackSize(taken.stackSize);
          slot.putStack(null);
          slot.onPickupFromSlot(player, taken);
        }
      } else {
        slot.decrStackSize(taken.stackSize);
        slot.putStack(hotbarStack);
        slot.onPickupFromSlot(player, taken);
      }
    } else if (!slot.getHasStack() && hotbarStack && slot.isItemValid(hotbarStack)) {
      inv.setInventorySlotContents(hotbar, null);
      slot.putStack(hotbarStack);
    }
  }

  /** Double click: gather matching items (non-full stacks first) up to a full cursor stack. */
  private collectToCursor(slotId: number, button: number, player: EntityPlayer): void {
    const clicked = this.inventorySlots[slotId];
    const held = player.inventory.getItemStack();
    if (!held || (clicked && clicked.getHasStack() && clicked.canTakeStack(player))) return;
    const start = button === 0 ? 0 : this.inventorySlots.length - 1;
    const step = button === 0 ? 1 : -1;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = start; i >= 0 && i < this.inventorySlots.length && held.stackSize < held.getMaxStackSize(); i += step) {
        const s = this.inventorySlots[i];
        const st = s.getStack();
        if (!st || !Container.canAddItemToSlot(s, held, true) || !s.canTakeStack(player) || !this.canMergeSlot(held, s)) continue;
        if (pass === 0 && st.stackSize === st.getMaxStackSize()) continue;
        const n = Math.min(held.getMaxStackSize() - held.stackSize, st.stackSize);
        const taken = s.decrStackSize(n)!;
        held.stackSize += n;
        if (taken.stackSize <= 0) s.putStack(null);
        s.onPickupFromSlot(player, taken);
      }
    }
  }

  /** Click-drag: start (mode 0/1), add slots, then spread the cursor stack over them. */
  private handleDrag(slotId: number, data: number, player: EntityPlayer): void {
    const inv = player.inventory;
    const previous = this.dragEvent;
    this.dragEvent = Container.getDragEvent(data);
    if ((previous !== 1 || this.dragEvent !== 2) && previous !== this.dragEvent) {
      this.resetDrag();
    } else if (inv.getItemStack() === null) {
      this.resetDrag();
    } else if (this.dragEvent === 0) {
      this.dragMode = Container.getDragMode(data);
      if (Container.isValidDragMode(this.dragMode)) {
        this.dragEvent = 1;
        this.dragSlots.clear();
      } else {
        this.resetDrag();
      }
    } else if (this.dragEvent === 1) {
      const s = this.inventorySlots[slotId];
      const held = inv.getItemStack()!;
      if (s && Container.canAddItemToSlot(s, held, true) && s.isItemValid(held) && held.stackSize > this.dragSlots.size && this.canDragIntoSlot(s)) this.dragSlots.add(s);
    } else if (this.dragEvent === 2) {
      if (this.dragSlots.size > 0) {
        const held = inv.getItemStack()!;
        const template = held.copy();
        let left = held.stackSize;
        for (const s of this.dragSlots) {
          if (!Container.canAddItemToSlot(s, held, true) || !s.isItemValid(held) || held.stackSize < this.dragSlots.size || !this.canDragIntoSlot(s)) continue;
          const put = template.copy();
          const existing = s.getHasStack() ? s.getStack()!.stackSize : 0;
          Container.computeStackSize(this.dragSlots, this.dragMode, put, existing);
          if (put.stackSize > put.getMaxStackSize()) put.stackSize = put.getMaxStackSize();
          if (put.stackSize > s.getSlotStackLimit()) put.stackSize = s.getSlotStackLimit();
          left -= put.stackSize - existing;
          s.putStack(put);
        }
        template.stackSize = left;
        inv.setItemStack(template.stackSize > 0 ? template : null);
      }
      this.resetDrag();
    } else {
      this.resetDrag();
    }
  }

  /** func_94530_a: whether double-click collecting may take from this slot. */
  canMergeSlot(_stack: ItemStack | null, _slot: Slot): boolean {
    return true;
  }

  protected retrySlotClick(slotId: number, button: number, _repeat: boolean, player: EntityPlayer): void {
    this.slotClick(slotId, button, ClickMode.QUICK_MOVE, player);
  }

  /** Closing the window drops the cursor stack. */
  onCraftGuiClosed(player: EntityPlayer): void {
    const inv = player.inventory;
    const held = inv.getItemStack();
    if (held) {
      player.dropPlayerItem(held);
      inv.setItemStack(null);
    }
  }

  onCraftMatrixChanged(_inv: IInventory): void {
    this.detectAndSendChanges();
  }

  putStackInSlot(i: number, stack: ItemStack | null): void {
    this.getSlot(i).putStack(stack);
  }

  putStacksInSlots(stacks: (ItemStack | null)[]): void {
    stacks.forEach((s, i) => this.getSlot(i).putStack(s));
  }

  /** Furnace/brewing progress bars (id, value). */
  updateProgressBar(_id: number, _value: number): void {}

  getNextTransactionID(): number {
    return ++this.transactionID;
  }

  abstract canInteractWith(player: EntityPlayer): boolean;

  /**
   * Moves a stack into slots [from, to) (backwards when `reverse`): first onto matching
   * stacks, then into the first empty slot. Returns whether anything moved.
   */
  protected mergeItemStack(stack: ItemStack, from: number, to: number, reverse: boolean): boolean {
    let moved = false;
    let i = reverse ? to - 1 : from;
    const inRange = () => (reverse ? i >= from : i < to);
    if (stack.isStackable()) {
      while (stack.stackSize > 0 && inRange()) {
        const slot = this.inventorySlots[i];
        const st = slot.getStack();
        if (st && st.itemID === stack.itemID && (!stack.getHasSubtypes() || stack.getItemDamage() === st.getItemDamage()) && ItemStack.areItemStackTagsEqual(stack, st)) {
          const sum = st.stackSize + stack.stackSize;
          if (sum <= stack.getMaxStackSize()) {
            stack.stackSize = 0;
            st.stackSize = sum;
            slot.onSlotChanged();
            moved = true;
          } else if (st.stackSize < stack.getMaxStackSize()) {
            stack.stackSize -= stack.getMaxStackSize() - st.stackSize;
            st.stackSize = stack.getMaxStackSize();
            slot.onSlotChanged();
            moved = true;
          }
        }
        i += reverse ? -1 : 1;
      }
    }
    if (stack.stackSize > 0) {
      i = reverse ? to - 1 : from;
      while (inRange()) {
        const slot = this.inventorySlots[i];
        if (!slot.getStack()) {
          slot.putStack(stack.copy());
          slot.onSlotChanged();
          stack.stackSize = 0;
          moved = true;
          break;
        }
        i += reverse ? -1 : 1;
      }
    }
    return moved;
  }

  /** func_94529_b */
  static getDragMode(data: number): number {
    return (data >> 2) & 3;
  }

  /** func_94532_c */
  static getDragEvent(data: number): number {
    return data & 3;
  }

  /** func_94534_d */
  static getDragData(event: number, mode: number): number {
    return (event & 3) | ((mode & 3) << 2);
  }

  /** func_94528_d */
  static isValidDragMode(mode: number): boolean {
    return mode === 0 || mode === 1;
  }

  /** func_94533_d */
  protected resetDrag(): void {
    this.dragEvent = 0;
    this.dragSlots.clear();
  }

  /** func_94527_a: the slot is empty, or holds the same item with room (ignoring the stack size). */
  static canAddItemToSlot(slot: Slot | null, stack: ItemStack | null, ignoreSize: boolean): boolean {
    let ok = !slot || !slot.getHasStack();
    if (slot && slot.getHasStack() && stack && stack.isItemEqual(slot.getStack()!) && ItemStack.areItemStackTagsEqual(slot.getStack(), stack)) {
      ok ||= slot.getStack()!.stackSize + (ignoreSize ? 0 : stack.stackSize) <= stack.getMaxStackSize();
    }
    return ok;
  }

  /** func_94525_a: the size a dragged stack leaves in one slot. */
  static computeStackSize(slots: Set<Slot>, mode: number, stack: ItemStack, existing: number): void {
    if (mode === 0) stack.stackSize = MathHelper.floor_float(stack.stackSize / slots.size);
    else if (mode === 1) stack.stackSize = 1;
    stack.stackSize += existing;
  }

  /** func_94531_b: whether dragging may include this slot (not crafting outputs). */
  canDragIntoSlot(_slot: Slot): boolean {
    return true;
  }

  /** Comparator signal of an inventory: 1 + 14 x fill ratio when not empty. */
  static calcRedstoneFromInventory(inv: IInventory | null): number {
    if (!inv) return 0;
    let used = 0;
    let fill = 0;
    for (let i = 0; i < inv.getSizeInventory(); i++) {
      const s = inv.getStackInSlot(i);
      if (!s) continue;
      fill = Math.fround(fill + Math.fround(s.stackSize / Math.min(inv.getInventoryStackLimit(), s.getMaxStackSize())));
      used++;
    }
    fill = Math.fround(fill / inv.getSizeInventory());
    return MathHelper.floor_float(Math.fround(fill * 14)) + (used > 0 ? 1 : 0);
  }
}
