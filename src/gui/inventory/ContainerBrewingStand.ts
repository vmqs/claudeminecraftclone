import { ItemIds } from '../../block/BlockIds';
import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { InventoryPlayer } from '../../entity/InventoryPlayer';
import { Item } from '../../item/Item';
import type { ItemStack } from '../../item/ItemStack';
import type { TileEntityBrewingStand } from '../../world/tileentity/TileEntityBrewingStand';
import { Container } from './Container';
import type { IInventory } from './IInventory';
import { addPlayerSlots } from './PlayerSlots';
import { Slot } from './Slot';
import { AchievementIds } from '../../stats/StatIds';

/** A bottle slot of the brewing stand (SlotBrewingStandPotion): one potion or glass bottle. */
export class SlotBrewingStandPotion extends Slot {
  override isItemValid(stack: ItemStack): boolean {
    return SlotBrewingStandPotion.canHoldPotion(stack);
  }

  override getSlotStackLimit(): number {
    return 1;
  }

  /** Taking out a brewed potion (any but a water bottle) earns "Local Brewery". */
  override onPickupFromSlot(player: EntityPlayer, stack: ItemStack | null): void {
    if (stack && stack.itemID === ItemIds.potion && stack.getItemDamage() > 0) player.addStat(AchievementIds.potion, 1);
    super.onPickupFromSlot(player, stack);
  }

  static canHoldPotion(stack: ItemStack | null): boolean {
    return stack !== null && (stack.itemID === ItemIds.potion || stack.itemID === ItemIds.glassBottle);
  }
}

/** The ingredient slot (SlotBrewingStandIngredient): anything that is a potion ingredient. */
export class SlotBrewingStandIngredient extends Slot {
  override isItemValid(stack: ItemStack | null): boolean {
    return stack ? (Item.itemsList[stack.itemID]?.isPotionIngredient() ?? false) : false;
  }

  override getSlotStackLimit(): number {
    return 64;
  }
}

/** The brewing stand window (ContainerBrewingStand): three bottles, the ingredient, the player's slots. */
export class ContainerBrewingStand extends Container {
  private readonly ingredientSlot: Slot;

  constructor(
    inv: InventoryPlayer,
    readonly stand: TileEntityBrewingStand,
  ) {
    super();
    const s = stand as unknown as IInventory;
    this.addSlotToContainer(new SlotBrewingStandPotion(s, 0, 56, 46));
    this.addSlotToContainer(new SlotBrewingStandPotion(s, 1, 79, 53));
    this.addSlotToContainer(new SlotBrewingStandPotion(s, 2, 102, 46));
    this.ingredientSlot = this.addSlotToContainer(new SlotBrewingStandIngredient(s, 3, 79, 17));
    addPlayerSlots(this, inv, 84);
  }

  override updateProgressBar(id: number, value: number): void {
    if (id === 0) this.stand.setBrewTime(value);
  }

  canInteractWith(player: EntityPlayer): boolean {
    return this.stand.isUseableByPlayer(player);
  }

  override transferStackInSlot(player: EntityPlayer, index: number): ItemStack | null {
    const slot = this.inventorySlots[index];
    if (!slot || !slot.getHasStack()) return null;
    const stack = slot.getStack()!;
    const before = stack.copy();
    if ((index < 0 || index > 2) && index !== 3) {
      if (!this.ingredientSlot.getHasStack() && this.ingredientSlot.isItemValid(stack)) {
        if (!this.mergeItemStack(stack, 3, 4, false)) return null;
      } else if (SlotBrewingStandPotion.canHoldPotion(before)) {
        if (!this.mergeItemStack(stack, 0, 3, false)) return null;
      } else if (index >= 4 && index < 31) {
        if (!this.mergeItemStack(stack, 31, 40, false)) return null;
      } else if (index >= 31 && index < 40) {
        if (!this.mergeItemStack(stack, 4, 31, false)) return null;
      } else if (!this.mergeItemStack(stack, 4, 40, false)) {
        return null;
      }
    } else {
      if (!this.mergeItemStack(stack, 4, 40, true)) return null;
      slot.onSlotChange(stack, before);
    }
    if (stack.stackSize === 0) slot.putStack(null);
    else slot.onSlotChanged();
    if (stack.stackSize === before.stackSize) return null;
    slot.onPickupFromSlot(player, stack);
    return before;
  }
}
