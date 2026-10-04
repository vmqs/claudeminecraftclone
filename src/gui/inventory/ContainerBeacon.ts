import { ItemIds } from '../../block/BlockIds';
import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { InventoryPlayer } from '../../entity/InventoryPlayer';
import type { ItemStack } from '../../item/ItemStack';
import type { TileEntityBeacon } from '../../world/tileentity/TileEntityBeacon';
import { Container } from './Container';
import type { IInventory } from './IInventory';
import { addPlayerSlots } from './PlayerSlots';
import { Slot } from './Slot';

/** The payment slot (SlotBeacon): one emerald, diamond, gold or iron ingot. */
class SlotBeacon extends Slot {
  override isItemValid(stack: ItemStack | null): boolean {
    if (!stack) return false;
    const id = stack.itemID;
    return id === ItemIds.emerald || id === ItemIds.diamond || id === ItemIds.ingotGold || id === ItemIds.ingotIron;
  }

  override getSlotStackLimit(): number {
    return 1;
  }
}

/** The beacon window (ContainerBeacon): the payment slot and the player's slots, 36 px from the left. */
export class ContainerBeacon extends Container {
  private readonly beaconSlot: Slot;

  constructor(
    inv: InventoryPlayer,
    private readonly theBeacon: TileEntityBeacon,
  ) {
    super();
    this.beaconSlot = this.addSlotToContainer(new SlotBeacon(theBeacon as unknown as IInventory, 0, 136, 110));
    addPlayerSlots(this, inv, 137, 36);
  }

  override updateProgressBar(id: number, value: number): void {
    if (id === 0) this.theBeacon.setLevels(value);
    if (id === 1) this.theBeacon.setPrimaryEffect(value);
    if (id === 2) this.theBeacon.setSecondaryEffect(value);
  }

  getBeacon(): TileEntityBeacon {
    return this.theBeacon;
  }

  canInteractWith(player: EntityPlayer): boolean {
    return this.theBeacon.isUseableByPlayer(player);
  }

  /**
   * The confirm button (the "MC|Beacon" payload): pays one item from the slot and sets both
   * effects (each checked against the pyramid levels by the beacon).
   */
  applyEffects(primary: number, secondary: number): void {
    const slot = this.getSlot(0);
    if (!slot.getHasStack()) return;
    slot.decrStackSize(1);
    this.theBeacon.setPrimaryEffect(primary);
    this.theBeacon.setSecondaryEffect(secondary);
    this.theBeacon.onInventoryChanged();
  }

  override transferStackInSlot(player: EntityPlayer, index: number): ItemStack | null {
    const slot = this.inventorySlots[index];
    if (!slot || !slot.getHasStack()) return null;
    const stack = slot.getStack()!;
    const before = stack.copy();
    if (index === 0) {
      if (!this.mergeItemStack(stack, 1, 37, true)) return null;
      slot.onSlotChange(stack, before);
    } else if (!this.beaconSlot.getHasStack() && this.beaconSlot.isItemValid(stack) && stack.stackSize === 1) {
      if (!this.mergeItemStack(stack, 0, 1, false)) return null;
    } else if (index >= 1 && index < 28) {
      if (!this.mergeItemStack(stack, 28, 37, false)) return null;
    } else if (index >= 28 && index < 37) {
      if (!this.mergeItemStack(stack, 1, 28, false)) return null;
    } else if (!this.mergeItemStack(stack, 1, 37, false)) {
      return null;
    }
    if (stack.stackSize === 0) slot.putStack(null);
    else slot.onSlotChanged();
    if (stack.stackSize === before.stackSize) return null;
    slot.onPickupFromSlot(player, stack);
    return before;
  }
}
