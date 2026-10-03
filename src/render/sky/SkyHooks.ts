import type { Entity } from '../../entity/Entity';

/** 1.5.2 potion ids the sky, fog, lightmap and overlay code reacts to. */
export const SkyPotion = {
  confusion: 9,
  waterBreathing: 13,
  blindness: 15,
  nightVision: 16,
} as const;

/**
 * Hooks for state other ports own, read by the sky code:
 * - `potionDuration(entity, id)`: ticks left of an active potion effect (1.5.2 potion id), or -1
 *   when none. The potion port installs it (EntityLiving.isPotionActive / getActivePotionEffect).
 * - `hasColorModifier`: BossStatus.hasColorModifier, set each frame by a boss renderer that darkens
 *   the world (the Wither, the Ender Dragon); EntityRenderer fades its tint in and clears the flag.
 */
export const SkyHooks = {
  potionDuration: (_e: Entity, _id: number): number => -1,
  hasColorModifier: false,
};

/** Whether the potion effect is active on `e`. */
export function hasPotion(e: Entity, id: number): boolean {
  return SkyHooks.potionDuration(e, id) >= 0;
}
