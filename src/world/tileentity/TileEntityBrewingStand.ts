import { ItemIds } from '../../block/BlockIds';
import type { EntityPlayer } from '../../entity/EntityPlayer';
import { Item } from '../../item/Item';
import { ItemStack, type TagCompound } from '../../item/ItemStack';
import type { ISidedInventory } from './ISidedInventory';
import { isUseableByPlayerAt, nbt, readItemsFromNBT, writeItemsToNBT } from './InventoryNBT';
import { TileEntity } from './TileEntity';
import { NBT } from '../storage/NBT';

/**
 * Potion maths the brewing stand needs (PotionHelper.applyIngredient, ItemPotion.getEffects and
 * isSplash), installed by the potion code. Until then nothing brews.
 */
export interface BrewingRules {
  applyIngredient(damage: number, effect: string): number;
  /** The effect list of a potion damage (compared with JSON equality), or null. */
  getEffects(damage: number): unknown[] | null;
  isSplash(damage: number): boolean;
}

const SLOT_TOP = [3] as const;
const SLOTS_SIDES = [0, 1, 2] as const;

/** A brewing stand (TileEntityBrewingStand, savegame id "Cauldron"): 3 bottles and an ingredient. */
export class TileEntityBrewingStand extends TileEntity implements ISidedInventory {
  static brewingRules: BrewingRules | null = null;

  private brewingItemStacks: (ItemStack | null)[] = [null, null, null, null];
  private brewTime = 0;
  /** Bottle slots in use as bits, mirrored into the block metadata (the bottles drawn). */
  private filledSlots = 0;
  private ingredientID = 0;
  private customName: string | null = null;

  getInvName(): string {
    return this.isInvNameLocalized() ? this.customName! : 'container.brewing';
  }

  isInvNameLocalized(): boolean {
    return this.customName !== null && this.customName.length > 0;
  }

  /** func_94131_a */
  setGuiDisplayName(name: string): void {
    this.customName = name;
  }

  getSizeInventory(): number {
    return this.brewingItemStacks.length;
  }

  override updateEntity(): void {
    if (this.brewTime > 0) {
      this.brewTime--;
      if (this.brewTime === 0) {
        this.brewPotions();
        this.onInventoryChanged();
      } else if (!this.canBrew()) {
        this.brewTime = 0;
        this.onInventoryChanged();
      } else if (this.ingredientID !== this.brewingItemStacks[3]!.itemID) {
        this.brewTime = 0;
        this.onInventoryChanged();
      }
    } else if (this.canBrew()) {
      this.brewTime = 400;
      this.ingredientID = this.brewingItemStacks[3]!.itemID;
    }
    const filled = this.getFilledSlots();
    if (filled !== this.filledSlots) {
      this.filledSlots = filled;
      this.worldObj!.setBlockMetadataWithNotify(this.xCoord, this.yCoord, this.zCoord, filled, 2);
    }
    super.updateEntity();
  }

  getBrewTime(): number {
    return this.brewTime;
  }

  private static sameEffects(a: unknown[] | null, b: unknown[] | null): boolean {
    if (a === b) return true;
    return a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b);
  }

  private canBrew(): boolean {
    const rules = TileEntityBrewingStand.brewingRules;
    const ing = this.brewingItemStacks[3];
    if (!rules || !ing || ing.stackSize <= 0) return false;
    if (!Item.itemsList[ing.itemID]?.getPotionEffect()) return false;
    for (let i = 0; i < 3; i++) {
      const s = this.brewingItemStacks[i];
      if (!s || s.itemID !== ItemIds.potion) continue;
      const from = s.getItemDamage();
      const to = this.getPotionResult(from, ing);
      if (!rules.isSplash(from) && rules.isSplash(to)) return true;
      const a = rules.getEffects(from);
      const b = rules.getEffects(to);
      if ((from <= 0 || a !== b) && (a === null || (!TileEntityBrewingStand.sameEffects(a, b) && b !== null)) && from !== to) return true;
    }
    return false;
  }

  private brewPotions(): void {
    const rules = TileEntityBrewingStand.brewingRules;
    if (!rules || !this.canBrew()) return;
    const ing = this.brewingItemStacks[3]!;
    for (let i = 0; i < 3; i++) {
      const s = this.brewingItemStacks[i];
      if (!s || s.itemID !== ItemIds.potion) continue;
      const from = s.getItemDamage();
      const to = this.getPotionResult(from, ing);
      const a = rules.getEffects(from);
      const b = rules.getEffects(to);
      if ((from > 0 && a === b) || (a !== null && (TileEntityBrewingStand.sameEffects(a, b) || b === null))) {
        if (!rules.isSplash(from) && rules.isSplash(to)) s.setItemDamage(to);
      } else if (from !== to) {
        s.setItemDamage(to);
      }
    }
    const item = Item.itemsList[ing.itemID];
    const container = item?.getContainerItem() ?? null;
    if (item && item.hasContainerItem() && container) {
      this.brewingItemStacks[3] = new ItemStack(container.itemID, 1, 0);
    } else {
      ing.stackSize--;
      if (ing.stackSize <= 0) this.brewingItemStacks[3] = null;
    }
  }

  private getPotionResult(damage: number, ing: ItemStack | null): number {
    if (!ing) return damage;
    const effect = Item.itemsList[ing.itemID]?.getPotionEffect() ?? null;
    const rules = TileEntityBrewingStand.brewingRules;
    return effect && rules ? rules.applyIngredient(damage, effect) : damage;
  }

  override readFromNBT(tag: TagCompound): void {
    super.readFromNBT(tag);
    this.brewingItemStacks = readItemsFromNBT(tag, 4, false);
    this.brewTime = nbt.getShort(tag, 'BrewTime');
    if (nbt.hasKey(tag, 'CustomName')) this.customName = nbt.getString(tag, 'CustomName');
  }

  override writeToNBT(tag: TagCompound): void {
    super.writeToNBT(tag);
    NBT.setShort(tag, 'BrewTime', this.brewTime);
    writeItemsToNBT(tag, this.brewingItemStacks);
    if (this.isInvNameLocalized()) tag.CustomName = this.customName;
  }

  getStackInSlot(slot: number): ItemStack | null {
    return slot >= 0 && slot < this.brewingItemStacks.length ? this.brewingItemStacks[slot] : null;
  }

  /** The original hands over the whole stack whatever the count asked for. */
  decrStackSize(slot: number, _n: number): ItemStack | null {
    if (slot < 0 || slot >= this.brewingItemStacks.length) return null;
    const s = this.brewingItemStacks[slot];
    this.brewingItemStacks[slot] = null;
    return s;
  }

  getStackInSlotOnClosing(slot: number): ItemStack | null {
    return this.decrStackSize(slot, 0);
  }

  setInventorySlotContents(slot: number, stack: ItemStack | null): void {
    if (slot >= 0 && slot < this.brewingItemStacks.length) this.brewingItemStacks[slot] = stack;
  }

  getInventoryStackLimit(): number {
    return 64;
  }

  isUseableByPlayer(player: EntityPlayer): boolean {
    return isUseableByPlayerAt(this, player);
  }

  openChest(): void {}

  closeChest(): void {}

  isStackValidForSlot(slot: number, stack: ItemStack): boolean {
    if (slot === 3) return !!Item.itemsList[stack.itemID]?.getPotionEffect();
    return stack.itemID === ItemIds.potion || stack.itemID === ItemIds.glassBottle;
  }

  setBrewTime(t: number): void {
    this.brewTime = t;
  }

  getFilledSlots(): number {
    let bits = 0;
    for (let i = 0; i < 3; i++) if (this.brewingItemStacks[i]) bits |= 1 << i;
    return bits;
  }

  getAccessibleSlotsFromSide(side: number): readonly number[] {
    return side === 1 ? SLOT_TOP : SLOTS_SIDES;
  }

  canInsertItem(slot: number, stack: ItemStack, _side: number): boolean {
    return this.isStackValidForSlot(slot, stack);
  }

  canExtractItem(_slot: number, _stack: ItemStack, _side: number): boolean {
    return true;
  }
}
