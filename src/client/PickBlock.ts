import { Block } from '../block/Block';
import { ItemIds } from '../block/BlockIds';
import { EnumMovingObjectType, type MovingObjectPosition } from '../core/MovingObjectPosition';
import { EntityBoat } from '../entity/EntityBoat';
import { EntityItemFrame } from '../entity/EntityItemFrame';
import { EntityList } from '../entity/EntityList';
import { EntityMinecart } from '../entity/EntityMinecart';
import { EntityPainting } from '../entity/EntityPainting';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { Item } from '../item/Item';
import type { World } from '../world/World';

/** What pick block selects: an item id, its damage, and whether the damage must match. */
export interface PickedItem {
  id: number;
  damage: number;
  matchDamage: boolean;
}

/**
 * The item the middle mouse button picks (Minecraft.clickMiddleMouseButton): the block's
 * idPicked/getDamageValue, or in Creative also an entity's item (painting, item frame or its
 * framed item, minecart kind, boat, the mob's spawn egg). Null when there is nothing to pick.
 */
export function pickedItem(w: World, mop: MovingObjectPosition | null, creative: boolean): PickedItem | null {
  if (!mop) return null;
  if (mop.typeOfHit === EnumMovingObjectType.TILE) {
    const block = Block.blocksList[w.getBlockId(mop.blockX, mop.blockY, mop.blockZ)];
    if (!block) return null;
    const id = block.idPicked(w, mop.blockX, mop.blockY, mop.blockZ);
    if (id === 0 || !Item.itemsList[id]) return null;
    const src = id < 256 && !block.isFlowerPot() ? id : block.blockID;
    const damage = Block.blocksList[src]?.getDamageValue(w, mop.blockX, mop.blockY, mop.blockZ) ?? 0;
    return { id, damage, matchDamage: Item.itemsList[id]!.getHasSubtypes() };
  }
  const e = mop.entityHit;
  if (mop.typeOfHit !== EnumMovingObjectType.ENTITY || !e || !creative) return null;
  if (e instanceof EntityPainting) return { id: ItemIds.painting, damage: 0, matchDamage: false };
  if (e instanceof EntityItemFrame) {
    const shown = e.getDisplayedItem();
    return shown ? { id: shown.itemID, damage: shown.getItemDamage(), matchDamage: true } : { id: ItemIds.itemFrame, damage: 0, matchDamage: false };
  }
  if (e instanceof EntityMinecart) {
    const ids: Record<number, number> = { 1: ItemIds.minecartCrate, 2: ItemIds.minecartPowered, 3: ItemIds.minecartTnt, 5: ItemIds.minecartHopper };
    return { id: ids[e.getMinecartType()] ?? ItemIds.minecartEmpty, damage: 0, matchDamage: false };
  }
  if (e instanceof EntityBoat) return { id: ItemIds.boat, damage: 0, matchDamage: false };
  const eggId = EntityList.getEntityID(e);
  if (eggId <= 0 || !EntityList.entityEggs.has(eggId)) return null;
  return { id: ItemIds.monsterPlacer, damage: eggId, matchDamage: true };
}

/** Selects or (Creative) puts the picked item in the hotbar, then tells the creative inventory about the slot. */
export function pickBlock(player: EntityPlayer, w: World, mop: MovingObjectPosition | null, sendSlotPacket: (stack: ReturnType<EntityPlayer['inventory']['getStackInSlot']>, slot: number) => void): void {
  const creative = player.capabilities.isCreativeMode;
  const picked = pickedItem(w, mop, creative);
  if (!picked) return;
  const inv = player.inventory;
  inv.setCurrentItem(picked.id, picked.damage, picked.matchDamage, creative);
  if (creative) sendSlotPacket(inv.getStackInSlot(inv.currentItem), player.inventoryContainer.inventorySlots.length - 9 + inv.currentItem);
}
