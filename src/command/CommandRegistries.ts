/**
 * Registries that belong to other parts of the game (potions, enchantments), found by their
 * MCP module paths at build time. While a module does not exist the lookups return nothing and
 * the commands answer as for an unknown id.
 */
type AnyModule = Record<string, unknown>;

const potionModule = Object.values(import.meta.glob<AnyModule>('../potion/Potion.ts', { eager: true }))[0];
const potionEffectModule = Object.values(import.meta.glob<AnyModule>('../potion/PotionEffect.ts', { eager: true }))[0];
const enchantmentModule = Object.values(import.meta.glob<AnyModule>('../enchantment/Enchantment.ts', { eager: true }))[0];

/** The parts of Potion the commands use. */
export interface PotionLike {
  getName(): string;
  isInstant(): boolean;
}

/** The parts of Enchantment the commands use. */
export interface EnchantmentLike {
  effectId?: number;
  canApply(stack: unknown): boolean;
  getMinLevel(): number;
  getMaxLevel(): number;
  canApplyTogether(other: EnchantmentLike): boolean;
  getTranslatedName(level: number): string;
}

export type PotionEffectFactory = new (id: number, duration: number, amplifier: number) => { getEffectName(): string };

/** Potion.potionTypes, or an empty table. */
export function potionTypes(): (PotionLike | null)[] {
  const cls = potionModule?.Potion as { potionTypes?: (PotionLike | null)[] } | undefined;
  return cls?.potionTypes ?? [];
}

export function potionEffectClass(): PotionEffectFactory | null {
  return (potionEffectModule?.PotionEffect as PotionEffectFactory | undefined) ?? null;
}

/** Enchantment.enchantmentsList, or an empty table. */
export function enchantmentsList(): (EnchantmentLike | null)[] {
  const cls = enchantmentModule?.Enchantment as { enchantmentsList?: (EnchantmentLike | null)[] } | undefined;
  return cls?.enchantmentsList ?? [];
}
