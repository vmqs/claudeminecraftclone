import { BlockIds } from '../../block/BlockIds';
import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { InventoryPlayer } from '../../entity/InventoryPlayer';
import { CraftingManager } from '../../item/crafting/CraftingManager';
import type { ItemStack } from '../../item/ItemStack';
import type { World } from '../../world/World';
import { Container } from './Container';
import type { IInventory } from './IInventory';
import { InventoryCraftResult } from './InventoryCraftResult';
import { InventoryCrafting } from './InventoryCrafting';
import { Slot } from './Slot';
import { SlotCrafting } from './SlotCrafting';

/** The crafting table window (ContainerWorkbench): slot 0 result, 1-9 the grid, 10-45 the player. */
export class ContainerWorkbench extends Container {
  readonly craftMatrix: InventoryCrafting;
  readonly craftResult: IInventory = new InventoryCraftResult();

  constructor(
    inv: InventoryPlayer,
    private readonly worldObj: World,
    private readonly posX: number,
    private readonly posY: number,
    private readonly posZ: number,
  ) {
    super();
    this.craftMatrix = new InventoryCrafting(this, 3, 3);
    this.addSlotToContainer(new SlotCrafting(inv.player, this.craftMatrix, this.craftResult, 0, 124, 35));
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) this.addSlotToContainer(new Slot(this.craftMatrix, col + row * 3, 30 + col * 18, 17 + row * 18));
    }
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 9; col++) this.addSlotToContainer(new Slot(inv, col + row * 9 + 9, 8 + col * 18, 84 + row * 18));
    }
    for (let col = 0; col < 9; col++) this.addSlotToContainer(new Slot(inv, col, 8 + col * 18, 142));
    this.onCraftMatrixChanged(this.craftMatrix);
  }

  override onCraftMatrixChanged(_inv: IInventory): void {
    this.craftResult.setInventorySlotContents(0, CraftingManager.getInstance().findMatchingRecipe(this.craftMatrix, this.worldObj));
  }

  override onCraftGuiClosed(player: EntityPlayer): void {
    super.onCraftGuiClosed(player);
    if (this.worldObj.isRemote) return;
    for (let i = 0; i < 9; i++) {
      const s = this.craftMatrix.getStackInSlotOnClosing(i);
      if (s) player.dropPlayerItem(s);
    }
  }

  canInteractWith(player: EntityPlayer): boolean {
    if (this.worldObj.getBlockId(this.posX, this.posY, this.posZ) !== BlockIds.workbench) return false;
    return player.getDistanceSq(this.posX + 0.5, this.posY + 0.5, this.posZ + 0.5) <= 64;
  }

  override transferStackInSlot(player: EntityPlayer, index: number): ItemStack | null {
    const slot = this.inventorySlots[index];
    if (!slot || !slot.getHasStack()) return null;
    const stack = slot.getStack()!;
    const before = stack.copy();
    let moved: boolean;
    if (index === 0) {
      moved = this.mergeItemStack(stack, 10, 46, true);
      if (moved) slot.onSlotChange(stack, before);
    } else if (index >= 10 && index < 37) {
      moved = this.mergeItemStack(stack, 37, 46, false);
    } else if (index >= 37 && index < 46) {
      moved = this.mergeItemStack(stack, 10, 37, false);
    } else {
      moved = this.mergeItemStack(stack, 10, 46, false);
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
