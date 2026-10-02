import { HarvestModifiers } from '../block/HarvestModifiers';
import { EnchantmentHelper } from '../enchantment/EnchantmentHelper';
import type { EntityLiving } from '../entity/EntityLiving';
import { SkyHooks } from '../render/sky/SkyHooks';
import { StructureLocator } from '../world/gen/StructureLocator';
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
 */
StructureSearch.locate = (name, x, y, z) => StructureLocator.findClosestStructure(name, x, y, z);

HarvestModifiers.silkTouch = (p) => EnchantmentHelper.getSilkTouchModifier(p);
HarvestModifiers.fortune = (p) => EnchantmentHelper.getFortuneModifier(p);

SkyHooks.potionDuration = (e, id) => {
  const living = e as Partial<EntityLiving>;
  return living.getActivePotionEffect?.(id)?.getDuration() ?? -1;
};

TileEntityFurnace.smeltingResult = (id) => FurnaceRecipes.smelting().getSmeltingResult(id);
