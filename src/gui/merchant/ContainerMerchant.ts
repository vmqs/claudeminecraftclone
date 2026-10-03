import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { InventoryPlayer } from '../../entity/InventoryPlayer';
import type { IMerchant } from '../../entity/merchant/IMerchant';
import type { ItemStack } from '../../item/ItemStack';
import type { World } from '../../world/World';
import { Container } from '../inventory/Container';
import type { IInventory } from '../inventory/IInventory';
import { Slot } from '../inventory/Slot';
import { InventoryMerchant } from './InventoryMerchant';
import { SlotMerchantResult } from './SlotMerchantResult';

/**
 * The trading window's slots (ContainerMerchant): payment at (36, 53) and (62, 53), the result
 * at (120, 53), then the player's inventory and hotbar. Closing it ends the trade and gives the
 * payment back.
 */
export class ContainerMerchant extends Container {
  private readonly merchantInventory: InventoryMerchant;

  constructor(
    playerInv: InventoryPlayer,
    private readonly theMerchant: IMerchant,
    private readonly theWorld: World,
  ) {
    super();
    this.merchantInventory = new InventoryMerchant(playerInv.player, theMerchant);
    this.addSlotToContainer(new Slot(this.merchantInventory, 0, 36, 53));
    this.addSlotToContainer(new Slot(this.merchantInventory, 1, 62, 53));
    this.addSlotToContainer(new SlotMerchantResult(playerInv.player, theMerchant, this.merchantInventory, 2, 120, 53));
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 9; col++) this.addSlotToContainer(new Slot(playerInv, col + row * 9 + 9, 8 + col * 18, 84 + row * 18));
    }
    for (let col = 0; col < 9; col++) this.addSlotToContainer(new Slot(playerInv, col, 8 + col * 18, 142));
  }

  getMerchantInventory(): InventoryMerchant {
    return this.merchantInventory;
  }

  override onCraftMatrixChanged(inv: IInventory): void {
    this.merchantInventory.resetRecipeAndSlots();
    super.onCraftMatrixChanged(inv);
  }

  /** The page shown in the window (MC|TrSel). */
  setCurrentRecipeIndex(i: number): void {
    this.merchantInventory.setCurrentRecipeIndex(i);
  }

  canInteractWith(player: EntityPlayer): boolean {
    return this.theMerchant.getCustomer() === player;
  }

  /** Shift-click: result to the inventory, payment to the inventory, inventory <-> hotbar. */
  override transferStackInSlot(player: EntityPlayer, index: number): ItemStack | null {
    const slot = this.inventorySlots[index];
    if (!slot || !slot.getHasStack()) return null;
    const stack = slot.getStack()!;
    const before = stack.copy();
    if (index === 2) {
      if (!this.mergeItemStack(stack, 3, 39, true)) return null;
      slot.onSlotChange(stack, before);
    } else if (index !== 0 && index !== 1) {
      if (index >= 3 && index < 30) {
        if (!this.mergeItemStack(stack, 30, 39, false)) return null;
      } else if (index >= 30 && index < 39 && !this.mergeItemStack(stack, 3, 30, false)) {
        return null;
      }
    } else if (!this.mergeItemStack(stack, 3, 39, false)) {
      return null;
    }
    if (stack.stackSize === 0) slot.putStack(null);
    else slot.onSlotChanged();
    if (stack.stackSize === before.stackSize) return null;
    slot.onPickupFromSlot(player, stack);
    return before;
  }

  override onCraftGuiClosed(player: EntityPlayer): void {
    super.onCraftGuiClosed(player);
    this.theMerchant.setCustomer(null);
    super.onCraftGuiClosed(player);
    if (this.theWorld.isRemote) return;
    let s = this.merchantInventory.getStackInSlotOnClosing(0);
    if (s) player.dropPlayerItem(s);
    s = this.merchantInventory.getStackInSlotOnClosing(1);
    if (s) player.dropPlayerItem(s);
  }
}
