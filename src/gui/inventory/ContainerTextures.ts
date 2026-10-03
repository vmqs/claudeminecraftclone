/**
 * Textures of the inventory and container windows and of held/enchanted items. The original
 * loaded a texture synchronously the first time it was bound; here loading is asynchronous, so
 * a window opened before its texture arrived would show its slots on nothing for a few frames.
 * Minecraft.startGame starts loading these in the background once the game is up.
 */
export const CONTAINER_TEXTURES: readonly string[] = [
  '/gui/inventory.png',
  '/gui/allitems.png',
  '/gui/creative_inv/list_items.png',
  '/gui/creative_inv/search.png',
  '/gui/creative_inv/survival_inv.png',
  '/gui/container.png',
  '/gui/crafting.png',
  '/gui/furnace.png',
  '/gui/trap.png',
  '/gui/hopper.png',
  '/gui/alchemy.png',
  '/gui/enchant.png',
  '/gui/repair.png',
  '/gui/beacon.png',
  '/item/book.png',
  '%blur%/misc/glint.png',
  '/misc/mapbg.png',
  '/misc/mapicons.png',
];
