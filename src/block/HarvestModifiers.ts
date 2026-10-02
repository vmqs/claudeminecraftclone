import type { EntityPlayer } from '../entity/EntityPlayer';

/**
 * Enchantment queries Block.harvestBlock makes about the harvesting player (EnchantmentHelper's
 * silk touch and fortune modifiers in the original). They answer "none" until the enchantment
 * code replaces them, e.g. `HarvestModifiers.silkTouch = (p) => EnchantmentHelper.getSilkTouchModifier(p)`.
 */
export const HarvestModifiers = {
  silkTouch: (_p: EntityPlayer): boolean => false,
  fortune: (_p: EntityPlayer): number => 0,
};

/** Optional survival-side player methods; called only when the player class provides them. */
interface HarvestingPlayer {
  addExhaustion?(amount: number): void;
  addStat?(stat: string, amount: number): void;
}

/** The statistic and exhaustion every harvest adds (StatList.mineBlockStatArray + 0.025 food exhaustion). */
export function noteHarvest(p: EntityPlayer, blockID: number, exhaustion: boolean): void {
  const h = p as unknown as HarvestingPlayer;
  h.addStat?.(`mineBlock.${blockID}`, 1);
  if (exhaustion) h.addExhaustion?.(0.025);
}
