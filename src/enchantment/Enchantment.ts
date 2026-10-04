import { I18n } from '../core/I18n';
import { MathHelper } from '../core/MathHelper';
import { DamageSource } from '../entity/DamageSource';
import type { EntityLiving, EnumCreatureAttribute } from '../entity/EntityLiving';
import type { Item } from '../item/Item';
import type { ItemStack } from '../item/ItemStack';

const f = Math.fround;
const UNDEAD = 1 as EnumCreatureAttribute;
const ARTHROPOD = 2 as EnumCreatureAttribute;
const SHEARS_ID = 359;

/**
 * Which items an enchantment fits (EnumEnchantmentType). Items say what they are through
 * Item.getEnchantKind() ('weapon' swords, 'digger' tools, 'axe' axes, 'bow') and getArmorInfo()
 * (armour slot), which stands in for the original's instanceof checks.
 */
export class EnumEnchantmentType {
  static readonly all = new EnumEnchantmentType('all');
  static readonly armor = new EnumEnchantmentType('armor');
  static readonly armor_feet = new EnumEnchantmentType('armor_feet');
  static readonly armor_legs = new EnumEnchantmentType('armor_legs');
  static readonly armor_torso = new EnumEnchantmentType('armor_torso');
  static readonly armor_head = new EnumEnchantmentType('armor_head');
  static readonly weapon = new EnumEnchantmentType('weapon');
  static readonly digger = new EnumEnchantmentType('digger');
  static readonly bow = new EnumEnchantmentType('bow');

  private constructor(readonly name: string) {}

  canEnchantItem(item: Item): boolean {
    if (this === EnumEnchantmentType.all) return true;
    const armor = item.getArmorInfo();
    if (armor) {
      if (this === EnumEnchantmentType.armor) return true;
      switch (armor.armorType) {
        case 0:
          return this === EnumEnchantmentType.armor_head;
        case 2:
          return this === EnumEnchantmentType.armor_legs;
        case 1:
          return this === EnumEnchantmentType.armor_torso;
        case 3:
          return this === EnumEnchantmentType.armor_feet;
        default:
          return false;
      }
    }
    const kind = item.getEnchantKind();
    if (kind === 'weapon') return this === EnumEnchantmentType.weapon;
    if (kind === 'digger' || kind === 'axe') return this === EnumEnchantmentType.digger;
    if (kind === 'bow') return this === EnumEnchantmentType.bow;
    return false;
  }
}

/** An enchantment type (Enchantment): id, weight for random enchanting, item type, levels and names. */
export class Enchantment {
  static readonly enchantmentsList: (Enchantment | null)[] = new Array(256).fill(null);

  protected name = '';

  protected constructor(
    readonly effectId: number,
    private readonly weight: number,
    public type: EnumEnchantmentType,
  ) {
    if (Enchantment.enchantmentsList[effectId]) throw new Error('Duplicate enchantment id!');
    Enchantment.enchantmentsList[effectId] = this;
  }

  getWeight(): number {
    return this.weight;
  }
  getMinLevel(): number {
    return 1;
  }
  getMaxLevel(): number {
    return 1;
  }
  getMinEnchantability(level: number): number {
    return 1 + level * 10;
  }
  getMaxEnchantability(level: number): number {
    return this.getMinEnchantability(level) + 5;
  }
  /** Armour points this enchantment adds against `src` (protection enchantments). */
  calcModifierDamage(_level: number, _src: DamageSource): number {
    return 0;
  }
  /** Extra damage dealt to `target` (sharpness, smite, bane of arthropods). */
  calcModifierLiving(_level: number, _target: EntityLiving): number {
    return 0;
  }
  canApplyTogether(o: Enchantment): boolean {
    return this !== o;
  }
  setName(name: string): this {
    this.name = name;
    return this;
  }
  /** The lang key, e.g. "enchantment.digging". */
  getName(): string {
    return 'enchantment.' + this.name;
  }
  /** "Efficiency IV": the name plus the "enchantment.level.N" numeral. */
  getTranslatedName(level: number): string {
    return I18n.translateToLocal(this.getName()) + ' ' + I18n.translateToLocal('enchantment.level.' + level);
  }
  canApply(stack: ItemStack): boolean {
    return this.type.canEnchantItem(stack.getItem());
  }

  // Registered below in 1.5.2 order; `field_92090_c` (every non-null entry) follows.
  static protection: Enchantment;
  static fireProtection: Enchantment;
  static featherFalling: Enchantment;
  static blastProtection: Enchantment;
  static projectileProtection: Enchantment;
  static respiration: Enchantment;
  static aquaAffinity: Enchantment;
  static thorns: Enchantment;
  static sharpness: Enchantment;
  static smite: Enchantment;
  static baneOfArthropods: Enchantment;
  static knockback: Enchantment;
  static fireAspect: Enchantment;
  static looting: Enchantment;
  static efficiency: Enchantment;
  static silkTouch: Enchantment;
  static unbreaking: Enchantment;
  static fortune: Enchantment;
  static power: Enchantment;
  static punch: Enchantment;
  static flame: Enchantment;
  static infinity: Enchantment;
  /** Every registered enchantment in id order (Enchantment.field_92090_c). */
  static enchantmentsBookList: Enchantment[];
}

/** Protection, fire/blast/projectile protection and feather falling (EnchantmentProtection). */
export class EnchantmentProtection extends Enchantment {
  private static readonly protectionName = ['all', 'fire', 'fall', 'explosion', 'projectile'];
  private static readonly baseEnchantability = [1, 10, 5, 5, 3];
  private static readonly levelEnchantability = [11, 8, 6, 8, 6];
  private static readonly thresholdEnchantability = [20, 12, 10, 12, 15];

  constructor(
    id: number,
    weight: number,
    readonly protectionType: number,
  ) {
    super(id, weight, EnumEnchantmentType.armor);
    if (protectionType === 2) this.type = EnumEnchantmentType.armor_feet;
  }
  override getMinEnchantability(level: number): number {
    return EnchantmentProtection.baseEnchantability[this.protectionType] + (level - 1) * EnchantmentProtection.levelEnchantability[this.protectionType];
  }
  override getMaxEnchantability(level: number): number {
    return this.getMinEnchantability(level) + EnchantmentProtection.thresholdEnchantability[this.protectionType];
  }
  override getMaxLevel(): number {
    return 4;
  }
  override calcModifierDamage(level: number, src: DamageSource): number {
    if (src.canHarmInCreative()) return 0;
    const v = f((6 + level * level) / 3);
    if (this.protectionType === 0) return MathHelper.floor_float(f(v * f(0.75)));
    if (this.protectionType === 1 && src.isFireDamage()) return MathHelper.floor_float(f(v * f(1.25)));
    if (this.protectionType === 2 && src === DamageSource.fall) return MathHelper.floor_float(f(v * f(2.5)));
    if (this.protectionType === 3 && src.isExplosion()) return MathHelper.floor_float(f(v * f(1.5)));
    return this.protectionType === 4 && src.isProjectile() ? MathHelper.floor_float(f(v * f(1.5))) : 0;
  }
  override getName(): string {
    return 'enchantment.protect.' + EnchantmentProtection.protectionName[this.protectionType];
  }
  override canApplyTogether(o: Enchantment): boolean {
    if (o instanceof EnchantmentProtection) return o.protectionType === this.protectionType ? false : this.protectionType === 2 || o.protectionType === 2;
    return super.canApplyTogether(o);
  }
  /** Fire protection shortens burning: `ticks` minus 15% per level of the best piece. */
  static getFireTimeForEntity(armour: readonly (ItemStack | null)[], ticks: number): number {
    const lvl = maxLevel(Enchantment.fireProtection.effectId, armour);
    if (lvl > 0) ticks -= MathHelper.floor_float(f(f(ticks) * f(lvl) * f(0.15)));
    return ticks;
  }
  /** Blast protection reduces explosion knockback. */
  static getExplosionKnockback(armour: readonly (ItemStack | null)[], v: number): number {
    const lvl = maxLevel(Enchantment.blastProtection.effectId, armour);
    if (lvl > 0) v -= MathHelper.floor_double(v * f(lvl * f(0.15)));
    return v;
  }
}

class EnchantmentSimple extends Enchantment {
  constructor(
    id: number,
    weight: number,
    type: EnumEnchantmentType,
    name: string,
    private readonly maxLevel: number,
    private readonly minEnch: (lvl: number) => number,
    private readonly maxEnch: (lvl: number, min: number) => number,
  ) {
    super(id, weight, type);
    this.setName(name);
  }
  override getMaxLevel(): number {
    return this.maxLevel;
  }
  override getMinEnchantability(level: number): number {
    return this.minEnch(level);
  }
  override getMaxEnchantability(level: number): number {
    return this.maxEnch(level, this.getMinEnchantability(level));
  }
}

/** Sharpness, smite and bane of arthropods (EnchantmentDamage). */
export class EnchantmentDamage extends Enchantment {
  private static readonly protectionName = ['all', 'undead', 'arthropods'];
  private static readonly baseEnchantability = [1, 5, 5];
  private static readonly levelEnchantability = [11, 8, 8];
  private static readonly thresholdEnchantability = [20, 20, 20];

  constructor(
    id: number,
    weight: number,
    readonly damageType: number,
  ) {
    super(id, weight, EnumEnchantmentType.weapon);
  }
  override getMinEnchantability(level: number): number {
    return EnchantmentDamage.baseEnchantability[this.damageType] + (level - 1) * EnchantmentDamage.levelEnchantability[this.damageType];
  }
  override getMaxEnchantability(level: number): number {
    return this.getMinEnchantability(level) + EnchantmentDamage.thresholdEnchantability[this.damageType];
  }
  override getMaxLevel(): number {
    return 5;
  }
  override calcModifierLiving(level: number, target: EntityLiving): number {
    if (this.damageType === 0) return MathHelper.floor_float(f(level * f(2.75)));
    if (this.damageType === 1 && target.getCreatureAttribute() === UNDEAD) return MathHelper.floor_float(f(level * f(4.5)));
    return this.damageType === 2 && target.getCreatureAttribute() === ARTHROPOD ? MathHelper.floor_float(f(level * f(4.5))) : 0;
  }
  override getName(): string {
    return 'enchantment.damage.' + EnchantmentDamage.protectionName[this.damageType];
  }
  override canApplyTogether(o: Enchantment): boolean {
    return !(o instanceof EnchantmentDamage);
  }
  override canApply(stack: ItemStack): boolean {
    return stack.getItem().getEnchantKind() === 'axe' ? true : super.canApply(stack);
  }
}

/** Thorns: also fits any armour piece through the anvil. */
class EnchantmentThorns extends EnchantmentSimple {
  override canApply(stack: ItemStack): boolean {
    return stack.getItem().getArmorInfo() !== null ? true : super.canApply(stack);
  }
}

/** Looting / fortune (EnchantmentLootBonus): exclusive with silk touch. */
class EnchantmentLootBonus extends EnchantmentSimple {
  override canApplyTogether(o: Enchantment): boolean {
    return super.canApplyTogether(o) && o.effectId !== Enchantment.silkTouch.effectId;
  }
}

/** Efficiency (EnchantmentDigging): shears accept it too. */
class EnchantmentDigging extends EnchantmentSimple {
  override canApply(stack: ItemStack): boolean {
    return stack.getItem().itemID === SHEARS_ID ? true : super.canApply(stack);
  }
}

/** Silk touch (EnchantmentUntouching): exclusive with fortune; shears accept it. */
class EnchantmentUntouching extends EnchantmentSimple {
  override canApplyTogether(o: Enchantment): boolean {
    return super.canApplyTogether(o) && o.effectId !== Enchantment.fortune.effectId;
  }
  override canApply(stack: ItemStack): boolean {
    return stack.getItem().itemID === SHEARS_ID ? true : super.canApply(stack);
  }
}

/** Unbreaking (EnchantmentDurability): fits anything damageable. */
export class EnchantmentDurability extends EnchantmentSimple {
  override canApply(stack: ItemStack): boolean {
    return stack.isItemStackDamageable() ? true : super.canApply(stack);
  }
  /** Whether unbreaking cancels one point of wear (armour only benefits 40% of the time). */
  static negateDamage(stack: ItemStack, level: number, rand: { nextFloat(): number; nextInt(n: number): number }): boolean {
    return stack.getItem().getArmorInfo() !== null && rand.nextFloat() < f(0.6) ? false : rand.nextInt(level + 1) > 0;
  }
}

const T = EnumEnchantmentType;
const plus = (k: number) => (_lvl: number, min: number) => min + k;
const basePlus = (k: number) => (lvl: number) => 1 + lvl * 10 + k;
Enchantment.protection = new EnchantmentProtection(0, 10, 0);
Enchantment.fireProtection = new EnchantmentProtection(1, 5, 1);
Enchantment.featherFalling = new EnchantmentProtection(2, 5, 2);
Enchantment.blastProtection = new EnchantmentProtection(3, 2, 3);
Enchantment.projectileProtection = new EnchantmentProtection(4, 5, 4);
Enchantment.respiration = new EnchantmentSimple(5, 2, T.armor_head, 'oxygen', 3, (l) => 10 * l, plus(30));
Enchantment.aquaAffinity = new EnchantmentSimple(6, 2, T.armor_head, 'waterWorker', 1, () => 1, plus(40));
// Thorns, knockback, fire aspect, looting, efficiency, silk touch and unbreaking add 50 to the
// *base* class minimum (1 + 10 * level), not to their own minimum.
Enchantment.thorns = new EnchantmentThorns(7, 1, T.armor_torso, 'thorns', 3, (l) => 10 + 20 * (l - 1), (l) => basePlus(50)(l));
Enchantment.sharpness = new EnchantmentDamage(16, 10, 0);
Enchantment.smite = new EnchantmentDamage(17, 5, 1);
Enchantment.baneOfArthropods = new EnchantmentDamage(18, 5, 2);
Enchantment.knockback = new EnchantmentSimple(19, 5, T.weapon, 'knockback', 2, (l) => 5 + 20 * (l - 1), (l) => basePlus(50)(l));
Enchantment.fireAspect = new EnchantmentSimple(20, 2, T.weapon, 'fire', 2, (l) => 10 + 20 * (l - 1), (l) => basePlus(50)(l));
Enchantment.looting = new EnchantmentLootBonus(21, 2, T.weapon, 'lootBonus', 3, (l) => 15 + (l - 1) * 9, (l) => basePlus(50)(l));
Enchantment.efficiency = new EnchantmentDigging(32, 10, T.digger, 'digging', 5, (l) => 1 + 10 * (l - 1), (l) => basePlus(50)(l));
Enchantment.silkTouch = new EnchantmentUntouching(33, 1, T.digger, 'untouching', 1, () => 15, (l) => basePlus(50)(l));
Enchantment.unbreaking = new EnchantmentDurability(34, 5, T.digger, 'durability', 3, (l) => 5 + (l - 1) * 8, (l) => basePlus(50)(l));
Enchantment.fortune = new EnchantmentLootBonus(35, 2, T.digger, 'lootBonusDigger', 3, (l) => 15 + (l - 1) * 9, (l) => basePlus(50)(l));
Enchantment.power = new EnchantmentSimple(48, 10, T.bow, 'arrowDamage', 5, (l) => 1 + (l - 1) * 10, plus(15));
Enchantment.punch = new EnchantmentSimple(49, 2, T.bow, 'arrowKnockback', 2, (l) => 12 + (l - 1) * 20, plus(25));
Enchantment.flame = new EnchantmentSimple(50, 2, T.bow, 'arrowFire', 1, () => 20, () => 50);
Enchantment.infinity = new EnchantmentSimple(51, 1, T.bow, 'arrowInfinite', 1, () => 20, () => 50);
Enchantment.enchantmentsBookList = Enchantment.enchantmentsList.filter((e): e is Enchantment => e !== null);

/** NBT "ench" / "StoredEnchantments" entries. */
export interface EnchantmentTag {
  id: number;
  lvl: number;
}

function maxLevel(id: number, stacks: readonly (ItemStack | null)[]): number {
  let best = 0;
  for (const s of stacks) {
    const l = getEnchantmentLevelFromTag(id, s);
    if (l > best) best = l;
  }
  return best;
}

function getEnchantmentLevelFromTag(id: number, stack: ItemStack | null): number {
  const list = stack?.getEnchantmentTagList();
  if (!list) return 0;
  for (const t of list) if (t.id === id) return t.lvl;
  return 0;
}
