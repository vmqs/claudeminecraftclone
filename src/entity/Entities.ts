import { EntityArrow } from './EntityArrow';
import { EntityBoat } from './EntityBoat';
import { EntityEgg } from './EntityEgg';
import { EntityEnderCrystal } from './EntityEnderCrystal';
import { EntityEnderEye } from './EntityEnderEye';
import { EntityEnderPearl } from './EntityEnderPearl';
import { EntityExpBottle } from './EntityExpBottle';
import { EntityFallingSand } from './EntityFallingSand';
import { EntityFireworkRocket } from './EntityFireworkRocket';
import { EntityFishHook } from './EntityFishHook';
import { EntityItem } from './EntityItem';
import { EntityItemFrame } from './EntityItemFrame';
import { EntityLargeFireball } from './EntityLargeFireball';
import { EntityList } from './EntityList';
import { EntityMinecartChest } from './EntityMinecartChest';
import { EntityMinecartEmpty } from './EntityMinecartEmpty';
import { EntityMinecartFurnace } from './EntityMinecartFurnace';
import { EntityMinecartHopper } from './EntityMinecartHopper';
import { EntityMinecartMobSpawner } from './EntityMinecartMobSpawner';
import { EntityMinecartTNT } from './EntityMinecartTNT';
import { EntityPainting } from './EntityPainting';
import { EntityPotion } from './EntityPotion';
import { EntitySmallFireball } from './EntitySmallFireball';
import { EntitySnowball } from './EntitySnowball';
import { EntityTNTPrimed } from './EntityTNTPrimed';
import { EntityWitherSkull } from './EntityWitherSkull';
import { EntityXPOrb } from './EntityXPOrb';
import './PassiveMobs';

/**
 * Binds the entity classes to their 1.5.2 names (EntityList's static block). Add one line per
 * entity class; IDs and spawn-egg colours come from the table in EntityList. Imported once by
 * Minecraft (not by workers).
 */
EntityList.addMapping(EntityItem, 'Item');
EntityList.addMapping(EntityXPOrb, 'XPOrb');
EntityList.addMapping(EntityPainting, 'Painting');
EntityList.addMapping(EntityArrow, 'Arrow');
EntityList.addMapping(EntitySnowball, 'Snowball');
EntityList.addMapping(EntityEnderPearl, 'ThrownEnderpearl');
EntityList.addMapping(EntityPotion, 'ThrownPotion');
EntityList.addMapping(EntityEnderEye, 'EyeOfEnderSignal');
EntityList.addMapping(EntityExpBottle, 'ThrownExpBottle');
EntityList.addMapping(EntityItemFrame, 'ItemFrame');
EntityList.addMapping(EntityLargeFireball, 'Fireball');
EntityList.addMapping(EntitySmallFireball, 'SmallFireball');
EntityList.addMapping(EntityWitherSkull, 'WitherSkull');
EntityList.addMapping(EntityTNTPrimed, 'PrimedTnt');
EntityList.addMapping(EntityFallingSand, 'FallingSand');
EntityList.addMapping(EntityFireworkRocket, 'FireworksRocketEntity');
EntityList.addMapping(EntityBoat, 'Boat');
EntityList.addMapping(EntityMinecartEmpty, 'MinecartRideable');
EntityList.addMapping(EntityMinecartChest, 'MinecartChest');
EntityList.addMapping(EntityMinecartFurnace, 'MinecartFurnace');
EntityList.addMapping(EntityMinecartTNT, 'MinecartTNT');
EntityList.addMapping(EntityMinecartHopper, 'MinecartHopper');
EntityList.addMapping(EntityMinecartMobSpawner, 'MinecartSpawner');
EntityList.addMapping(EntityEnderCrystal, 'EnderCrystal');
// Eggs and fishing bobbers have no savegame name in 1.5.2 (they are never saved); the labels
// only let the dev tools create and find them.
EntityList.addUnsaved(EntityEgg, 'Egg');
EntityList.addUnsaved(EntityFishHook, 'FishHook');

// Hostile and Nether mobs (mobshostile slice).
import './HostileMobs';

// The Ender Dragon and the Wither (end slice).
import './Bosses';
