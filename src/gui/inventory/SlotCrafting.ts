import type { EntityPlayer } from '../../entity/EntityPlayer';
import { ItemStack } from '../../item/ItemStack';
import type { IInventory } from './IInventory';
import { Slot } from './Slot';
import { BlockIds, ItemIds } from '../../block/BlockIds';
import { AchievementIds } from '../../stats/StatIds';

/** What crafting an item earns (SlotCrafting.onCrafting). */
const CRAFTING_ACHIEVEMENTS = new Map<number, number>([
  [BlockIds.workbench, AchievementIds.buildWorkBench],
  [ItemIds.pickaxeWood, AchievementIds.buildPickaxe],
  [BlockIds.furnaceIdle, AchievementIds.buildFurnace],
  [ItemIds.hoeWood, AchievementIds.buildHoe],
  [ItemIds.bread, AchievementIds.makeBread],
  [ItemIds.cake, AchievementIds.bakeCake],
  [ItemIds.pickaxeStone, AchievementIds.buildBetterPickaxe],
  [ItemIds.swordWood, AchievementIds.buildSword],
  [BlockIds.enchantmentTable, AchievementIds.enchantments],
  [BlockIds.bookShelf, AchievementIds.bookcase],
]);

/** A crafting output slot (SlotCrafting): taking the result uses up one of each ingredient. */
export class SlotCrafting extends Slot {
  private amountCrafted = 0;

  constructor(
    private readonly thePlayer: EntityPlayer,
    private readonly craftMatrix: IInventory,
    result: IInventory,
    slotIndex: number,
    x: number,
    y: number,
  ) {
    super(result, slotIndex, x, y);
  }

  override isItemValid(_stack: ItemStack | null): boolean {
    return false;
  }

  override decrStackSize(n: number): ItemStack | null {
    const s = this.getStack();
    if (s) this.amountCrafted += Math.min(n, s.stackSize);
    return super.decrStackSize(n);
  }

  /** "Crafted" for the amount taken, and the crafting achievements (workbench, pickaxe, furnace...). */
  protected override onCrafting(stack: ItemStack, amount?: number): void {
    if (amount !== undefined) this.amountCrafted += amount;
    stack.onCrafting(this.thePlayer.worldObj, this.thePlayer, this.amountCrafted);
    this.amountCrafted = 0;
    const achievement = CRAFTING_ACHIEVEMENTS.get(stack.itemID);
    if (achievement !== undefined) this.thePlayer.addStat(achievement, 1);
  }

  override onPickupFromSlot(_player: EntityPlayer, stack: ItemStack | null): void {
    if (stack) this.onCrafting(stack);
    for (let i = 0; i < this.craftMatrix.getSizeInventory(); i++) {
      const s = this.craftMatrix.getStackInSlot(i);
      if (!s) continue;
      this.craftMatrix.decrStackSize(i, 1);
      const item = s.getItem();
      const container = item.getContainerItem();
      if (!container) continue;
      const leftover = new ItemStack(container);
      if (item.doesContainerItemLeaveCraftingGrid(s) && this.thePlayer.inventory.addItemStackToInventory(leftover)) continue;
      if (this.craftMatrix.getStackInSlot(i) === null) this.craftMatrix.setInventorySlotContents(i, leftover);
      else this.thePlayer.dropPlayerItem(leftover);
    }
  }
}
