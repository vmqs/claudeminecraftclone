import { ItemIds } from '../block/BlockIds';
import type { JavaRandom } from '../core/JavaRandom';
import { Item } from '../item/Item';
import type { ItemStack } from '../item/ItemStack';
import type { World } from '../world/World';
import type { DamageSource } from './DamageSource';
import { EnchantmentHooks } from './EnchantmentHooks';
import type { Entity } from './Entity';
import { EntityArrow } from './EntityArrow';
import { EntityBoat } from './EntityBoat';
import { EntityEgg } from './EntityEgg';
import { EntityEnderEye } from './EntityEnderEye';
import { EntityEnderPearl } from './EntityEnderPearl';
import { EntityExpBottle } from './EntityExpBottle';
import { EntityFireworkRocket } from './EntityFireworkRocket';
import { EntityFishHook } from './EntityFishHook';
import { EntityItemFrame } from './EntityItemFrame';
import type { EntityLiving } from './EntityLiving';
import { EntityMinecart } from './EntityMinecart';
import { EntityPainting } from './EntityPainting';
import type { EntityPlayer } from './EntityPlayer';
import { EntityPotion } from './EntityPotion';
import { EntitySnowball } from './EntitySnowball';
import { type PotionEffectLike, PotionHooks } from './PotionEffects';

/*
 * Connects the entity layer to the item, enchantment and potion code (which live in other
 * parts of the tree and are built separately): the item code's entity factory table gets the
 * real constructors, and EnchantmentHooks / PotionHooks get the enchantment and potion
 * helpers. Each install function is typed structurally, so it can equally be called with
 * static imports; installItemHooks() finds the modules with import.meta.glob, so this file
 * builds and runs whether or not they exist yet (missing modules are simply skipped).
 */

type Fn<A extends unknown[], R> = (...args: A) => R;

/** ItemEntityFactories of src/item/ItemEntitySpawning.ts. */
export interface ItemEntityFactoryTable {
  throwable: Map<string, Fn<[World, EntityLiving, ItemStack], Entity | null>>;
  arrow: Fn<[World, EntityLiving, number], Entity | null> | null;
  fishHook: Fn<[World, EntityPlayer], Entity | null> | null;
  firework: Fn<[World, number, number, number, ItemStack], Entity | null> | null;
  enderEye: Fn<[World, number, number, number], Entity | null> | null;
  hanging: Map<string, Fn<[World, number, number, number, number], Entity | null>>;
  minecart: Fn<[World, number, number, number, number], Entity | null> | null;
  boat: Fn<[World, number, number, number], Entity | null> | null;
}

/** Registers the 1.5.2 constructors items use to throw, shoot, cast and place entities. */
export function installItemEntityFactories(t: ItemEntityFactoryTable): void {
  t.throwable.set('Snowball', (w, p) => new EntitySnowball(w, p));
  // 1.5.2 eggs have no EntityList name; the item code asks for them as 'ThrownEgg'.
  t.throwable.set('ThrownEgg', (w, p) => new EntityEgg(w, p));
  t.throwable.set('Egg', (w, p) => new EntityEgg(w, p));
  t.throwable.set('ThrownEnderpearl', (w, p) => new EntityEnderPearl(w, p));
  t.throwable.set('ThrownExpBottle', (w, p) => new EntityExpBottle(w, p));
  t.throwable.set('ThrownPotion', (w, p, stack) => new EntityPotion(w, p, stack.copy()));
  t.arrow = (w, shooter, velocity) => new EntityArrow(w, shooter, velocity);
  t.fishHook = (w, player) => new EntityFishHook(w, player);
  t.firework = (w, x, y, z, stack) => new EntityFireworkRocket(w, x, y, z, stack);
  t.enderEye = (w, x, y, z) => new EntityEnderEye(w, x, y, z);
  t.hanging.set('Painting', (w, x, y, z, dir) => new EntityPainting(w, x, y, z, dir));
  t.hanging.set('ItemFrame', (w, x, y, z, dir) => new EntityItemFrame(w, x, y, z, dir));
  t.minecart = (w, x, y, z, type) => EntityMinecart.createMinecart(w, x, y, z, type);
  t.boat = (w, x, y, z) => new EntityBoat(w, x, y, z);
}

/** The EnchantmentHelper functions the hooks use (src/enchantment/EnchantmentHelper.ts). */
export interface EnchantmentHelperLike {
  getEnchantmentModifierDamage(stacks: readonly (ItemStack | null)[], src: DamageSource): number;
  getEnchantmentModifierLiving(attacker: EntityLiving, target: EntityLiving): number;
  getKnockbackModifier(attacker: EntityLiving, target: EntityLiving): number;
  getFireAspectModifier(e: EntityLiving): number;
  getRespiration(e: EntityLiving): number;
  getEfficiencyModifier(e: EntityLiving): number;
  getAquaAffinityModifier(e: EntityLiving): boolean;
  getLootingModifier(e: EntityLiving): number;
  getThornsModifier(e: EntityLiving): number;
  getEnchantedItem(ench: never, e: EntityLiving): ItemStack | null;
  getMaxEnchantmentLevel(id: number, stacks: readonly (ItemStack | null)[] | null): number;
  addRandomEnchantment(rand: JavaRandom, stack: ItemStack, level: number): ItemStack;
}

/** The Enchantment statics the hooks use (src/enchantment/Enchantment.ts). */
export interface EnchantmentStatics {
  thorns: { effectId: number };
  fireProtection: { effectId: number };
  blastProtection: { effectId: number };
}

/** Fills EnchantmentHooks from the enchantment code. */
export function installEnchantmentHooks(h: EnchantmentHelperLike, ench: EnchantmentStatics): void {
  const armour = (e: Entity) => e.getLastActiveItems();
  EnchantmentHooks.modifierDamage = (e, src) => h.getEnchantmentModifierDamage(e.getLastActiveItems(), src);
  EnchantmentHooks.modifierLiving = (a, t) => h.getEnchantmentModifierLiving(a, t);
  EnchantmentHooks.knockback = (a, t) => h.getKnockbackModifier(a, t);
  EnchantmentHooks.fireAspect = (e) => h.getFireAspectModifier(e);
  EnchantmentHooks.respiration = (e) => h.getRespiration(e);
  EnchantmentHooks.efficiency = (e) => h.getEfficiencyModifier(e);
  EnchantmentHooks.aquaAffinity = (e) => h.getAquaAffinityModifier(e);
  EnchantmentHooks.looting = (e) => h.getLootingModifier(e);
  EnchantmentHooks.thornsLevel = (e) => h.getThornsModifier(e);
  EnchantmentHooks.thornsItem = (e) => h.getEnchantedItem(ench.thorns as never, e);
  EnchantmentHooks.fireProtection = (e) => h.getMaxEnchantmentLevel(ench.fireProtection.effectId, armour(e));
  EnchantmentHooks.blastProtection = (e) => h.getMaxEnchantmentLevel(ench.blastProtection.effectId, armour(e));
  EnchantmentHooks.addRandomEnchantment = (rand, stack, level) => void h.addRandomEnchantment(rand, stack, level);
}

/** What the hooks need from the potion code (Potion.potionTypes, new PotionEffect). */
export interface PotionStatics {
  potionTypes: readonly ({ affectEntity(thrower: EntityLiving | null, target: EntityLiving, amplifier: number, scale: number): void } | null)[];
}
export type PotionEffectConstructor = new (id: number, duration: number, amplifier: number) => PotionEffectLike;

/** The potion item (Item.potion): its effects and liquid colour. */
interface PotionItemLike {
  getEffects(stack: ItemStack): PotionEffectLike[] | null;
  getColorFromDamage(damage: number): number;
}

/** Fills PotionHooks from the potion code; the potion item is looked up when needed. */
export function installPotionHooks(potion: PotionStatics, effect: PotionEffectConstructor): void {
  const item = (): Partial<PotionItemLike> => (Item.itemsList[ItemIds.potion] ?? {}) as Partial<PotionItemLike>;
  PotionHooks.createEffect = (id, duration, amplifier) => new effect(id, duration, amplifier);
  PotionHooks.affectEntity = (id, thrower, target, amplifier, scale) => potion.potionTypes[id]?.affectEntity(thrower, target, amplifier, scale);
  PotionHooks.effectsOf = (stack) => item().getEffects?.(stack) ?? null;
  PotionHooks.liquidColorFromDamage = (damage) => item().getColorFromDamage?.(damage) ?? 3694022;
}

type Module = Record<string, unknown>;

/** The other parts' modules, when they exist in this build (Vite resolves the glob at build time). */
function findModules(): Map<string, Module> {
  let found: Record<string, Module> = {};
  try {
    found = import.meta.glob<Module>(
      ['../item/ItemEntitySpawning.ts', '../enchantment/Enchantment.ts', '../enchantment/EnchantmentHelper.ts', '../potion/Potion.ts', '../potion/PotionEffect.ts'],
      { eager: true },
    );
  } catch {
    // Not built by Vite (Node checks): nothing to connect.
  }
  const out = new Map<string, Module>();
  for (const [path, m] of Object.entries(found)) out.set(path.slice(path.lastIndexOf('/') + 1).replace(/\.ts$/, ''), m);
  return out;
}

let installed = false;

/** Connects whatever item, enchantment and potion code this build contains (once). */
export function installItemHooks(): void {
  if (installed) return;
  installed = true;
  const mods = findModules();
  const table = mods.get('ItemEntitySpawning')?.ItemEntityFactories as ItemEntityFactoryTable | undefined;
  if (table?.throwable instanceof Map && table.hanging instanceof Map) installItemEntityFactories(table);
  const helper = mods.get('EnchantmentHelper')?.EnchantmentHelper as EnchantmentHelperLike | undefined;
  const ench = mods.get('Enchantment')?.Enchantment as EnchantmentStatics | undefined;
  if (helper && ench && typeof helper.getEnchantmentModifierDamage === 'function') installEnchantmentHooks(helper, ench);
  const potion = mods.get('Potion')?.Potion as PotionStatics | undefined;
  const effect = mods.get('PotionEffect')?.PotionEffect as PotionEffectConstructor | undefined;
  if (potion && Array.isArray(potion.potionTypes) && typeof effect === 'function') installPotionHooks(potion, effect);
}
