import { I18n } from '../core/I18n';
import { JavaRandom } from '../core/JavaRandom';
import { MathHelper } from '../core/MathHelper';
import { Vec3 } from '../core/Vec3';
import type { MovingObjectPosition } from '../core/MovingObjectPosition';
import type { Block } from '../block/Block';
import type { Entity } from '../entity/Entity';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IWorld } from '../world/IWorld';
import type { CreativeTabs } from './CreativeTabs';
import { ItemStack } from './ItemStack';

/**
 * What ItemArmor exposes to renderers: slot type (0 helmet ... 3 boots), the texture set
 * (renderIndex: cloth, chain, iron, diamond, gold) and whether it is dyeable leather.
 */
export interface ArmorInfo {
  readonly armorType: number;
  readonly renderIndex: number;
  readonly isCloth: boolean;
}

export enum EnumAction {
  none,
  eat,
  drink,
  block,
  bow,
}

export class EnumRarity {
  static readonly common = new EnumRarity(15, 'Common');
  static readonly uncommon = new EnumRarity(14, 'Uncommon');
  static readonly rare = new EnumRarity(11, 'Rare');
  static readonly epic = new EnumRarity(13, 'Epic');
  private constructor(
    readonly rarityColor: number,
    readonly rarityName: string,
  ) {}
}

/** Hook for ray traces from items (set by World; keeps Item free of a World import). */
export interface RayTracer {
  rayTraceBlocks_do_do(start: Vec3, end: Vec3, liquids: boolean, ignoreNoCollision: boolean): MovingObjectPosition | null;
}

/**
 * Item base with the 1.5.2 API. `new Item(index)` registers itself at
 * `itemsList[256 + index]`; blocks get an ItemBlock at their own id.
 */
export class Item {
  /** Item.itemRand: shared by item effects (bone meal particles, bow pitch...). */
  static readonly itemRand = new JavaRandom();
  static readonly itemsList: (Item | null)[] = new Array(32000).fill(null);

  readonly itemID: number;
  protected maxStackSize = 64;
  private maxDamage = 0;
  protected bFull3D = false;
  protected hasSubtypes = false;
  private containerItem: Item | null = null;
  private potionEffect: string | null = null;
  protected unlocalizedName = '';
  protected itemIcon: Icon | null = null;
  private tabToDisplayOn: CreativeTabs | null = null;

  constructor(index: number) {
    this.itemID = 256 + index;
    if (Item.itemsList[this.itemID]) console.warn('CONFLICT @ ' + index);
    Item.itemsList[this.itemID] = this;
  }

  setMaxStackSize(n: number): this {
    this.maxStackSize = n;
    return this;
  }
  /** 0 = terrain atlas, 1 = items atlas. */
  getSpriteNumber(): number {
    return 1;
  }
  getIconFromDamage(_damage: number): Icon | null {
    return this.itemIcon;
  }
  getIconIndex(stack: ItemStack): Icon | null {
    return this.getIconFromDamage(stack.getItemDamage());
  }
  onItemUse(_stack: ItemStack, _player: EntityPlayer, _world: IWorld, _x: number, _y: number, _z: number, _side: number, _hx: number, _hy: number, _hz: number): boolean {
    return false;
  }
  getStrVsBlock(_stack: ItemStack, _block: Block): number {
    return 1;
  }
  onItemRightClick(stack: ItemStack, _world: IWorld, _player: EntityPlayer): ItemStack {
    return stack;
  }
  onEaten(stack: ItemStack, _world: IWorld, _player: EntityPlayer): ItemStack {
    return stack;
  }
  getItemStackLimit(): number {
    return this.maxStackSize;
  }
  getMetadata(_damage: number): number {
    return 0;
  }
  getHasSubtypes(): boolean {
    return this.hasSubtypes;
  }
  setHasSubtypes(v: boolean): this {
    this.hasSubtypes = v;
    return this;
  }
  getMaxDamage(): number {
    return this.maxDamage;
  }
  setMaxDamage(v: number): this {
    this.maxDamage = v;
    return this;
  }
  isDamageable(): boolean {
    return this.maxDamage > 0 && !this.hasSubtypes;
  }
  hitEntity(_stack: ItemStack, _target: EntityLiving, _attacker: EntityLiving): boolean {
    return false;
  }
  onBlockDestroyed(_stack: ItemStack, _world: IWorld, _id: number, _x: number, _y: number, _z: number, _e: EntityLiving): boolean {
    return false;
  }
  getDamageVsEntity(_e: Entity): number {
    return 1;
  }
  /** Armour points when worn (ItemArmor.damageReduceAmount; 0 for everything else). */
  getArmorReduction(): number {
    return 0;
  }
  /** Worn-armour data of ItemArmor for the armour layers of RenderBiped/RenderPlayer. */
  getArmorInfo(): ArmorInfo | null {
    return null;
  }
  /** ItemArmor.getColor: dyed leather colour (0xRRGGBB). */
  getArmorColor(_stack: ItemStack): number {
    return 0xffffff;
  }
  canHarvestBlock(_b: Block): boolean {
    return false;
  }
  itemInteractionForEntity(_stack: ItemStack, _e: EntityLiving): boolean {
    return false;
  }
  setFull3D(): this {
    this.bFull3D = true;
    return this;
  }
  isFull3D(): boolean {
    return this.bFull3D;
  }
  shouldRotateAroundWhenRendering(): boolean {
    return false;
  }
  setUnlocalizedName(name: string): this {
    this.unlocalizedName = name;
    return this;
  }
  getLocalizedName(stack: ItemStack): string {
    const n = this.getUnlocalizedName(stack);
    return n ? I18n.translateToLocal(n) : '';
  }
  getUnlocalizedName(_stack?: ItemStack): string {
    return 'item.' + this.unlocalizedName;
  }
  setContainerItem(item: Item): this {
    this.containerItem = item;
    return this;
  }
  getContainerItem(): Item | null {
    return this.containerItem;
  }
  hasContainerItem(): boolean {
    return this.containerItem !== null;
  }
  getStatName(): string {
    return I18n.translateToLocal(this.getUnlocalizedName() + '.name');
  }
  getColorFromItemStack(_stack: ItemStack, _pass: number): number {
    return 0xffffff;
  }
  onUpdate(_stack: ItemStack, _world: IWorld, _e: Entity, _slot: number, _held: boolean): void {}
  /** ItemRecord.recordName: the streaming sound a jukebox plays for this item, or null. */
  getRecordName(): string | null {
    return null;
  }
  /** ItemRecord.getRecordTitle: shown as "Now playing: ...". */
  getRecordTitle(): string {
    return 'C418 - ' + this.getRecordName();
  }
  /** Called when the stack is taken out of a crafting or smelting result slot. */
  onCreated(_stack: ItemStack, _world: IWorld, _player: EntityPlayer): void {}
  /** False keeps the container item (bucket, bottle) in the grid instead of the inventory. */
  doesContainerItemLeaveCraftingGrid(_stack: ItemStack): boolean {
    return true;
  }
  isMap(): boolean {
    return false;
  }
  getItemUseAction(_stack: ItemStack): EnumAction {
    return EnumAction.none;
  }
  getMaxItemUseDuration(_stack: ItemStack): number {
    return 0;
  }
  onPlayerStoppedUsing(_stack: ItemStack, _world: IWorld, _player: EntityPlayer, _ticksLeft: number): void {}
  setPotionEffect(e: string): this {
    this.potionEffect = e;
    return this;
  }
  getPotionEffect(): string | null {
    return this.potionEffect;
  }
  /** Whether a brewing stand accepts this item as an ingredient. */
  isPotionIngredient(): boolean {
    return this.potionEffect !== null;
  }
  /** Whether the stack's NBT is synchronised (getShareTag; true for every item in 1.5.2). */
  getShareTag(): boolean {
    return true;
  }
  /** Anvil: whether `material` repairs `stack` (tools and armour accept their crafting material). */
  getIsRepairable(_stack: ItemStack, _material: ItemStack): boolean {
    return false;
  }
  /**
   * What EnumEnchantmentType sees in place of the original's instanceof tests: 'weapon' for
   * swords, 'digger' for tools, 'axe' for axes (a digger that also takes sharpness), 'bow'.
   * Armour is recognised through getArmorInfo().
   */
  getEnchantKind(): 'weapon' | 'digger' | 'axe' | 'bow' | null {
    return null;
  }
  /** func_82788_x: whether an item frame / anvil may rename it (true in 1.5.2). */
  isRenamable(): boolean {
    return true;
  }
  addInformation(_stack: ItemStack, _player: EntityPlayer | null, _lines: string[], _advanced: boolean): void {}
  /** translateNamedKey(getLocalizedName(stack)).trim(), i.e. "<key>.name" from the lang file. */
  getItemDisplayName(stack: ItemStack): string {
    return I18n.translateNamedKey(this.getLocalizedName(stack)).trim();
  }
  hasEffect(stack: ItemStack): boolean {
    return stack.isItemEnchanted();
  }
  getRarity(stack: ItemStack): EnumRarity {
    return stack.isItemEnchanted() ? EnumRarity.rare : EnumRarity.common;
  }
  isItemTool(stack: ItemStack): boolean {
    return this.getItemStackLimit() === 1 && this.isDamageable();
  }
  getItemEnchantability(): number {
    return 0;
  }
  requiresMultipleRenderPasses(): boolean {
    return false;
  }
  getIconFromDamageForRenderPass(damage: number, _pass: number): Icon | null {
    return this.getIconFromDamage(damage);
  }
  getSubItems(id: number, _tab: CreativeTabs, out: ItemStack[]): void {
    out.push(new ItemStack(id, 1, 0));
  }
  getCreativeTab(): CreativeTabs | null {
    return this.tabToDisplayOn;
  }
  setCreativeTab(tab: CreativeTabs): this {
    this.tabToDisplayOn = tab;
    return this;
  }
  registerIcons(reg: IconRegister): void {
    this.itemIcon = reg.registerIcon(this.unlocalizedName);
  }

  /** Ray trace 5 blocks along the player's look (Item.getMovingObjectPositionFromPlayer). */
  protected getMovingObjectPositionFromPlayer(world: RayTracer, player: EntityPlayer, liquids: boolean): MovingObjectPosition | null {
    const f = Math.fround;
    const pitch = player.prevRotationPitch + (player.rotationPitch - player.prevRotationPitch);
    const yaw = player.prevRotationYaw + (player.rotationYaw - player.prevRotationYaw);
    const x = player.prevPosX + (player.posX - player.prevPosX);
    const y = player.prevPosY + (player.posY - player.prevPosY) + 1.62 - player.yOffset;
    const z = player.prevPosZ + (player.posZ - player.prevPosZ);
    const start = new Vec3(x, y, z);
    const deg = f(Math.PI / 180);
    const c = MathHelper.cos(f(-yaw * deg - f(Math.PI)));
    const s = MathHelper.sin(f(-yaw * deg - f(Math.PI)));
    const cp = -MathHelper.cos(f(-pitch * deg));
    const sp = MathHelper.sin(f(-pitch * deg));
    const lx = f(s * cp);
    const lz = f(c * cp);
    const end = start.addVector(lx * 5, sp * 5, lz * 5);
    return world.rayTraceBlocks_do_do(start, end, liquids, !liquids);
  }
}
