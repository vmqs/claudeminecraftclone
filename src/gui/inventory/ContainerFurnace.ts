import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { InventoryPlayer } from '../../entity/InventoryPlayer';
import { FurnaceRecipes } from '../../item/crafting/FurnaceRecipes';
import type { ItemStack } from '../../item/ItemStack';
import { TileEntityFurnace } from '../../world/tileentity/TileEntityFurnace';
import { Container } from './Container';
import { addPlayerSlots } from './PlayerSlots';
import { Slot } from './Slot';
import { SlotFurnace } from './SlotFurnace';

/** The furnace window (ContainerFurnace): input 0, fuel 1, output 2, then the player's 36 slots. */
export class ContainerFurnace extends Container {
  constructor(
    inv: InventoryPlayer,
    readonly furnace: TileEntityFurnace,
  ) {
    super();
    this.addSlotToContainer(new Slot(furnace, 0, 56, 17));
    this.addSlotToContainer(new Slot(furnace, 1, 56, 53));
    this.addSlotToContainer(new SlotFurnace(inv.player, furnace, 2, 116, 35));
    addPlayerSlots(this, inv, 84);
  }

  /** The progress values the server sent: 0 cook time, 1 burn time, 2 the fuel's full burn time. */
  override updateProgressBar(id: number, value: number): void {
    if (id === 0) this.furnace.furnaceCookTime = value;
    if (id === 1) this.furnace.furnaceBurnTime = value;
    if (id === 2) this.furnace.currentItemBurnTime = value;
  }

  canInteractWith(player: EntityPlayer): boolean {
    return this.furnace.isUseableByPlayer(player);
  }

  /** Shift-click: output to the inventory; smeltables to the input, fuel to the fuel slot; else between inventory and hotbar. */
  override transferStackInSlot(player: EntityPlayer, index: number): ItemStack | null {
    const slot = this.inventorySlots[index];
    if (!slot || !slot.getHasStack()) return null;
    const stack = slot.getStack()!;
    const before = stack.copy();
    if (index === 2) {
      if (!this.mergeItemStack(stack, 3, 39, true)) return null;
      slot.onSlotChange(stack, before);
    } else if (index !== 1 && index !== 0) {
      if (FurnaceRecipes.smelting().getSmeltingResult(stack.itemID) !== null) {
        if (!this.mergeItemStack(stack, 0, 1, false)) return null;
      } else if (TileEntityFurnace.isItemFuel(stack)) {
        if (!this.mergeItemStack(stack, 1, 2, false)) return null;
      } else if (index >= 3 && index < 30) {
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
}
