import { EntityItem } from './EntityItem';
import { EntityList } from './EntityList';

/**
 * Binds the entity classes to their 1.5.2 names (EntityList's static block). Add one line per
 * entity class; IDs and spawn-egg colours come from the table in EntityList. Imported once by
 * Minecraft (not by workers).
 */
EntityList.addMapping(EntityItem, 'Item');
