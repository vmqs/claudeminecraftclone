import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { InventoryPlayer } from '../../entity/InventoryPlayer';
import { CraftingManager } from '../../item/crafting/CraftingManager';
import type { ItemStack } from '../../item/ItemStack';
import { Container } from './Container';
import type { IInventory } from './IInventory';
import { InventoryCraftResult } from './InventoryCraftResult';
import { InventoryCrafting } from './InventoryCrafting';
import { Slot } from './Slot';
import { SlotArmor } from './SlotArmor';
import { SlotCrafting } from './SlotCrafting';

/**
 * The player's own inventory window (ContainerPlayer). Slot numbers: 0 crafting result,
 * 1-4 the 2x2 grid, 5-8 armour (helmet first), 9-35 main inventory, 36-44 hotbar.
 */
export class ContainerPlayer extends Container {
  readonly craftMatrix: InventoryCrafting;
  readonly craftResult: IInventory = new InventoryCraftResult();

  constructor(
    inv: InventoryPlayer,
    readonly isLocalWorld: boolean,
    private readonly thePlayer: EntityPlayer,
  ) {
    super();
    this.craftMatrix = new InventoryCrafting(this, 2, 2);
    this.addSlotToContainer(new SlotCrafting(inv.player, this.craftMatrix, this.craftResult, 0, 144, 36));
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) this.addSlotToContainer(new Slot(this.craftMatrix, col + row * 2, 88 + col * 18, 26 + row * 18));
    }
    for (let i = 0; i < 4; i++) this.addSlotToContainer(new SlotArmor(inv, inv.getSizeInventory() - 1 - i, 8, 8 + i * 18, i));
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 9; col++) this.addSlotToContainer(new Slot(inv, col + (row + 1) * 9, 8 + col * 18, 84 + row * 18));
    }
    for (let col = 0; col < 9; col++) this.addSlotToContainer(new Slot(inv, col, 8 + col * 18, 142));
    this.onCraftMatrixChanged(this.craftMatrix);
  }

  override onCraftMatrixChanged(_inv: IInventory): void {
    this.craftResult.setInventorySlotContents(0, CraftingManager.getInstance().findMatchingRecipe(this.craftMatrix, this.thePlayer.worldObj));
  }

  override onCraftGuiClosed(player: EntityPlayer): void {
    super.onCraftGuiClosed(player);
    for (let i = 0; i < 4; i++) {
      const s = this.craftMatrix.getStackInSlotOnClosing(i);
      if (s) player.dropPlayerItem(s);
    }
    this.craftResult.setInventorySlotContents(0, null);
  }

  canInteractWith(_player: EntityPlayer): boolean {
    return true;
  }

  override transferStackInSlot(player: EntityPlayer, index: number): ItemStack | null {
    const slot = this.inventorySlots[index];
    if (!slot || !slot.getHasStack()) return null;
    const stack = slot.getStack()!;
    const before = stack.copy();
    const armor = before.getItem().getArmorInfo();
    let moved: boolean;
    if (index === 0) {
      moved = this.mergeItemStack(stack, 9, 45, true);
      if (moved) slot.onSlotChange(stack, before);
    } else if (index < 9) {
      moved = this.mergeItemStack(stack, 9, 45, false);
    } else if (armor && !this.inventorySlots[5 + armor.armorType].getHasStack()) {
      moved = this.mergeItemStack(stack, 5 + armor.armorType, 6 + armor.armorType, false);
    } else if (index < 36) {
      moved = this.mergeItemStack(stack, 36, 45, false);
    } else if (index < 45) {
      moved = this.mergeItemStack(stack, 9, 36, false);
    } else {
      moved = this.mergeItemStack(stack, 9, 45, false);
    }
    if (!moved) return null;
    if (stack.stackSize === 0) slot.putStack(null);
    else slot.onSlotChanged();
    if (stack.stackSize === before.stackSize) return null;
    slot.onPickupFromSlot(player, stack);
    return before;
  }

  override canMergeSlot(stack: ItemStack | null, slot: Slot): boolean {
    return slot.inventory !== this.craftResult && super.canMergeSlot(stack, slot);
  }
}
