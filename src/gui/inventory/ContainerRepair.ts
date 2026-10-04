import { BlockIds, ItemIds } from '../../block/BlockIds';
import { I18n } from '../../core/I18n';
import { Enchantment } from '../../enchantment/Enchantment';
import { EnchantmentHelper, getStoredEnchantments } from '../../enchantment/EnchantmentHelper';
import type { EntityPlayer } from '../../entity/EntityPlayer';
import type { InventoryPlayer } from '../../entity/InventoryPlayer';
import type { ItemStack } from '../../item/ItemStack';
import type { World } from '../../world/World';
import { Container } from './Container';
import type { IInventory } from './IInventory';
import { InventoryBasic } from './InventoryBasic';
import { InventoryCraftResult } from './InventoryCraftResult';
import { addPlayerSlots } from './PlayerSlots';
import { Slot } from './Slot';

/** What the anvil needs from the player's experience (absent until the survival code adds it). */
interface Leveled {
  experienceLevel?: number;
  addExperienceLevel?(levels: number): void;
}

/** The anvil's two inputs (InventoryRepair): any change recomputes the output. */
class InventoryRepair extends InventoryBasic {
  constructor(private readonly container: ContainerRepair) {
    super('Repair', true, 2);
  }

  override onInventoryChanged(): void {
    super.onInventoryChanged();
    this.container.onCraftMatrixChanged(this);
  }

  override isStackValidForSlot(): boolean {
    return true;
  }
}

/**
 * The anvil output (SlotRepair): takeable when affordable; taking it pays the levels, consumes
 * the inputs and may damage the anvil (12% outside Creative: chipped, damaged, then destroyed).
 */
class SlotRepair extends Slot {
  constructor(
    private readonly anvil: ContainerRepair,
    inv: IInventory,
    index: number,
    x: number,
    y: number,
  ) {
    super(inv, index, x, y);
  }

  override isItemValid(): boolean {
    return false;
  }

  override canTakeStack(player: EntityPlayer): boolean {
    const level = (player as EntityPlayer & Leveled).experienceLevel ?? 0;
    return (player.capabilities.isCreativeMode || level >= this.anvil.maximumCost) && this.anvil.maximumCost > 0 && this.getHasStack();
  }

  override onPickupFromSlot(player: EntityPlayer, _stack: ItemStack | null): void {
    const a = this.anvil;
    if (!player.capabilities.isCreativeMode) (player as EntityPlayer & Leveled).addExperienceLevel?.(-a.maximumCost);
    a.inputSlots.setInventorySlotContents(0, null);
    const used = a.stackSizeToBeUsedInRepair;
    const second = a.inputSlots.getStackInSlot(1);
    if (used > 0 && second && second.stackSize > used) {
      second.stackSize -= used;
      a.inputSlots.setInventorySlotContents(1, second);
    } else {
      a.inputSlots.setInventorySlotContents(1, null);
    }
    a.maximumCost = 0;
    const w = a.theWorld;
    const { x, y, z } = a.pos;
    const rand = (player as unknown as { rand: { nextFloat(): number } }).rand;
    if (!player.capabilities.isCreativeMode && !w.isRemote && w.getBlockId(x, y, z) === BlockIds.anvil && rand.nextFloat() < Math.fround(0.12)) {
      const meta = w.getBlockMetadata(x, y, z);
      const dir = meta & 3;
      const damage = (meta >> 2) + 1;
      if (damage > 2) {
        w.setBlockToAir(x, y, z);
        w.playAuxSFX(1020, x, y, z, 0);
      } else {
        w.setBlockMetadataWithNotify(x, y, z, dir | (damage << 2), 2);
        w.playAuxSFX(1021, x, y, z, 0);
      }
    } else if (!w.isRemote) {
      w.playAuxSFX(1021, x, y, z, 0);
    }
  }
}

/** Level cost per enchantment level by enchantment weight (1: 8, 2: 4, 5: 2, 10: 1, else 0). */
function weightCost(weight: number): number {
  switch (weight) {
    case 1:
      return 8;
    case 2:
      return 4;
    case 5:
      return 2;
    case 10:
      return 1;
    default:
      return 0;
  }
}

/**
 * The anvil window (ContainerRepair): repair with material or a second item, combine
 * enchantments (books included), rename; the level cost follows the 1.5.2 formula.
 */
export class ContainerRepair extends Container {
  readonly outputSlot: IInventory = new InventoryCraftResult();
  readonly inputSlots: IInventory;
  maximumCost = 0;
  stackSizeToBeUsedInRepair = 0;
  private repairedItemName: string | null = null;
  readonly pos: { x: number; y: number; z: number };

  constructor(
    inv: InventoryPlayer,
    readonly theWorld: World,
    x: number,
    y: number,
    z: number,
    private readonly thePlayer: EntityPlayer,
  ) {
    super();
    this.pos = { x, y, z };
    this.inputSlots = new InventoryRepair(this);
    this.addSlotToContainer(new Slot(this.inputSlots, 0, 27, 47));
    this.addSlotToContainer(new Slot(this.inputSlots, 1, 76, 47));
    this.addSlotToContainer(new SlotRepair(this, this.outputSlot, 2, 134, 47));
    addPlayerSlots(this, inv, 84);
  }

  override onCraftMatrixChanged(inv: IInventory): void {
    super.onCraftMatrixChanged(inv);
    if (inv === this.inputSlots) this.updateRepairOutput();
  }

  updateRepairOutput(): void {
    const first = this.inputSlots.getStackInSlot(0);
    this.maximumCost = 0;
    let cost = 0;
    let baseCost = 0;
    let renameCost = 0;
    if (!first) {
      this.outputSlot.setInventorySlotContents(0, null);
      this.maximumCost = 0;
      return;
    }
    let result: ItemStack | null = first.copy();
    const second = this.inputSlots.getStackInSlot(1);
    const enchants = EnchantmentHelper.getEnchantments(result);
    let isBook = false;
    baseCost += first.getRepairCost() + (second ? second.getRepairCost() : 0);
    this.stackSizeToBeUsedInRepair = 0;
    if (second) {
      isBook = second.itemID === ItemIds.enchantedBook && getStoredEnchantments(second).length > 0;
      if (result.isItemStackDamageable() && result.getItem().getIsRepairable(first, second)) {
        // Repair with the material: a quarter of the durability per item.
        let fix = Math.min(result.getItemDamageForDisplay(), Math.trunc(result.getMaxDamage() / 4));
        if (fix <= 0) {
          this.outputSlot.setInventorySlotContents(0, null);
          this.maximumCost = 0;
          return;
        }
        let n = 0;
        for (; fix > 0 && n < second.stackSize; n++) {
          result.setItemDamage(result.getItemDamageForDisplay() - fix);
          cost += Math.max(1, Math.trunc(fix / 100)) + enchants.size;
          fix = Math.min(result.getItemDamageForDisplay(), Math.trunc(result.getMaxDamage() / 4));
        }
        this.stackSizeToBeUsedInRepair = n;
      } else {
        if (!isBook && (result.itemID !== second.itemID || !result.isItemStackDamageable())) {
          this.outputSlot.setInventorySlotContents(0, null);
          this.maximumCost = 0;
          return;
        }
        if (result.isItemStackDamageable() && !isBook) {
          // Combine two damaged items: both durabilities plus a 12% bonus.
          const left = first.getMaxDamage() - first.getItemDamageForDisplay();
          const right = second.getMaxDamage() - second.getItemDamageForDisplay();
          const bonus = right + Math.trunc((result.getMaxDamage() * 12) / 100);
          let damage = result.getMaxDamage() - (left + bonus);
          if (damage < 0) damage = 0;
          if (damage < result.getItemDamage()) {
            result.setItemDamage(damage);
            cost += Math.max(1, Math.trunc(bonus / 100));
          }
        }
        for (const [id, addLevel] of EnchantmentHelper.getEnchantments(second)) {
          const ench = Enchantment.enchantmentsList[id];
          if (!ench) continue;
          const had = enchants.get(id) ?? 0;
          let level = had === addLevel ? addLevel + 1 : Math.max(addLevel, had);
          const gained = level - had;
          let applies = ench.canApply(first);
          if (this.thePlayer.capabilities.isCreativeMode || first.itemID === ItemIds.enchantedBook) applies = true;
          for (const other of enchants.keys()) {
            const o = Enchantment.enchantmentsList[other];
            if (other !== id && o && !ench.canApplyTogether(o)) {
              applies = false;
              cost += gained;
            }
          }
          if (applies) {
            if (level > ench.getMaxLevel()) level = ench.getMaxLevel();
            enchants.set(id, level);
            let per = weightCost(ench.getWeight());
            if (isBook) per = Math.max(1, Math.trunc(per / 2));
            cost += per * gained;
          }
        }
      }
    }
    const name = this.repairedItemName;
    if (name && name.length > 0 && name.toLowerCase() !== I18n.translateNamedKey(first.getItemName()).toLowerCase() && name !== first.getDisplayName()) {
      renameCost = first.isItemStackDamageable() ? 7 : first.stackSize * 5;
      cost += renameCost;
      if (first.hasDisplayName()) baseCost += Math.trunc(renameCost / 2);
      result.setItemName(name);
    }
    let i = 0;
    for (const [id, level] of enchants) {
      const ench = Enchantment.enchantmentsList[id];
      if (!ench) continue;
      i++;
      let per = weightCost(ench.getWeight());
      if (isBook) per = Math.max(1, Math.trunc(per / 2));
      baseCost += i + level * per;
    }
    if (isBook) baseCost = Math.max(1, Math.trunc(baseCost / 2));
    this.maximumCost = baseCost + cost;
    if (cost <= 0) result = null;
    // Renaming only: capped at 39 levels.
    if (renameCost === cost && renameCost > 0 && this.maximumCost >= 40) this.maximumCost = 39;
    if (this.maximumCost >= 40 && !this.thePlayer.capabilities.isCreativeMode) result = null;
    if (result) {
      let repairCost = result.getRepairCost();
      if (second && repairCost < second.getRepairCost()) repairCost = second.getRepairCost();
      if (result.hasDisplayName()) repairCost -= 9;
      if (repairCost < 0) repairCost = 0;
      result.setRepairCost(repairCost + 2);
      EnchantmentHelper.setEnchantments(enchants, result);
    }
    this.outputSlot.setInventorySlotContents(0, result);
    this.detectAndSendChanges();
  }

  override updateProgressBar(id: number, value: number): void {
    if (id === 0) this.maximumCost = value;
  }

  override onCraftGuiClosed(player: EntityPlayer): void {
    super.onCraftGuiClosed(player);
    if (this.theWorld.isRemote) return;
    for (let i = 0; i < this.inputSlots.getSizeInventory(); i++) {
      const s = this.inputSlots.getStackInSlotOnClosing(i);
      if (s) player.dropPlayerItem(s);
    }
  }

  canInteractWith(player: EntityPlayer): boolean {
    const { x, y, z } = this.pos;
    if (this.theWorld.getBlockId(x, y, z) !== BlockIds.anvil) return false;
    return player.getDistanceSq(x + 0.5, y + 0.5, z + 0.5) <= 64;
  }

  override transferStackInSlot(player: EntityPlayer, index: number): ItemStack | null {
    const slot = this.inventorySlots[index];
    if (!slot || !slot.getHasStack()) return null;
    const stack = slot.getStack()!;
    const before = stack.copy();
    if (index === 2) {
      if (!this.mergeItemStack(stack, 3, 39, true)) return null;
      slot.onSlotChange(stack, before);
    } else if (index !== 0 && index !== 1) {
      if (index >= 3 && index < 39 && !this.mergeItemStack(stack, 0, 2, false)) return null;
    } else if (!this.mergeItemStack(stack, 3, 39, false)) {
      return null;
    }
    if (stack.stackSize === 0) slot.putStack(null);
    else slot.onSlotChanged();
    if (stack.stackSize === before.stackSize) return null;
    slot.onPickupFromSlot(player, stack);
    return before;
  }

  /** The name typed in the screen's text field. */
  updateItemName(name: string): void {
    this.repairedItemName = name;
    if (this.getSlot(2).getHasStack()) this.getSlot(2).getStack()!.setItemName(name);
    this.updateRepairOutput();
  }
}
