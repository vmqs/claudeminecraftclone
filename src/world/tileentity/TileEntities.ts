import { TileEntity } from './TileEntity';
import { TileEntityBeacon } from './TileEntityBeacon';
import { TileEntityBrewingStand } from './TileEntityBrewingStand';
import { TileEntityChest } from './TileEntityChest';
import { TileEntityCommandBlock } from './TileEntityCommandBlock';
import { TileEntityComparator } from './TileEntityComparator';
import { TileEntityDaylightDetector } from './TileEntityDaylightDetector';
import { TileEntityDispenser, TileEntityDropper } from './TileEntityDispenser';
import { TileEntityEnchantmentTable } from './TileEntityEnchantmentTable';
import { TileEntityEnderChest } from './TileEntityEnderChest';
import { TileEntityEndPortal } from './TileEntityEndPortal';
import { TileEntityFurnace } from './TileEntityFurnace';
import { TileEntityHopper } from './TileEntityHopper';
import { TileEntityMobSpawner } from './TileEntityMobSpawner';
import { TileEntityNote } from './TileEntityNote';
import { TileEntityPiston } from './TileEntityPiston';
import { TileEntityRecordPlayer } from './TileEntityRecordPlayer';
import { TileEntitySign } from './TileEntitySign';
import { TileEntitySkull } from './TileEntitySkull';

/*
 * Tile-entity savegame ids of 1.5.2 (TileEntity's static block), in the original order.
 * Blocks.ts imports this module, so the main thread and the workers both know every id.
 */
TileEntity.addMapping(TileEntityFurnace, 'Furnace');
TileEntity.addMapping(TileEntityChest, 'Chest');
TileEntity.addMapping(TileEntityEnderChest, 'EnderChest');
TileEntity.addMapping(TileEntityRecordPlayer, 'RecordPlayer');
TileEntity.addMapping(TileEntityDispenser, 'Trap');
TileEntity.addMapping(TileEntityDropper, 'Dropper');
TileEntity.addMapping(TileEntitySign, 'Sign');
TileEntity.addMapping(TileEntityMobSpawner, 'MobSpawner');
TileEntity.addMapping(TileEntityNote, 'Music');
TileEntity.addMapping(TileEntityPiston, 'Piston');
TileEntity.addMapping(TileEntityBrewingStand, 'Cauldron');
TileEntity.addMapping(TileEntityEnchantmentTable, 'EnchantTable');
TileEntity.addMapping(TileEntityEndPortal, 'Airportal');
TileEntity.addMapping(TileEntityCommandBlock, 'Control');
TileEntity.addMapping(TileEntityBeacon, 'Beacon');
TileEntity.addMapping(TileEntitySkull, 'Skull');
TileEntity.addMapping(TileEntityDaylightDetector, 'DLDetector');
TileEntity.addMapping(TileEntityHopper, 'Hopper');
TileEntity.addMapping(TileEntityComparator, 'Comparator');

export const TILE_ENTITY_REGISTRY = TileEntity;
