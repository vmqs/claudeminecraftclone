import { BlockIds, ItemIds } from '../block/BlockIds';
import { I18n } from '../core/I18n';
import type { Item } from './Item';
import type { ItemStack } from './ItemStack';

/** Late-bound access to Item.itemsList (avoids an import cycle with Item). */
let itemsListRef: (Item | null)[] = [];
export function bindCreativeTabsItemList(list: (Item | null)[]): void {
  itemsListRef = list;
}

/** The 12 creative inventory tabs in 1.5.2 order (index = position). */
export class CreativeTabs {
  static readonly creativeTabArray: CreativeTabs[] = [];

  private backgroundImageName = 'list_items.png';
  private hasScrollbar = true;
  private drawTitle = true;

  constructor(
    readonly tabIndex: number,
    readonly tabLabel: string,
    private readonly iconItemIndex: number,
  ) {
    CreativeTabs.creativeTabArray[tabIndex] = this;
  }

  getTabIndex(): number {
    return this.tabIndex;
  }
  getTabLabel(): string {
    return this.tabLabel;
  }
  getTranslatedTabLabel(): string {
    return I18n.translateToLocal('itemGroup.' + this.tabLabel);
  }
  getTabIconItemIndex(): number {
    return this.iconItemIndex;
  }
  getTabIconItem(): Item | null {
    return itemsListRef[this.iconItemIndex] ?? null;
  }
  getBackgroundImageName(): string {
    return this.backgroundImageName;
  }
  setBackgroundImageName(name: string): this {
    this.backgroundImageName = name;
    return this;
  }
  drawInForegroundOfTab(): boolean {
    return this.drawTitle;
  }
  setNoTitle(): this {
    this.drawTitle = false;
    return this;
  }
  shouldHidePlayerInventory(): boolean {
    return this.hasScrollbar;
  }
  setNoScrollbar(): this {
    this.hasScrollbar = false;
    return this;
  }
  getTabColumn(): number {
    return this.tabIndex % 6;
  }
  isTabInFirstRow(): boolean {
    return this.tabIndex < 6;
  }

  /**
   * The enchantment types whose max-level enchanted books follow the items of this tab
   * (CreativeTabTools: digger; CreativeTabCombat: armour, bow and weapon types).
   */
  private relevantEnchantmentTypes: readonly string[] = [];

  /**
   * Appends one max-level enchanted book per enchantment of the given types
   * (CreativeTabs.func_92116_a); installed by the item registry.
   */
  static enchantedBookProvider: ((types: readonly string[], out: ItemStack[]) => void) | null = null;

  setRelevantEnchantmentTypes(...types: string[]): this {
    this.relevantEnchantmentTypes = types;
    return this;
  }

  getRelevantEnchantmentTypes(): readonly string[] {
    return this.relevantEnchantmentTypes;
  }

  /** Fills `out` with every item stack shown in this tab (in item id order), then its enchanted books. */
  displayAllReleventItems(out: ItemStack[]): void {
    for (const item of itemsListRef) {
      if (item && item.getCreativeTab() === this) item.getSubItems(item.itemID, this, out);
    }
    if (this.relevantEnchantmentTypes.length > 0) CreativeTabs.enchantedBookProvider?.(this.relevantEnchantmentTypes, out);
  }

  static tabBlock = new CreativeTabs(0, 'buildingBlocks', BlockIds.brick);
  static tabDecorations = new CreativeTabs(1, 'decorations', BlockIds.plantRed);
  static tabRedstone = new CreativeTabs(2, 'redstone', ItemIds.redstone);
  static tabTransport = new CreativeTabs(3, 'transportation', BlockIds.railPowered);
  static tabMisc = new CreativeTabs(4, 'misc', ItemIds.bucketLava);
  static tabAllSearch = new CreativeTabs(5, 'search', ItemIds.compass).setBackgroundImageName('search.png');
  static tabFood = new CreativeTabs(6, 'food', ItemIds.appleRed);
  static tabTools = new CreativeTabs(7, 'tools', ItemIds.axeIron).setRelevantEnchantmentTypes('digger');
  static tabCombat = new CreativeTabs(8, 'combat', ItemIds.swordGold).setRelevantEnchantmentTypes('armor', 'armor_feet', 'armor_head', 'armor_legs', 'armor_torso', 'bow', 'weapon');
  static tabBrewing = new CreativeTabs(9, 'brewing', ItemIds.potion);
  static tabMaterials = new CreativeTabs(10, 'materials', ItemIds.stick);
  static tabInventory = new CreativeTabs(11, 'inventory', BlockIds.chest)
    .setBackgroundImageName('survival_inv.png')
    .setNoScrollbar()
    .setNoTitle();
}
