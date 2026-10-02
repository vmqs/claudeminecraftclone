import type { Block } from '../block/Block';
import type { IInventory } from '../gui/inventory/IInventory';
import { Item } from '../item/Item';
import { ItemStack } from '../item/ItemStack';
import type { Entity } from './Entity';
import type { EntityPlayer } from './EntityPlayer';

/** The player's 36 main slots (0-8 = hotbar) plus 4 armour slots. */
export class InventoryPlayer implements IInventory {
  mainInventory: (ItemStack | null)[] = new Array(36).fill(null);
  armorInventory: (ItemStack | null)[] = new Array(4).fill(null);
  currentItem = 0;
  private currentItemStack: ItemStack | null = null;
  /** Stack held by the mouse cursor in container screens. */
  private itemStack: ItemStack | null = null;
  inventoryChanged = false;

  constructor(readonly player: EntityPlayer) {}

  getCurrentItem(): ItemStack | null {
    return this.currentItem < 9 && this.currentItem >= 0 ? this.mainInventory[this.currentItem] : null;
  }

  static getHotbarSize(): number {
    return 9;
  }

  private getInventorySlotContainItem(id: number): number {
    for (let i = 0; i < this.mainInventory.length; i++) if (this.mainInventory[i]?.itemID === id) return i;
    return -1;
  }

  private getInventorySlotContainItemAndDamage(id: number, damage: number): number {
    for (let i = 0; i < this.mainInventory.length; i++) {
      const s = this.mainInventory[i];
      if (s && s.itemID === id && s.getItemDamage() === damage) return i;
    }
    return -1;
  }

  private storeItemStack(stack: ItemStack): number {
    for (let i = 0; i < this.mainInventory.length; i++) {
      const s = this.mainInventory[i];
      if (
        s &&
        s.itemID === stack.itemID &&
        s.isStackable() &&
        s.stackSize < s.getMaxStackSize() &&
        s.stackSize < this.getInventoryStackLimit() &&
        (!s.getHasSubtypes() || s.getItemDamage() === stack.getItemDamage()) &&
        ItemStack.areItemStackTagsEqual(s, stack)
      )
        return i;
    }
    return -1;
  }

  getFirstEmptyStack(): number {
    for (let i = 0; i < this.mainInventory.length; i++) if (!this.mainInventory[i]) return i;
    return -1;
  }

  /** Pick-block: select a hotbar slot holding the item, or put it in the current slot (creative). */
  setCurrentItem(id: number, damage: number, matchDamage: boolean, creative: boolean): void {
    this.currentItemStack = this.getCurrentItem();
    const slot = matchDamage ? this.getInventorySlotContainItemAndDamage(id, damage) : this.getInventorySlotContainItem(id);
    if (slot >= 0 && slot < 9) {
      this.currentItem = slot;
    } else if (creative && id > 0) {
      const empty = this.getFirstEmptyStack();
      if (empty >= 0 && empty < 9) this.currentItem = empty;
      this.fillCreativeHotbarSlot(Item.itemsList[id], damage);
    }
  }

  /** Mouse wheel: one slot per notch, wrapping around the hotbar. */
  changeCurrentItem(dir: number): void {
    if (dir > 0) dir = 1;
    if (dir < 0) dir = -1;
    this.currentItem -= dir;
    while (this.currentItem < 0) this.currentItem += 9;
    while (this.currentItem >= 9) this.currentItem -= 9;
  }

  clearInventory(id: number, damage: number): number {
    let n = 0;
    for (const arr of [this.mainInventory, this.armorInventory]) {
      for (let i = 0; i < arr.length; i++) {
        const s = arr[i];
        if (s && (id <= -1 || s.itemID === id) && (damage <= -1 || s.getItemDamage() === damage)) {
          n += s.stackSize;
          arr[i] = null;
        }
      }
    }
    return n;
  }

  fillCreativeHotbarSlot(item: Item | null, damage: number): void {
    if (!item) return;
    const slot = this.getInventorySlotContainItemAndDamage(item.itemID, damage);
    if (slot >= 0) this.mainInventory[slot] = this.mainInventory[this.currentItem];
    const cur = this.currentItemStack;
    if (cur && cur.isItemEnchantable() && this.getInventorySlotContainItemAndDamage(cur.itemID, cur.getItemDamageForDisplay()) === this.currentItem) return;
    this.mainInventory[this.currentItem] = new ItemStack(Item.itemsList[item.itemID]!, 1, damage);
  }

  private storePartialItemStack(stack: ItemStack): number {
    const id = stack.itemID;
    let n = stack.stackSize;
    if (stack.getMaxStackSize() === 1) {
      const e = this.getFirstEmptyStack();
      if (e < 0) return n;
      if (!this.mainInventory[e]) this.mainInventory[e] = ItemStack.copyItemStack(stack);
      return 0;
    }
    let slot = this.storeItemStack(stack);
    if (slot < 0) slot = this.getFirstEmptyStack();
    if (slot < 0) return n;
    let s = this.mainInventory[slot];
    if (!s) {
      s = this.mainInventory[slot] = new ItemStack(id, 0, stack.getItemDamage());
      if (stack.hasTagCompound()) s.setTagCompound(structuredClone(stack.getTagCompound()));
    }
    let add = n;
    if (add > s.getMaxStackSize() - s.stackSize) add = s.getMaxStackSize() - s.stackSize;
    if (add > this.getInventoryStackLimit() - s.stackSize) add = this.getInventoryStackLimit() - s.stackSize;
    if (add === 0) return n;
    n -= add;
    s.stackSize += add;
    s.animationsToGo = 5;
    return n;
  }

  decrementAnimations(): void {
    for (let i = 0; i < this.mainInventory.length; i++) {
      this.mainInventory[i]?.updateAnimation(this.player.worldObj, this.player, i, this.currentItem === i);
    }
  }

  consumeInventoryItem(id: number): boolean {
    const slot = this.getInventorySlotContainItem(id);
    if (slot < 0) return false;
    const s = this.mainInventory[slot]!;
    if (--s.stackSize <= 0) this.mainInventory[slot] = null;
    return true;
  }

  hasItem(id: number): boolean {
    return this.getInventorySlotContainItem(id) >= 0;
  }

  addItemStackToInventory(stack: ItemStack | null): boolean {
    if (!stack) return false;
    if (stack.isItemDamaged()) {
      const e = this.getFirstEmptyStack();
      if (e >= 0) {
        const c = ItemStack.copyItemStack(stack)!;
        c.animationsToGo = 5;
        this.mainInventory[e] = c;
        stack.stackSize = 0;
        return true;
      }
      if (this.player.capabilities.isCreativeMode) {
        stack.stackSize = 0;
        return true;
      }
      return false;
    }
    let before: number;
    do {
      before = stack.stackSize;
      stack.stackSize = this.storePartialItemStack(stack);
    } while (stack.stackSize > 0 && stack.stackSize < before);
    if (stack.stackSize === before && this.player.capabilities.isCreativeMode) {
      stack.stackSize = 0;
      return true;
    }
    return stack.stackSize < before;
  }

  private slotArray(i: number): [(ItemStack | null)[], number] {
    return i >= this.mainInventory.length ? [this.armorInventory, i - this.mainInventory.length] : [this.mainInventory, i];
  }

  decrStackSize(slot: number, n: number): ItemStack | null {
    const [arr, i] = this.slotArray(slot);
    const s = arr[i];
    if (!s) return null;
    if (s.stackSize <= n) {
      arr[i] = null;
      return s;
    }
    const split = s.splitStack(n);
    if (s.stackSize === 0) arr[i] = null;
    return split;
  }

  getStackInSlotOnClosing(slot: number): ItemStack | null {
    const [arr, i] = this.slotArray(slot);
    const s = arr[i];
    arr[i] = null;
    return s ?? null;
  }

  setInventorySlotContents(slot: number, stack: ItemStack | null): void {
    const [arr, i] = this.slotArray(slot);
    arr[i] = stack;
  }

  getStrVsBlock(b: Block): number {
    const s = this.mainInventory[this.currentItem];
    return s ? Math.fround(1 * s.getStrVsBlock(b)) : 1;
  }

  getSizeInventory(): number {
    return this.mainInventory.length + 4;
  }

  getStackInSlot(slot: number): ItemStack | null {
    const [arr, i] = this.slotArray(slot);
    return arr[i] ?? null;
  }

  getInvName(): string {
    return 'container.inventory';
  }

  isInvNameLocalized(): boolean {
    return false;
  }

  getInventoryStackLimit(): number {
    return 64;
  }

  openChest(): void {}

  closeChest(): void {}

  isStackValidForSlot(_slot: number, _stack: ItemStack): boolean {
    return true;
  }

  getDamageVsEntity(e: Entity): number {
    const s = this.getStackInSlot(this.currentItem);
    return s ? s.getDamageVsEntity(e) : 1;
  }

  canHarvestBlock(b: Block): boolean {
    if (b.blockMaterial.isToolNotRequired()) return true;
    const s = this.getStackInSlot(this.currentItem);
    return s ? s.canHarvestBlock(b) : false;
  }

  armorItemInSlot(slot: number): ItemStack | null {
    return this.armorInventory[slot];
  }

  getTotalArmorValue(): number {
    return 0;
  }

  onInventoryChanged(): void {
    this.inventoryChanged = true;
  }

  setItemStack(s: ItemStack | null): void {
    this.itemStack = s;
  }

  getItemStack(): ItemStack | null {
    return this.itemStack;
  }

  isUseableByPlayer(p: EntityPlayer): boolean {
    return !this.player.isDead && p.getDistanceSqToEntity(this.player) <= 64;
  }

  /** Drops everything, scattered (on death). */
  dropAllItems(): void {
    for (const arr of [this.mainInventory, this.armorInventory]) {
      for (let i = 0; i < arr.length; i++) {
        const s = arr[i];
        if (!s) continue;
        this.player.dropPlayerItemWithRandomChoice(s, true);
        arr[i] = null;
      }
    }
  }

  hasItemStack(stack: ItemStack): boolean {
    return [...this.mainInventory, ...this.armorInventory].some((s) => s !== null && s.isItemEqual(stack));
  }
}
