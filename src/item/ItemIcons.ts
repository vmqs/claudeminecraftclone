import { ItemIds } from '../block/BlockIds';
import type { EntityLiving } from '../entity/EntityLiving';
import type { Icon } from '../render/texture/Icon';
import { ItemBow, ItemFishingRod } from './ItemBow';
import type { ItemStack } from './ItemStack';

/** What the held-item icon depends on in a player (EntityPlayer.fishEntity and the item in use). */
interface Holder {
  fishEntity?: unknown;
  getItemInUse?(): ItemStack | null;
  getItemInUseCount?(): number;
}

/**
 * EntityLiving.getItemIcon / EntityPlayer.getItemIcon: the icon a held stack is drawn with in
 * render pass `pass`. Players show the empty fishing rod while the hook is out, both layers of
 * multi-pass items, and the bow's drawing frames; other mobs just use the stack's icon.
 */
export function getItemIconForEntity(e: EntityLiving, stack: ItemStack, pass: number): Icon | null {
  if (!e.isPlayerEntity) return stack.getIconIndex();
  const p = e as EntityLiving & Holder;
  const item = stack.getItem();
  if (stack.itemID === ItemIds.fishingRod && p.fishEntity && item instanceof ItemFishingRod) return item.getCastIcon();
  if (item.requiresMultipleRenderPasses()) return item.getIconFromDamageForRenderPass(stack.getItemDamage(), pass);
  if (stack.itemID === ItemIds.bow && item instanceof ItemBow && p.getItemInUse?.()) {
    const drawn = stack.getMaxItemUseDuration() - (p.getItemInUseCount?.() ?? 0);
    if (drawn >= 18) return item.getItemIconForUseDuration(2);
    if (drawn > 13) return item.getItemIconForUseDuration(1);
    if (drawn > 0) return item.getItemIconForUseDuration(0);
  }
  return stack.getIconIndex();
}
