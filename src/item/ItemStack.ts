import { Item } from './Item';
import type { Block } from '../block/Block';
import type { Entity } from '../entity/Entity';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { IWorld } from '../world/IWorld';
import { EnumAction, EnumRarity } from './Item';

/** NBT-like tag data (plain JSON-able objects stand in for NBTTagCompound). */
export type TagCompound = { [key: string]: unknown };

export class ItemStack {
  stackSize: number;
  animationsToGo = 0;
  itemID: number;
  stackTagCompound: TagCompound | null = null;
  private itemDamage: number;

  constructor(item: number | Item | Block | { blockID: number }, stackSize = 1, damage = 0) {
    this.itemID = typeof item === 'number' ? item : 'itemID' in item ? item.itemID : item.blockID;
    this.stackSize = stackSize;
    this.itemDamage = damage < 0 ? 0 : damage;
  }

  splitStack(n: number): ItemStack {
    const s = new ItemStack(this.itemID, n, this.itemDamage);
    if (this.stackTagCompound) s.stackTagCompound = structuredClone(this.stackTagCompound);
    this.stackSize -= n;
    return s;
  }

  getItem(): Item {
    return Item.itemsList[this.itemID]!;
  }

  getIconIndex() {
    return this.getItem().getIconIndex(this);
  }

  getItemSpriteNumber(): number {
    return this.getItem().getSpriteNumber();
  }

  tryPlaceItemIntoWorld(player: EntityPlayer, world: IWorld, x: number, y: number, z: number, side: number, hx: number, hy: number, hz: number): boolean {
    return this.getItem().onItemUse(this, player, world, x, y, z, side, hx, hy, hz);
  }

  getStrVsBlock(block: Block): number {
    return this.getItem().getStrVsBlock(this, block);
  }

  useItemRightClick(world: IWorld, player: EntityPlayer): ItemStack {
    return this.getItem().onItemRightClick(this, world, player);
  }

  getMaxStackSize(): number {
    return this.getItem().getItemStackLimit();
  }

  isStackable(): boolean {
    return this.getMaxStackSize() > 1 && (!this.isItemStackDamageable() || !this.isItemDamaged());
  }

  isItemStackDamageable(): boolean {
    return this.getItem().getMaxDamage() > 0;
  }

  getHasSubtypes(): boolean {
    return this.getItem().getHasSubtypes();
  }

  isItemDamaged(): boolean {
    return this.isItemStackDamageable() && this.itemDamage > 0;
  }

  getItemDamageForDisplay(): number {
    return this.itemDamage;
  }

  getItemDamage(): number {
    return this.itemDamage;
  }

  setItemDamage(d: number): void {
    this.itemDamage = d < 0 ? 0 : d;
  }

  getMaxDamage(): number {
    return this.getItem().getMaxDamage();
  }

  /** Creative players never damage items. */
  damageItem(amount: number, entity: EntityLiving): void {
    const player = entity as unknown as EntityPlayer;
    if ('capabilities' in player && player.capabilities.isCreativeMode) return;
    if (!this.isItemStackDamageable()) return;
    this.itemDamage += amount;
    if (this.itemDamage > this.getMaxDamage()) {
      entity.renderBrokenItemStack(this);
      this.stackSize--;
      if (this.stackSize < 0) this.stackSize = 0;
      this.itemDamage = 0;
    }
  }

  hitEntity(target: EntityLiving, player: EntityPlayer): void {
    this.getItem().hitEntity(this, target, player);
  }

  getDamageVsEntity(e: Entity): number {
    return this.getItem().getDamageVsEntity(e);
  }

  canHarvestBlock(b: Block): boolean {
    return this.getItem().canHarvestBlock(b);
  }

  /** Ticks the pickup bob animation and the item's onUpdate hook. */
  updateAnimation(world: IWorld, e: Entity, slot: number, held: boolean): void {
    if (this.animationsToGo > 0) this.animationsToGo--;
    this.getItem().onUpdate(this, world, e, slot, held);
  }

  isItemEnchantable(): boolean {
    return this.getItem().isItemTool(this) && !this.isItemEnchanted();
  }

  copy(): ItemStack {
    const s = new ItemStack(this.itemID, this.stackSize, this.itemDamage);
    if (this.stackTagCompound) s.stackTagCompound = structuredClone(this.stackTagCompound);
    return s;
  }

  static areItemStackTagsEqual(a: ItemStack | null, b: ItemStack | null): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (!a.stackTagCompound && b.stackTagCompound) return false;
    return !a.stackTagCompound || JSON.stringify(a.stackTagCompound) === JSON.stringify(b.stackTagCompound);
  }

  static areItemStacksEqual(a: ItemStack | null, b: ItemStack | null): boolean {
    if (!a && !b) return true;
    return !!a && !!b && a.stackSize === b.stackSize && a.itemID === b.itemID && a.itemDamage === b.itemDamage && ItemStack.areItemStackTagsEqual(a, b);
  }

  static copyItemStack(s: ItemStack | null): ItemStack | null {
    return s ? s.copy() : null;
  }

  isItemEqual(o: ItemStack): boolean {
    return this.itemID === o.itemID && this.itemDamage === o.itemDamage;
  }

  getItemName(): string {
    return this.getItem().getUnlocalizedName(this);
  }

  getMaxItemUseDuration(): number {
    return this.getItem().getMaxItemUseDuration(this);
  }

  getItemUseAction(): EnumAction {
    return this.getItem().getItemUseAction(this);
  }

  onPlayerStoppedUsing(world: IWorld, player: EntityPlayer, ticksLeft: number): void {
    this.getItem().onPlayerStoppedUsing(this, world, player, ticksLeft);
  }

  /** writeToNBT: {id, Count, Damage, tag?} as plain data (tile entities, worker descriptors). */
  writeToNBT(): TagCompound {
    const t: TagCompound = { id: this.itemID, Count: this.stackSize, Damage: this.itemDamage };
    if (this.stackTagCompound) t.tag = structuredClone(this.stackTagCompound);
    return t;
  }

  /** loadItemStackFromNBT: null for unknown items. */
  static loadItemStackFromNBT(t: TagCompound): ItemStack | null {
    const id = Number(t.id);
    if (!Item.itemsList[id]) return null;
    const s = new ItemStack(id, Number(t.Count ?? 1), Number(t.Damage ?? 0));
    if (t.tag && typeof t.tag === 'object') s.stackTagCompound = structuredClone(t.tag as TagCompound);
    return s;
  }

  hasTagCompound(): boolean {
    return this.stackTagCompound !== null;
  }

  getTagCompound(): TagCompound | null {
    return this.stackTagCompound;
  }

  setTagCompound(t: TagCompound | null): void {
    this.stackTagCompound = t;
  }

  getDisplayName(): string {
    let name = this.getItem().getItemDisplayName(this);
    const display = this.stackTagCompound?.display as TagCompound | undefined;
    if (display && typeof display.Name === 'string') name = display.Name;
    return name;
  }

  setItemName(name: string): void {
    this.stackTagCompound ??= {};
    const display = (this.stackTagCompound.display ??= {}) as TagCompound;
    display.Name = name;
  }

  hasDisplayName(): boolean {
    const display = this.stackTagCompound?.display as TagCompound | undefined;
    return !!display && 'Name' in display;
  }

  /** Tooltip lines; `advanced` adds the "#0001/0" id suffix (F3+H). */
  getTooltip(player: EntityPlayer | null, advanced: boolean): string[] {
    const lines: string[] = [];
    let name = this.getDisplayName();
    if (this.hasDisplayName()) name = '§o' + name + '§r';
    if (advanced) {
      let close = '';
      if (name.length > 0) {
        name += ' (';
        close = ')';
      }
      const id = String(this.itemID).padStart(4, '0');
      name += this.getHasSubtypes() ? `#${id}/${this.itemDamage}${close}` : `#${id}${close}`;
    }
    lines.push(name);
    this.getItem().addInformation(this, player, lines, advanced);
    if (advanced && this.isItemDamaged()) lines.push(`Durability: ${this.getMaxDamage() - this.getItemDamageForDisplay()} / ${this.getMaxDamage()}`);
    return lines;
  }

  hasEffect(): boolean {
    return this.getItem().hasEffect(this);
  }

  getRarity(): EnumRarity {
    return this.getItem().getRarity(this);
  }

  isItemEnchanted(): boolean {
    return !!this.stackTagCompound && 'ench' in this.stackTagCompound;
  }

  toString(): string {
    return `${this.stackSize}x${this.getItem()?.getUnlocalizedName() ?? '?'}@${this.itemDamage}`;
  }
}
