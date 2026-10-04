import { HarvestModifiers } from '../block/HarvestModifiers';
import { EnchantmentHelper } from '../enchantment/EnchantmentHelper';
import type { EntityLiving } from '../entity/EntityLiving';
import { SkyHooks } from '../render/sky/SkyHooks';
import { StructureLocator } from '../world/gen/StructureLocator';
import { PotionEffect } from '../potion/PotionEffect';
import { TileEntityBeacon } from '../world/tileentity/TileEntityBeacon';
import { TileEntityFurnace } from '../world/tileentity/TileEntityFurnace';
import { FurnaceRecipes } from './crafting/FurnaceRecipes';
import { StructureSearch } from './ItemThrowable';

/**
 * Connects the items to modules of other areas. Imported once by main.ts (not by the workers
 * or the Node tests).
 *
 * - Eyes of ender ask the world-generation code for the nearest stronghold
 *   (StructureLocator.findClosestStructure, asynchronous: the structures live in the worker;
 *   ChunkProviderClient installs the provider).
 * - The entity code's PotionHooks / EnchantmentHooks / item entity factories are filled by
 *   src/entity/ItemHooksInstall.ts (installed from Minecraft via installEntityClientHooks).
 *
 * Cross-slice links that need no glob (all modules exist since the wave-1 merge):
 * - Block.harvestBlock asks EnchantmentHelper for silk touch and fortune (HarvestModifiers).
 * - Furnaces smelt with the FurnaceRecipes table (TileEntityFurnace.smeltingResult).
 * - The sky, fog and lightmap code reads potion effects from EntityLiving (SkyHooks.potionDuration).
 * - Beacons apply their effects as ambient PotionEffects (TileEntityBeacon.applyEffect).
 */
StructureSearch.locate = (name, x, y, z) => StructureLocator.findClosestStructure(name, x, y, z);

HarvestModifiers.silkTouch = (p) => EnchantmentHelper.getSilkTouchModifier(p);
HarvestModifiers.fortune = (p) => EnchantmentHelper.getFortuneModifier(p);

SkyHooks.potionDuration = (e, id) => {
  const living = e as Partial<EntityLiving>;
  return living.getActivePotionEffect?.(id)?.getDuration() ?? -1;
};

TileEntityFurnace.smeltingResult = (id) => FurnaceRecipes.smelting().getSmeltingResult(id);

// Beacons give players in range an ambient effect (fewer, paler swirls) every 80 ticks.
TileEntityBeacon.applyEffect = (p, id, duration, amplifier, ambient) => p.addPotionEffect(new PotionEffect(id, duration, amplifier, ambient));

// The exit portal in the End: the credits and the respawn that keeps everything (end slice).
import '../client/WinGame';
