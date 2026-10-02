import { EntityArrow } from './EntityArrow';
import { EntityEgg } from './EntityEgg';
import { EntityEnderPearl } from './EntityEnderPearl';
import { EntityExpBottle } from './EntityExpBottle';
import { EntityItem } from './EntityItem';
import { EntityList } from './EntityList';
import { EntityPotion } from './EntityPotion';
import { EntitySnowball } from './EntitySnowball';
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
// EntityEgg has no savegame name in 1.5.2 (it is never saved), so it is not in the name table.
void EntityEgg;
