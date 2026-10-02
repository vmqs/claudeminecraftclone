import { BlockIds, ItemIds } from '../../block/BlockIds';
import { TileEntityBeacon } from '../../world/tileentity/TileEntityBeacon';
import { TileEntityChest } from '../../world/tileentity/TileEntityChest';
import { TileEntityEnchantmentTable } from '../../world/tileentity/TileEntityEnchantmentTable';
import { TileEntityEnderChest } from '../../world/tileentity/TileEntityEnderChest';
import { TileEntityEndPortal } from '../../world/tileentity/TileEntityEndPortal';
import { TileEntityMobSpawner } from '../../world/tileentity/TileEntityMobSpawner';
import { TileEntityPiston } from '../../world/tileentity/TileEntityPiston';
import { TileEntitySign } from '../../world/tileentity/TileEntitySign';
import { TileEntitySkull } from '../../world/tileentity/TileEntitySkull';
import { ChestItemHook } from '../blocks/RenderBlockItem';
import { RenderBiped } from '../entity/RenderBiped';
import { GL } from '../gl/GL';
import { TileEntityChestRenderer, TileEntityEnderChestRenderer } from './TileEntityChestRenderer';
import {
  RenderEnchantmentTable,
  RenderEndPortal,
  TileEntityBeaconRenderer,
  TileEntityMobSpawnerRenderer,
  TileEntityRendererPiston,
  TileEntitySkullRenderer,
} from './TileEntityMiscRenderers';
import { TileEntityRenderer } from './TileEntityRenderer';
import { TileEntitySignRenderer } from './TileEntitySignRenderer';

/*
 * The tile-entity renderers of 1.5.2 (TileEntityRenderer's constructor), plus the two places
 * that draw tile-entity models outside the world: chests as items (ChestItemRenderHelper) and
 * skulls worn on heads. Minecraft imports this module once.
 */
const ter = TileEntityRenderer.instance;
ter.register(TileEntitySign, new TileEntitySignRenderer());
ter.register(TileEntityMobSpawner, new TileEntityMobSpawnerRenderer());
ter.register(TileEntityPiston, new TileEntityRendererPiston());
ter.register(TileEntityChest, new TileEntityChestRenderer());
ter.register(TileEntityEnderChest, new TileEntityEnderChestRenderer());
ter.register(TileEntityEnchantmentTable, new RenderEnchantmentTable());
ter.register(TileEntityEndPortal, new RenderEndPortal());
ter.register(TileEntityBeacon, new TileEntityBeaconRenderer());
ter.register(TileEntitySkull, new TileEntitySkullRenderer());

// ChestItemRenderHelper: a world-less chest (always the plain chest texture, as in 1.5.2) or ender chest.
const itemChest = new TileEntityChest();
const itemEnderChest = new TileEntityEnderChest();
ChestItemHook.render = (block) => {
  ter.renderTileEntityAt(block.blockID === BlockIds.enderChest ? itemEnderChest : itemChest, 0, 0, 0, 0);
};

// A skull worn as a helmet (RenderBiped / RenderPlayer): slightly larger than the head.
RenderBiped.skullRenderer = (stack) => {
  const skulls = TileEntitySkullRenderer.skullRenderer;
  if (!skulls || stack.itemID !== ItemIds.skull) return;
  const s = Math.fround(1.0625);
  GL.scale(s, -s, -s);
  const tag = stack.stackTagCompound as { SkullOwner?: unknown } | null;
  const owner = tag && typeof tag.SkullOwner === 'string' ? tag.SkullOwner : '';
  skulls.renderSkull(-0.5, 0, -0.5, 1, 180, stack.getItemDamage(), owner);
};

export const TILE_ENTITY_RENDERERS = ter;
