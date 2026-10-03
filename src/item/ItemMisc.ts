import { Block } from '../block/Block';
import { BlockIds } from '../block/BlockIds';
import { I18n } from '../core/I18n';
import { Enchantment } from '../enchantment/Enchantment';
import { addStoredEnchantment, EnchantmentData, getStoredEnchantments } from '../enchantment/EnchantmentHelper';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { JavaRandom } from '../core/JavaRandom';
import { MathHelper } from '../core/MathHelper';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import type { World } from '../world/World';
import { CreativeTabs } from './CreativeTabs';
import { EnumRarity, Item } from './Item';
import { ItemDye } from './ItemDye';
import { createFirework } from './ItemEntitySpawning';
import { ItemStack, type TagCompound } from './ItemStack';

/** Coal (damage 0) and charcoal (damage 1). */
export class ItemCoal extends Item {
  constructor(index: number) {
    super(index);
    this.setHasSubtypes(true);
    this.setMaxDamage(0);
    this.setCreativeTab(CreativeTabs.tabMaterials);
  }
  override getUnlocalizedName(stack?: ItemStack): string {
    return stack && stack.getItemDamage() === 1 ? 'item.charcoal' : 'item.coal';
  }
  override getSubItems(id: number, _tab: CreativeTabs | null, out: ItemStack[]): void {
    out.push(new ItemStack(id, 1, 0));
    out.push(new ItemStack(id, 1, 1));
  }
}

/** The book: enchantable (into an enchanted book) when it is a single book. */
export class ItemBook extends Item {
  override isItemTool(stack: ItemStack): boolean {
    return stack.stackSize === 1;
  }
  override getItemEnchantability(): number {
    return 1;
  }
}

/** Shears: fast on leaves, webs and wool; wear only from plants, webs, vines and tripwire. */
export class ItemShears extends Item {
  constructor(index: number) {
    super(index);
    this.setMaxStackSize(1);
    this.setMaxDamage(238);
    this.setCreativeTab(CreativeTabs.tabTools);
  }
  override onBlockDestroyed(stack: ItemStack, w: IWorld, id: number, x: number, y: number, z: number, e: EntityLiving): boolean {
    if (id !== BlockIds.leaves && id !== BlockIds.web && id !== BlockIds.tallGrass && id !== BlockIds.vine && id !== BlockIds.tripWire) return super.onBlockDestroyed(stack, w, id, x, y, z, e);
    stack.damageItem(1, e);
    return true;
  }
  override canHarvestBlock(b: Block): boolean {
    return b.blockID === BlockIds.web || b.blockID === BlockIds.redstoneWire || b.blockID === BlockIds.tripWire;
  }
  override getStrVsBlock(stack: ItemStack, b: Block): number {
    if (b.blockID === BlockIds.web || b.blockID === BlockIds.leaves) return 15;
    return b.blockID === BlockIds.cloth ? 5 : super.getStrVsBlock(stack, b);
  }
}

/** An item that always glints (nether star). */
export class ItemSimpleFoiled extends Item {
  override hasEffect(_stack: ItemStack): boolean {
    return true;
  }
}

/** What a jukebox block offers (BlockJukeBox.insertRecord). */
interface Jukebox {
  insertRecord?(w: IWorld, x: number, y: number, z: number, stack: ItemStack): void;
}

/** Music discs (ItemRecord): inserted into an empty jukebox, "C418 - <name>" in the tooltip. */
export class ItemRecord extends Item {
  private static readonly records = new Map<string, ItemRecord>();

  constructor(
    index: number,
    readonly recordName: string,
  ) {
    super(index);
    this.maxStackSize = 1;
    this.setCreativeTab(CreativeTabs.tabMisc);
    ItemRecord.records.set(recordName, this);
  }
  override getIconFromDamage(_damage: number): Icon | null {
    return this.itemIcon;
  }
  override onItemUse(stack: ItemStack, _player: EntityPlayer, w: IWorld, x: number, y: number, z: number): boolean {
    if (w.getBlockId(x, y, z) !== BlockIds.jukebox || w.getBlockMetadata(x, y, z) !== 0) return false;
    if (w.isRemote) return true;
    (Block.blocksList[BlockIds.jukebox] as (Block & Jukebox) | null)?.insertRecord?.(w, x, y, z, stack);
    (w as World).playAuxSFXAtEntity(null, 1005, x, y, z, this.itemID);
    stack.stackSize--;
    return true;
  }
  override addInformation(_stack: ItemStack, _player: EntityPlayer | null, lines: string[]): void {
    lines.push(this.getRecordTitle());
  }
  override getRecordName(): string {
    return this.recordName;
  }
  override getRecordTitle(): string {
    return 'C418 - ' + this.recordName;
  }
  override getRarity(_stack: ItemStack): EnumRarity {
    return EnumRarity.rare;
  }
  static getRecord(name: string): ItemRecord | null {
    return ItemRecord.records.get(name) ?? null;
  }
  override registerIcons(reg: IconRegister): void {
    this.itemIcon = reg.registerIcon('record_' + this.recordName);
  }
}

/** Book and quill: opens the book editor (EntityPlayer.displayGUIBook). */
export class ItemWritableBook extends Item {
  constructor(index: number) {
    super(index);
    this.setMaxStackSize(1);
  }
  override onItemRightClick(stack: ItemStack, _w: IWorld, player: EntityPlayer): ItemStack {
    player.displayGUIBook(stack);
    return stack;
  }
  /** Every page is a string of at most 256 characters. */
  static validBookTagPages(tag: TagCompound | null): boolean {
    if (!tag || !Array.isArray(tag.pages)) return false;
    return tag.pages.every((p) => typeof p === 'string' && p.length <= 256);
  }
}

/** A signed book: titled, "by <author>", glinting; opens the reader. */
export class ItemEditableBook extends Item {
  constructor(index: number) {
    super(index);
    this.setMaxStackSize(1);
  }
  static validBookTagContents(tag: TagCompound | null): boolean {
    if (!ItemWritableBook.validBookTagPages(tag)) return false;
    const title = tag!.title;
    return typeof title === 'string' && title.length <= 16 && 'author' in tag!;
  }
  override getItemDisplayName(stack: ItemStack): string {
    const title = stack.getTagCompound()?.title;
    return typeof title === 'string' ? title : super.getItemDisplayName(stack);
  }
  override addInformation(stack: ItemStack, _player: EntityPlayer | null, lines: string[]): void {
    const author = stack.getTagCompound()?.author;
    if (typeof author === 'string') lines.push('§7' + I18n.translateToLocalFormatted('book.byAuthor', author));
  }
  override onItemRightClick(stack: ItemStack, _w: IWorld, player: EntityPlayer): ItemStack {
    player.displayGUIBook(stack);
    return stack;
  }
  override hasEffect(_stack: ItemStack): boolean {
    return true;
  }
}

/** Enchanted books: stored enchantments (StoredEnchantments) listed in the tooltip. */
export class ItemEnchantedBook extends Item {
  override hasEffect(_stack: ItemStack): boolean {
    return true;
  }
  override isItemTool(_stack: ItemStack): boolean {
    return false;
  }
  override getRarity(stack: ItemStack): EnumRarity {
    return getStoredEnchantments(stack).length > 0 ? EnumRarity.uncommon : super.getRarity(stack);
  }
  override addInformation(stack: ItemStack, _player: EntityPlayer | null, lines: string[]): void {
    for (const t of getStoredEnchantments(stack)) {
      const e = Enchantment.enchantmentsList[t.id];
      if (e) lines.push(e.getTranslatedName(t.lvl));
    }
  }
  /** func_92111_a: a book holding one enchantment. */
  getEnchantedItemStack(data: EnchantmentData): ItemStack {
    const s = new ItemStack(this);
    addStoredEnchantment(s, data);
    return s;
  }
  /** func_92113_a: one book per level of `e` (the creative search tab lists them all). */
  addAllLevels(e: Enchantment, out: ItemStack[]): void {
    for (let l = e.getMinLevel(); l <= e.getMaxLevel(); l++) out.push(this.getEnchantedItemStack(new EnchantmentData(e, l)));
  }
  /** func_92109_a: a random enchantment at a random level (dungeon chests). */
  getRandomEnchantedBook(rand: JavaRandom): ItemStack {
    const list = Enchantment.enchantmentsBookList;
    const e = list[rand.nextInt(list.length)];
    const s = new ItemStack(this.itemID, 1, 0);
    addStoredEnchantment(s, new EnchantmentData(e, MathHelper.getRandomIntegerInRange(rand, e.getMinLevel(), e.getMaxLevel())));
    return s;
  }
}

/** Reads a firework explosion's int arrays (NBTTagIntArray stands in as number[]). */
function intArray(v: unknown): number[] {
  return Array.isArray(v) ? v.map((n) => Number(n) | 0) : [];
}

function byteOf(v: unknown): number {
  return (Number(v ?? 0) << 24) >> 24;
}

/** The colour names of a firework colour list ("Red, Custom"). */
function colorNames(colors: readonly number[]): string {
  return colors
    .map((c) => {
      const i = ItemDye.dyeColors.indexOf(c);
      return I18n.translateToLocal(i >= 0 ? 'item.fireworksCharge.' + ItemDye.dyeColorNames[i] : 'item.fireworksCharge.customColor');
    })
    .join(', ');
}

/** Firework star (ItemFireworkCharge): its overlay shows the average of the star's colours. */
export class ItemFireworkCharge extends Item {
  private theIcon: Icon | null = null;

  override getIconFromDamageForRenderPass(damage: number, pass: number): Icon | null {
    return pass > 0 ? this.theIcon : super.getIconFromDamageForRenderPass(damage, pass);
  }
  override getColorFromItemStack(stack: ItemStack, pass: number): number {
    if (pass !== 1) return super.getColorFromItemStack(stack, pass);
    const colors = ItemFireworkCharge.getExplosionTag(stack, 'Colors');
    if (colors === null) return 9079434;
    const list = intArray(colors);
    if (list.length === 1) return list[0];
    let r = 0;
    let g = 0;
    let b = 0;
    for (const c of list) {
      r += (c & 0xff0000) >> 16;
      g += (c & 0xff00) >> 8;
      b += c & 0xff;
    }
    r = Math.trunc(r / list.length);
    g = Math.trunc(g / list.length);
    b = Math.trunc(b / list.length);
    return (r << 16) | (g << 8) | b;
  }
  override requiresMultipleRenderPasses(): boolean {
    return true;
  }
  /** func_92108_a: a tag inside the stack's "Explosion" compound, or null. */
  static getExplosionTag(stack: ItemStack, key: string): unknown {
    const ex = stack.getTagCompound()?.Explosion as TagCompound | undefined;
    return ex && key in ex ? ex[key] : null;
  }
  override addInformation(stack: ItemStack, _player: EntityPlayer | null, lines: string[]): void {
    const ex = stack.getTagCompound()?.Explosion;
    if (ex && typeof ex === 'object') ItemFireworkCharge.addExplosionInfo(ex as TagCompound, lines);
  }
  /** func_92107_a: shape, colours, fade colours, trail and twinkle lines of one explosion. */
  static addExplosionInfo(ex: TagCompound, lines: string[]): void {
    const type = byteOf(ex.Type);
    lines.push(I18n.translateToLocal(type >= 0 && type <= 4 ? 'item.fireworksCharge.type.' + type : 'item.fireworksCharge.type').trim());
    const colors = intArray(ex.Colors);
    if (colors.length > 0) lines.push(colorNames(colors));
    const fade = intArray(ex.FadeColors);
    if (fade.length > 0) lines.push(I18n.translateToLocal('item.fireworksCharge.fadeTo') + ' ' + colorNames(fade));
    if (ex.Trail === true || ex.Trail === 1) lines.push(I18n.translateToLocal('item.fireworksCharge.trail'));
    if (ex.Flicker === true || ex.Flicker === 1) lines.push(I18n.translateToLocal('item.fireworksCharge.flicker'));
  }
  override registerIcons(reg: IconRegister): void {
    super.registerIcons(reg);
    this.theIcon = reg.registerIcon('fireworksCharge_overlay');
  }
}

/** Firework rocket: launched from the clicked point; the tooltip lists flight and explosions. */
export class ItemFirework extends Item {
  override onItemUse(stack: ItemStack, player: EntityPlayer, w: IWorld, x: number, y: number, z: number, _side: number, hx: number, hy: number, hz: number): boolean {
    if (w.isRemote) return false;
    const f = Math.fround;
    const rocket = createFirework(w as World, f(x + hx), f(y + hy), f(z + hz), stack);
    if (rocket) w.spawnEntityInWorld(rocket);
    if (!player.capabilities.isCreativeMode) stack.stackSize--;
    return true;
  }
  override addInformation(stack: ItemStack, _player: EntityPlayer | null, lines: string[]): void {
    const fw = stack.getTagCompound()?.Fireworks as TagCompound | undefined;
    if (!fw || typeof fw !== 'object') return;
    if ('Flight' in fw) lines.push(I18n.translateToLocal('item.fireworks.flight') + ' ' + byteOf(fw.Flight));
    const explosions = Array.isArray(fw.Explosions) ? (fw.Explosions as TagCompound[]) : [];
    for (const ex of explosions) {
      const part: string[] = [];
      ItemFireworkCharge.addExplosionInfo(ex, part);
      for (let i = 1; i < part.length; i++) part[i] = '  ' + part[i];
      lines.push(...part);
    }
  }
}
