import type { EntityLiving } from './EntityLiving';

/**
 * What EntityLiving needs from an active potion effect. The PotionEffect class of the potion
 * code (src/potion/) matches it structurally; entities only store, tick, combine and query
 * effects, the effects themselves (Potion.performEffect, instant heal/harm) live there.
 */
export interface PotionEffectLike {
  getPotionID(): number;
  getDuration(): number;
  getAmplifier(): number;
  getIsAmbient(): boolean;
  /** Ticks the effect (performing it when ready); false once it ran out. */
  onUpdate(e: EntityLiving): boolean;
  /** Merges a re-applied effect of the same potion (longer/stronger wins). */
  combine(other: PotionEffectLike): void;
}

/** The 1.5.2 potion IDs (Potion.potionTypes indices) that entity code checks. */
export const PotionId = {
  moveSpeed: 1,
  moveSlowdown: 2,
  digSpeed: 3,
  digSlowdown: 4,
  damageBoost: 5,
  heal: 6,
  harm: 7,
  jump: 8,
  confusion: 9,
  regeneration: 10,
  resistance: 11,
  fireResistance: 12,
  waterBreathing: 13,
  invisibility: 14,
  blindness: 15,
  nightVision: 16,
  hunger: 17,
  weakness: 18,
  poison: 19,
  wither: 20,
} as const;

/** Potion.liquidColor by potion ID (the swirl particles around affected mobs use it). */
const LIQUID_COLORS: readonly number[] = [
  0, 8171462, 5926017, 14270531, 4866583, 9643043, 16262179, 4393481, 7889559, 5578058, 13458603, 10044730, 14981690, 3035801, 8356754, 2039587, 2039713,
  5797459, 4738376, 5149489, 3484199,
];

/** PotionHelper.calcPotionLiquidColor: the average liquid colour, each level counted once. */
export function calcPotionLiquidColor(effects: Iterable<PotionEffectLike>): number {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const f = Math.fround;
  for (const e of effects) {
    const c = LIQUID_COLORS[e.getPotionID()] ?? 0;
    for (let i = 0; i <= e.getAmplifier(); i++) {
      r = f(r + f(((c >> 16) & 255) / 255));
      g = f(g + f(((c >> 8) & 255) / 255));
      b = f(b + f((c & 255) / 255));
      n++;
    }
  }
  if (n === 0) return 3694022;
  return (Math.trunc(f(f(r / n) * 255)) << 16) | (Math.trunc(f(f(g / n) * 255)) << 8) | Math.trunc(f(f(b / n) * 255));
}

/** PotionHelper.func_82817_b: true when every effect is ambient (beacon effects). */
export function areAllPotionsAmbient(effects: Iterable<PotionEffectLike>): boolean {
  for (const e of effects) if (!e.getIsAmbient()) return false;
  return true;
}

/**
 * What entities need from the potion items (ItemPotion / PotionHelper / Potion), installed by
 * the potion code; null entries fall back to "no effects" and the water colour.
 */
export const PotionHooks: {
  /** ItemPotion.getEffects(damage): the effects of a potion item damage value. */
  effectsFromDamage: ((damage: number) => PotionEffectLike[]) | null;
  /** PotionHelper.func_77915_a(damage, false): the liquid colour of a potion item damage value. */
  liquidColorFromDamage: ((damage: number) => number) | null;
  /** new PotionEffect(id, duration, amplifier). */
  createEffect: ((id: number, duration: number, amplifier: number) => PotionEffectLike) | null;
  /** Potion.affectEntity for instant potions (healing, harming) scaled by the splash distance. */
  affectEntity: ((potionId: number, thrower: EntityLiving | null, target: EntityLiving, amplifier: number, scale: number) => void) | null;
} = {
  effectsFromDamage: null,
  liquidColorFromDamage: null,
  createEffect: null,
  affectEntity: null,
};

/** Potion.isInstant: healing and harming apply at once instead of over time. */
export function isInstantPotion(id: number): boolean {
  return id === PotionId.heal || id === PotionId.harm;
}
