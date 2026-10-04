import type { JavaRandom } from '../core/JavaRandom';
import type { ItemStack } from '../item/ItemStack';
import { DamageSource } from './DamageSource';
import type { Entity } from './Entity';
import type { EntityLiving } from './EntityLiving';

/**
 * Everything entity code asks of the enchantment code (EnchantmentHelper, EnchantmentThorns,
 * EnchantmentProtection in 1.5.2), in one table. The enchantment code fills it in (see
 * ItemHooksInstall.ts); every entry is optional and an absent entry means "no enchantment".
 */
export interface EnchantmentHookTable {
  /** EnchantmentHelper.getEnchantmentModifierDamage(e.getLastActiveItems(), src): protection points. */
  modifierDamage(e: EntityLiving, src: DamageSource): number;
  /** EnchantmentHelper.getEnchantmentModifierLiving: sharpness / smite / bane bonus damage. */
  modifierLiving(attacker: EntityLiving, target: EntityLiving): number;
  /** EnchantmentHelper.getKnockbackModifier. */
  knockback(attacker: EntityLiving, target: EntityLiving): number;
  /** EnchantmentHelper.getFireAspectModifier. */
  fireAspect(e: EntityLiving): number;
  /** EnchantmentHelper.getRespiration. */
  respiration(e: EntityLiving): number;
  /** EnchantmentHelper.getEfficiencyModifier. */
  efficiency(e: EntityLiving): number;
  /** EnchantmentHelper.getAquaAffinityModifier. */
  aquaAffinity(e: EntityLiving): boolean;
  /** EnchantmentHelper.getLootingModifier. */
  looting(e: EntityLiving): number;
  /** EnchantmentHelper.func_92098_i: the best thorns level worn. */
  thornsLevel(e: EntityLiving): number;
  /** EnchantmentHelper.func_92099_a(Enchantment.thorns, e): the worn stack carrying thorns. */
  thornsItem(e: EntityLiving): ItemStack | null;
  /** Highest fire protection level of e.getLastActiveItems(). */
  fireProtection(e: Entity): number;
  /** Highest blast protection level of e.getLastActiveItems(). */
  blastProtection(e: Entity): number;
  /** EnchantmentHelper.addRandomEnchantment (mob equipment). */
  addRandomEnchantment(rand: JavaRandom, stack: ItemStack, level: number): void;
}

/** The installed enchantment hooks (empty until the enchantment code is present). */
export const EnchantmentHooks: Partial<EnchantmentHookTable> = {};

const f = Math.fround;

/** EnchantmentProtection.func_92093_a: fire protection shortens burning (15% per level). */
export function fireProtectedTicks(e: Entity, ticks: number): number {
  const lvl = EnchantmentHooks.fireProtection?.(e) ?? 0;
  if (lvl > 0) ticks -= Math.floor(f(f(ticks * lvl) * f(0.15)));
  return ticks;
}

/** EnchantmentProtection.func_92092_a: blast protection lowers explosion knockback. */
export function blastProtectedKnockback(e: Entity, v: number): number {
  const lvl = EnchantmentHooks.blastProtection?.(e) ?? 0;
  if (lvl > 0) v -= Math.floor(v * f(lvl * f(0.15)));
  return v;
}

/**
 * EnchantmentThorns.func_92096_a: thorns on `target` may hurt `attacker` (15% per level,
 * 1-4 damage, or level-10 above level 10); the armour wears 3 on a sting, 1 otherwise.
 */
export function applyThorns(attacker: Entity, target: EntityLiving, rand: JavaRandom): void {
  const lvl = EnchantmentHooks.thornsLevel?.(target) ?? 0;
  const stack = EnchantmentHooks.thornsItem?.(target) ?? null;
  if (lvl > 0 && rand.nextFloat() < f(f(0.15) * lvl)) {
    attacker.attackEntityFrom(DamageSource.causeThornsDamage(target), lvl > 10 ? lvl - 10 : 1 + rand.nextInt(4));
    attacker.playSound('damage.thorns', 0.5, 1);
    if (stack) stack.damageItem(3, target);
  } else if (stack) {
    stack.damageItem(1, target);
  }
}
