import { EntityArrow } from './EntityArrow';
import { EntityBoat } from './EntityBoat';
import { EntityEgg } from './EntityEgg';
import { EntityEnderPearl } from './EntityEnderPearl';
import { EntityExpBottle } from './EntityExpBottle';
import { EntityFallingSand } from './EntityFallingSand';
import { EntityItem } from './EntityItem';
import { EntityLargeFireball } from './EntityLargeFireball';
import { EntityList } from './EntityList';
import { EntityMinecartChest } from './EntityMinecartChest';
import { EntityMinecartEmpty } from './EntityMinecartEmpty';
import { EntityMinecartFurnace } from './EntityMinecartFurnace';
import { EntityMinecartHopper } from './EntityMinecartHopper';
import { EntityMinecartMobSpawner } from './EntityMinecartMobSpawner';
import { EntityMinecartTNT } from './EntityMinecartTNT';
import { EntityPotion } from './EntityPotion';
import { EntitySmallFireball } from './EntitySmallFireball';
import { EntitySnowball } from './EntitySnowball';
import { EntityTNTPrimed } from './EntityTNTPrimed';
import { EntityWitherSkull } from './EntityWitherSkull';
import { EntityXPOrb } from './EntityXPOrb';

/**
 * Binds the entity classes to their 1.5.2 names (EntityList's static block). Add one line per
 * entity class; IDs and spawn-egg colours come from the table in EntityList. Imported once by
 * Minecraft (not by workers).
 */
EntityList.addMapping(EntityItem, 'Item');
EntityList.addMapping(EntityXPOrb, 'XPOrb');
EntityList.addMapping(EntityArrow, 'Arrow');
EntityList.addMapping(EntitySnowball, 'Snowball');
EntityList.addMapping(EntityEnderPearl, 'ThrownEnderpearl');
EntityList.addMapping(EntityPotion, 'ThrownPotion');
EntityList.addMapping(EntityExpBottle, 'ThrownExpBottle');
EntityList.addMapping(EntityLargeFireball, 'Fireball');
EntityList.addMapping(EntitySmallFireball, 'SmallFireball');
EntityList.addMapping(EntityWitherSkull, 'WitherSkull');
EntityList.addMapping(EntityTNTPrimed, 'PrimedTnt');
EntityList.addMapping(EntityFallingSand, 'FallingSand');
EntityList.addMapping(EntityBoat, 'Boat');
EntityList.addMapping(EntityMinecartEmpty, 'MinecartRideable');
EntityList.addMapping(EntityMinecartChest, 'MinecartChest');
EntityList.addMapping(EntityMinecartFurnace, 'MinecartFurnace');
EntityList.addMapping(EntityMinecartTNT, 'MinecartTNT');
EntityList.addMapping(EntityMinecartHopper, 'MinecartHopper');
EntityList.addMapping(EntityMinecartMobSpawner, 'MinecartSpawner');
// EntityEgg has no savegame name in 1.5.2 (it is never saved), so it is not in the name table.
void EntityEgg;
