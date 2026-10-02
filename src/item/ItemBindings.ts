import '../potion/PotionBindings';
import { StructureSearch } from './ItemThrowable';

/**
 * Connects the items to modules of other areas that may not exist yet: each is picked up with
 * an eager glob, so this builds either way and the link lights up once the module is there.
 * Imported once by main.ts (not by the workers or the Node tests).
 *
 * - Eyes of ender ask the world-generation code for the nearest stronghold
 *   (StructureLocator.findClosestStructure, asynchronous: the structures live in the worker).
 * - The potion data fills the entity code's PotionHooks (src/potion/PotionBindings.ts).
 */
type Locator = { findClosestStructure(name: string, x: number, y: number, z: number): Promise<[number, number, number] | null> };

const locatorModules = import.meta.glob<{ StructureLocator?: Locator }>('../world/gen/StructureLocator.ts', { eager: true });
for (const mod of Object.values(locatorModules)) {
  const locator = mod.StructureLocator;
  if (locator) StructureSearch.locate = (name, x, y, z) => locator.findClosestStructure(name, x, y, z);
}
