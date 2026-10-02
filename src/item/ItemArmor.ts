import { ItemIds } from '../block/BlockIds';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import { CreativeTabs } from './CreativeTabs';
import { type ArmorInfo, Item } from './Item';
import type { ItemStack, TagCompound } from './ItemStack';

/** EnumArmorMaterial: durability factor, armour points per slot and enchantability. */
export class EnumArmorMaterial {
  static readonly CLOTH = new EnumArmorMaterial('CLOTH', 5, [1, 3, 2, 1], 15);
  static readonly CHAIN = new EnumArmorMaterial('CHAIN', 15, [2, 5, 4, 1], 12);
  static readonly IRON = new EnumArmorMaterial('IRON', 15, [2, 6, 5, 2], 9);
  static readonly GOLD = new EnumArmorMaterial('GOLD', 7, [2, 5, 3, 1], 25);
  static readonly DIAMOND = new EnumArmorMaterial('DIAMOND', 33, [3, 8, 6, 3], 10);

  private constructor(
    readonly name: string,
    private readonly maxDamageFactor: number,
    private readonly damageReductionAmountArray: readonly number[],
    private readonly enchantability: number,
  ) {}

  /** Durability of slot `armorType` (0 helmet ... 3 boots). */
  getDurability(armorType: number): number {
    return ItemArmor.maxDamageArray[armorType] * this.maxDamageFactor;
  }
  getDamageReductionAmount(armorType: number): number {
    return this.damageReductionAmountArray[armorType];
  }
  getEnchantability(): number {
    return this.enchantability;
  }
  getArmorCraftingMaterial(): number {
    switch (this) {
      case EnumArmorMaterial.CLOTH:
        return ItemIds.leather;
      case EnumArmorMaterial.CHAIN:
      case EnumArmorMaterial.IRON:
        return ItemIds.ingotIron;
      case EnumArmorMaterial.GOLD:
        return ItemIds.ingotGold;
      case EnumArmorMaterial.DIAMOND:
        return ItemIds.diamond;
      default:
        return 0;
    }
  }
  toString(): string {
    return this.name;
  }
}

/** Undyed leather colour (ItemArmor.getColor default). */
export const LEATHER_DEFAULT_COLOR = 10511680;

/** RenderBiped's armour texture prefixes by renderIndex: /armor/<prefix>_1.png (and _2 for leggings). */
export const ARMOR_TEXTURE_PREFIXES = ['cloth', 'chain', 'iron', 'diamond', 'gold'];

/**
 * A piece of armour (ItemArmor): slot `armorType` (0 helmet, 1 chestplate, 2 leggings, 3
 * boots), texture set `renderIndex` (0 cloth, 1 chain, 2 iron, 3 diamond, 4 gold). Leather is
 * dyeable (display.color) and draws a second, untinted overlay pass.
 */
export class ItemArmor extends Item {
  static readonly maxDamageArray = [11, 16, 15, 13];
  private static readonly clothOverlayNames = ['helmetCloth_overlay', 'chestplateCloth_overlay', 'leggingsCloth_overlay', 'bootsCloth_overlay'];
  /** The empty-slot backgrounds of the inventory's armour column (SlotArmor). */
  static readonly emptySlotNames = ['slot_empty_helmet', 'slot_empty_chestplate', 'slot_empty_leggings', 'slot_empty_boots'];

  readonly damageReduceAmount: number;
  private overlayIcon: Icon | null = null;
  private emptySlotIcon: Icon | null = null;

  constructor(
    index: number,
    private readonly material: EnumArmorMaterial,
    readonly renderIndex: number,
    readonly armorType: number,
  ) {
    super(index);
    this.damageReduceAmount = material.getDamageReductionAmount(armorType);
    this.setMaxDamage(material.getDurability(armorType));
    this.maxStackSize = 1;
    this.setCreativeTab(CreativeTabs.tabCombat);
  }

  override getColorFromItemStack(stack: ItemStack, pass: number): number {
    if (pass > 0) return 0xffffff;
    const c = this.getColor(stack);
    return c < 0 ? 0xffffff : c;
  }
  override requiresMultipleRenderPasses(): boolean {
    return this.material === EnumArmorMaterial.CLOTH;
  }
  override getItemEnchantability(): number {
    return this.material.getEnchantability();
  }
  getArmorMaterial(): EnumArmorMaterial {
    return this.material;
  }

  private static display(stack: ItemStack): TagCompound | null {
    const d = stack.getTagCompound()?.display;
    return d && typeof d === 'object' ? (d as TagCompound) : null;
  }

  hasColor(stack: ItemStack): boolean {
    return this.material === EnumArmorMaterial.CLOTH && !!ItemArmor.display(stack) && 'color' in ItemArmor.display(stack)!;
  }
  /** The dyed colour, the default leather brown, or -1 for other materials. */
  getColor(stack: ItemStack): number {
    if (this.material !== EnumArmorMaterial.CLOTH) return -1;
    const d = ItemArmor.display(stack);
    return d && 'color' in d ? Number(d.color) | 0 : LEATHER_DEFAULT_COLOR;
  }
  removeColor(stack: ItemStack): void {
    if (this.material !== EnumArmorMaterial.CLOTH) return;
    const d = ItemArmor.display(stack);
    if (d && 'color' in d) delete d.color;
  }
  /** func_82813_b: dyes leather (display.color). */
  setColor(stack: ItemStack, color: number): void {
    if (this.material !== EnumArmorMaterial.CLOTH) throw new Error("Can't dye non-leather!");
    let tag = stack.getTagCompound();
    if (!tag) {
      tag = {};
      stack.setTagCompound(tag);
    }
    const d = (tag.display ??= {}) as TagCompound;
    d.color = color | 0;
  }

  override getIconFromDamageForRenderPass(damage: number, pass: number): Icon | null {
    return pass === 1 ? this.overlayIcon : super.getIconFromDamageForRenderPass(damage, pass);
  }
  override getIsRepairable(stack: ItemStack, material: ItemStack): boolean {
    return this.material.getArmorCraftingMaterial() === material.itemID ? true : super.getIsRepairable(stack, material);
  }
  override registerIcons(reg: IconRegister): void {
    super.registerIcons(reg);
    if (this.material === EnumArmorMaterial.CLOTH) this.overlayIcon = reg.registerIcon(ItemArmor.clothOverlayNames[this.armorType]);
    this.emptySlotIcon = reg.registerIcon(ItemArmor.emptySlotNames[this.armorType]);
  }
  /** func_94602_b: the empty armour slot background for a slot (taken from the diamond pieces). */
  getEmptySlotIcon(): Icon | null {
    return this.emptySlotIcon;
  }

  /** Right click equips the piece when that armour slot is empty. */
  override onItemRightClick(stack: ItemStack, _w: IWorld, player: EntityPlayer): ItemStack {
    // EntityLiving.getArmorPosition(stack) - 1; a player's armour slots index armorInventory directly.
    const slot = 3 - this.armorType;
    if (player.inventory.armorInventory[slot] === null) {
      player.setCurrentItemOrArmor(slot, stack.copy());
      stack.stackSize = 0;
    }
    return stack;
  }

  override getArmorReduction(): number {
    return this.damageReduceAmount;
  }
  override getArmorInfo(): ArmorInfo {
    return { armorType: this.armorType, renderIndex: this.renderIndex, isCloth: this.material === EnumArmorMaterial.CLOTH };
  }
  override getArmorColor(stack: ItemStack): number {
    return this.getColorFromItemStack(stack, 0);
  }
  /** The worn-model texture of this piece: /armor/<material>_1.png, or _2 for leggings. */
  getArmorTexture(overlay = false): string {
    return `/armor/${ARMOR_TEXTURE_PREFIXES[this.renderIndex]}_${this.armorType === 2 ? 2 : 1}${overlay ? '_b' : ''}.png`;
  }
}
