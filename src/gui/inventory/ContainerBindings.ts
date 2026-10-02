import { isSplash } from '../../item/ItemPotion';
import { Items } from '../../item/Items';
import { applyPotionEffect, PotionEffect } from '../../potion/PotionEffect';
import { PotionHelper } from '../../potion/PotionHelper';
import { TileEntityBeacon } from '../../world/tileentity/TileEntityBeacon';
import { TileEntityBrewingStand } from '../../world/tileentity/TileEntityBrewingStand';

/**
 * Plugs the potion rules into the container tile entities, which cannot import the item code
 * themselves: the brewing stand rewrites bottle damage values with PotionHelper ingredients and
 * compares effect lists through ItemPotion's cache (identical damage values share one list, as
 * the original's identity checks expect); the beacon hands out its effects as ambient potion
 * effects on the players in range.
 *
 * Imported once at start-up (main.ts) and by the Node tests.
 */
TileEntityBrewingStand.brewingRules = {
  applyIngredient: (damage, effect) => PotionHelper.applyIngredient(damage, effect),
  getEffects: (damage) => Items.potion.getEffects(damage),
  isSplash,
};

TileEntityBeacon.applyEffect = (player, potionId, duration, amplifier, ambient) => {
  applyPotionEffect(player, new PotionEffect(potionId, duration, amplifier, ambient));
};
