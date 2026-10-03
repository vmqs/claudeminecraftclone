import { Item } from '../../item/Item';
import { getAllCreativeItems } from '../../item/Items';
import type { ItemStack } from '../../item/ItemStack';

/**
 * Which stacks a creative guest may put in its inventory (Packet107CreativeSetSlot): an item
 * and damage the creative inventory offers, a damaged tool or armour piece of such an item, or
 * one of the few stacks only survival play makes (maps, brewed potions, written books, rockets,
 * silk-touched huge mushrooms, the dragon egg). Technical blocks (moving pistons, portals, fluids,
 * crop and door blocks ...) are refused: 1.5.2's server took any item id, but here the host's
 * world and renderer would meet blocks that never exist as items.
 */
let offered: Set<number> | null = null;

const key = (id: number, damage: number) => id * 65536 + (damage & 0xffff);

/** Items any damage value of which is fine: maps (map ids) and potions (brewing bits). */
const ANY_DAMAGE = new Set([358, 373]);
/** Survival-only stacks with damage 0. */
const SURVIVAL_ONLY = new Set([99, 100, 122, 387, 401]);

function offeredStacks(): Set<number> {
  if (!offered) {
    offered = new Set();
    for (const s of getAllCreativeItems()) offered.add(key(s.itemID, s.getItemDamage()));
  }
  return offered;
}

export function isAllowedCreativeStack(s: ItemStack): boolean {
  const item = Item.itemsList[s.itemID];
  if (!item || s.stackSize < 1 || s.stackSize > 64) return false;
  const damage = s.getItemDamage();
  if (ANY_DAMAGE.has(s.itemID)) return damage >= 0;
  if (offeredStacks().has(key(s.itemID, damage))) return true;
  if (SURVIVAL_ONLY.has(s.itemID)) return damage === 0;
  // A worn tool or armour piece of an item the creative inventory offers.
  return item.isDamageable() && damage > 0 && damage <= item.getMaxDamage() && offeredStacks().has(key(s.itemID, 0));
}
