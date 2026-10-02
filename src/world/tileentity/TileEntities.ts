import { TileEntity } from './TileEntity';

/*
 * Tile-entity savegame ids of 1.5.2 (TileEntity's static block), one line per class, e.g.
 *
 *   TileEntity.addMapping(TileEntityChest, 'Chest');
 *
 * Ids: Furnace, Chest, EnderChest, RecordPlayer, Trap (dispenser), Dropper, Sign, MobSpawner,
 * Music (note block), Piston, Cauldron (brewing stand), EnchantTable, Airportal (end portal),
 * Control (command block), Beacon, Skull, DLDetector, Hopper, Comparator.
 *
 * Blocks.ts imports this module, so the main thread and the workers both know every id.
 */
export const TILE_ENTITY_REGISTRY = TileEntity;
