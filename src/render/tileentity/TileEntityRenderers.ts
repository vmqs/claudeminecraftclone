import { TileEntityRenderer } from './TileEntityRenderer';

/*
 * Tile-entity class -> special renderer (TileEntityRenderer's constructor), one line each:
 *
 *   TileEntityRenderer.instance.register(TileEntityChest, new TileEntityChestRenderer());
 *
 * 1.5.2 has renderers for Sign, MobSpawner, Piston, Chest, EnderChest, EnchantmentTable,
 * EndPortal, Beacon and Skull. Minecraft imports this module once.
 */
export const TILE_ENTITY_RENDERERS = TileEntityRenderer.instance;
