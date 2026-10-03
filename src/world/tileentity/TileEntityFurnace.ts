import { Block } from '../../block/Block';
import { BlockIds, ItemIds } from '../../block/BlockIds';
import { Material } from '../../block/Material';
import type { EntityPlayer } from '../../entity/EntityPlayer';
import { decrStackInArray, takeStackFromArray } from '../../gui/inventory/IInventory';
import { Item } from '../../item/Item';
import { ItemStack, type TagCompound } from '../../item/ItemStack';
import type { ISidedInventory } from './ISidedInventory';
import { isUseableByPlayerAt, nbt, readItemsFromNBT, writeItemsToNBT } from './InventoryNBT';
import { TileEntity } from './TileEntity';
import { NBT } from '../storage/NBT';

/** Swaps the furnace block between lit and unlit (BlockFurnace.updateFurnaceBlockState), set by BlockFurnace. */
export type FurnaceStateUpdater = (burning: boolean, te: TileEntityFurnace) => void;

const SLOTS_TOP = [0] as const;
const SLOTS_BOTTOM = [2, 1] as const;
const SLOTS_SIDES = [1] as const;

/**
 * A furnace (TileEntityFurnace): slot 0 input, 1 fuel, 2 output; burn and cook timers.
 *
 * Smelting runs every tick like the original; the recipe table is plugged in through
 * {@link TileEntityFurnace.smeltingResult} (FurnaceRecipes.smelting().getSmeltingResult),
 * which the crafting code sets. Until then nothing smelts.
 */
export class TileEntityFurnace extends TileEntity implements ISidedInventory {
  /** FurnaceRecipes.smelting().getSmeltingResult(itemID): the result for an input item, or null. */
  static smeltingResult: ((itemId: number) => ItemStack | null) | null = null;
  /** BlockFurnace.updateFurnaceBlockState, installed by BlockFurnace. */
  static updateBlockState: FurnaceStateUpdater | null = null;

  private furnaceItemStacks: (ItemStack | null)[] = [null, null, null];
  furnaceBurnTime = 0;
  currentItemBurnTime = 0;
  furnaceCookTime = 0;
  private customName: string | null = null;

  getSizeInventory(): number {
    return this.furnaceItemStacks.length;
  }

  getStackInSlot(slot: number): ItemStack | null {
    return this.furnaceItemStacks[slot] ?? null;
  }

  decrStackSize(slot: number, n: number): ItemStack | null {
    return decrStackInArray(this.furnaceItemStacks, slot, n);
  }

  getStackInSlotOnClosing(slot: number): ItemStack | null {
    return takeStackFromArray(this.furnaceItemStacks, slot);
  }

  setInventorySlotContents(slot: number, stack: ItemStack | null): void {
    this.furnaceItemStacks[slot] = stack;
    if (stack && stack.stackSize > this.getInventoryStackLimit()) stack.stackSize = this.getInventoryStackLimit();
  }

  getInvName(): string {
    return this.isInvNameLocalized() ? this.customName! : 'container.furnace';
  }

  isInvNameLocalized(): boolean {
    return this.customName !== null && this.customName.length > 0;
  }

  /** func_94129_a */
  setGuiDisplayName(name: string): void {
    this.customName = name;
  }

  override readFromNBT(tag: TagCompound): void {
    super.readFromNBT(tag);
    this.furnaceItemStacks = readItemsFromNBT(tag, 3, false);
    this.furnaceBurnTime = nbt.getShort(tag, 'BurnTime');
    this.furnaceCookTime = nbt.getShort(tag, 'CookTime');
    this.currentItemBurnTime = TileEntityFurnace.getItemBurnTime(this.furnaceItemStacks[1]);
    if (nbt.hasKey(tag, 'CustomName')) this.customName = nbt.getString(tag, 'CustomName');
  }

  override writeToNBT(tag: TagCompound): void {
    super.writeToNBT(tag);
    NBT.setShort(tag, 'BurnTime', this.furnaceBurnTime);
    NBT.setShort(tag, 'CookTime', this.furnaceCookTime);
    writeItemsToNBT(tag, this.furnaceItemStacks);
    if (this.isInvNameLocalized()) tag.CustomName = this.customName;
  }

  getInventoryStackLimit(): number {
    return 64;
  }

  /** The arrow of the GUI (0..scale over the 200 cook ticks). */
  getCookProgressScaled(scale: number): number {
    return Math.trunc((this.furnaceCookTime * scale) / 200);
  }

  /** The flame of the GUI. */
  getBurnTimeRemainingScaled(scale: number): number {
    if (this.currentItemBurnTime === 0) this.currentItemBurnTime = 200;
    return Math.trunc((this.furnaceBurnTime * scale) / this.currentItemBurnTime);
  }

  isBurning(): boolean {
    return this.furnaceBurnTime > 0;
  }

  override updateEntity(): void {
    const wasBurning = this.furnaceBurnTime > 0;
    let changed = false;
    if (this.furnaceBurnTime > 0) this.furnaceBurnTime--;
    const w = this.worldObj!;
    if (!w.isRemote) {
      if (this.furnaceBurnTime === 0 && this.canSmelt()) {
        this.currentItemBurnTime = this.furnaceBurnTime = TileEntityFurnace.getItemBurnTime(this.furnaceItemStacks[1]);
        if (this.furnaceBurnTime > 0) {
          changed = true;
          const fuel = this.furnaceItemStacks[1];
          if (fuel) {
            fuel.stackSize--;
            if (fuel.stackSize === 0) {
              const container = fuel.getItem()?.getContainerItem() ?? null;
              this.furnaceItemStacks[1] = container ? new ItemStack(container.itemID, 1, 0) : null;
            }
          }
        }
      }
      if (this.isBurning() && this.canSmelt()) {
        this.furnaceCookTime++;
        if (this.furnaceCookTime === 200) {
          this.furnaceCookTime = 0;
          this.smeltItem();
          changed = true;
        }
      } else {
        this.furnaceCookTime = 0;
      }
      if (wasBurning !== this.furnaceBurnTime > 0) {
        changed = true;
        TileEntityFurnace.updateBlockState?.(this.furnaceBurnTime > 0, this);
      }
    }
    if (changed) this.onInventoryChanged();
  }

  private getResult(): ItemStack | null {
    const input = this.furnaceItemStacks[0];
    if (!input || !TileEntityFurnace.smeltingResult) return null;
    return TileEntityFurnace.smeltingResult(input.itemID);
  }

  private canSmelt(): boolean {
    if (!this.furnaceItemStacks[0]) return false;
    const result = this.getResult();
    if (!result) return false;
    const out = this.furnaceItemStacks[2];
    if (!out) return true;
    if (!out.isItemEqual(result)) return false;
    if (out.stackSize < this.getInventoryStackLimit() && out.stackSize < out.getMaxStackSize()) return true;
    return out.stackSize < result.getMaxStackSize();
  }

  smeltItem(): void {
    if (!this.canSmelt()) return;
    const result = this.getResult()!;
    const out = this.furnaceItemStacks[2];
    if (!out) this.furnaceItemStacks[2] = result.copy();
    else if (out.itemID === result.itemID) out.stackSize++;
    const input = this.furnaceItemStacks[0]!;
    input.stackSize--;
    if (input.stackSize <= 0) this.furnaceItemStacks[0] = null;
  }

  /** Ticks of burning a fuel item gives (0 = not a fuel). */
  static getItemBurnTime(stack: ItemStack | null): number {
    if (!stack) return 0;
    const id = stack.itemID;
    const item = Item.itemsList[id];
    if (id < 256 && Block.blocksList[id]) {
      const b = Block.blocksList[id]!;
      if (id === BlockIds.woodSingleSlab) return 150;
      if (b.blockMaterial === Material.wood) return 300;
    }
    // Wooden tools, swords and hoes (ItemTool/ItemSword getToolMaterialName, ItemHoe getMaterialName).
    const tool = item as unknown as { getToolMaterialName?: () => string; getMaterialName?: () => string } | null;
    if (tool?.getToolMaterialName?.() === 'WOOD' || tool?.getMaterialName?.() === 'WOOD') return 200;
    if (id === ItemIds.stick) return 100;
    if (id === ItemIds.coal) return 1600;
    if (id === ItemIds.bucketLava) return 20000;
    if (id === BlockIds.sapling) return 100;
    return id === ItemIds.blazeRod ? 2400 : 0;
  }

  static isItemFuel(stack: ItemStack): boolean {
    return TileEntityFurnace.getItemBurnTime(stack) > 0;
  }

  isUseableByPlayer(player: EntityPlayer): boolean {
    return isUseableByPlayerAt(this, player);
  }

  openChest(): void {}

  closeChest(): void {}

  isStackValidForSlot(slot: number, stack: ItemStack): boolean {
    if (slot === 2) return false;
    return slot === 1 ? TileEntityFurnace.isItemFuel(stack) : true;
  }

  getAccessibleSlotsFromSide(side: number): readonly number[] {
    if (side === 0) return SLOTS_BOTTOM;
    return side === 1 ? SLOTS_TOP : SLOTS_SIDES;
  }

  canInsertItem(slot: number, stack: ItemStack, _side: number): boolean {
    return this.isStackValidForSlot(slot, stack);
  }

  canExtractItem(slot: number, stack: ItemStack, side: number): boolean {
    return side !== 0 || slot !== 1 || stack.itemID === ItemIds.bucketEmpty;
  }
}
