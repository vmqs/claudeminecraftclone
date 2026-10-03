import { BlockIds, ItemIds } from '../../block/BlockIds';
import type { ItemStack } from '../../item/ItemStack';
import type { Icon, IconRegister } from '../../render/texture/Icon';
import type { IInventory } from './IInventory';
import { Slot } from './Slot';

/** An armour slot (SlotArmor): one item, only armour of its type (or a pumpkin/skull on the head). */
export class SlotArmor extends Slot {
  /** The greyed-out slot pictures (ItemArmor.func_94602_b), registered with the item atlas. */
  static readonly emptySlotIcons: (Icon | null)[] = [null, null, null, null];

  static registerIcons(reg: IconRegister): void {
    const names = ['slot_empty_helmet', 'slot_empty_chestplate', 'slot_empty_leggings', 'slot_empty_boots'];
    names.forEach((n, i) => (SlotArmor.emptySlotIcons[i] = reg.registerIcon(n)));
  }

  constructor(
    inventory: IInventory,
    slotIndex: number,
    x: number,
    y: number,
    /** 0 = helmet, 1 = chestplate, 2 = leggings, 3 = boots. */
    readonly armorType: number,
  ) {
    super(inventory, slotIndex, x, y);
  }

  override getSlotStackLimit(): number {
    return 1;
  }

  override isItemValid(stack: ItemStack | null): boolean {
    if (!stack) return false;
    const armor = stack.getItem().getArmorInfo();
    if (armor) return armor.armorType === this.armorType;
    return (stack.itemID === BlockIds.pumpkin || stack.itemID === ItemIds.skull) && this.armorType === 0;
  }

  override getBackgroundIconIndex(): Icon | null {
    return SlotArmor.emptySlotIcons[this.armorType];
  }
}
