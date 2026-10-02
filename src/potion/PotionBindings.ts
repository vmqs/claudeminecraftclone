import type { EntityLiving } from '../entity/EntityLiving';
import { Items } from '../item/Items';
import { Potion } from './Potion';
import { PotionEffect } from './PotionEffect';
import { PotionHelper } from './PotionHelper';

/**
 * Fills the potion hooks of the entity code (`PotionHooks` in src/entity/PotionEffects.ts:
 * splash potions, potion particle colours) from the potion data here. The entity module is
 * picked up with an eager glob so this file builds whether or not that module exists yet; the
 * hooks light up as soon as it does. Imported once through src/item/ItemBindings.ts (from main.ts).
 */
interface PotionHookTable {
  effectsFromDamage: ((damage: number) => PotionEffect[]) | null;
  liquidColorFromDamage: ((damage: number) => number) | null;
  createEffect: ((id: number, duration: number, amplifier: number) => PotionEffect) | null;
  affectEntity: ((potionId: number, thrower: EntityLiving | null, target: EntityLiving, amplifier: number, scale: number) => void) | null;
}

export function installPotionHooks(hooks: PotionHookTable): void {
  hooks.effectsFromDamage = (damage) => Items.potion.getEffects(damage) ?? [];
  hooks.liquidColorFromDamage = (damage) => PotionHelper.getLiquidColor(damage, false);
  hooks.createEffect = (id, duration, amplifier) => new PotionEffect(id, duration, amplifier);
  hooks.affectEntity = (id, thrower, target, amplifier, scale) => Potion.potionTypes[id]?.affectEntity(thrower, target, amplifier, scale);
}

const entityPotionModules = import.meta.glob<{ PotionHooks?: PotionHookTable }>('../entity/PotionEffects.ts', { eager: true });
for (const mod of Object.values(entityPotionModules)) if (mod.PotionHooks) installPotionHooks(mod.PotionHooks);
