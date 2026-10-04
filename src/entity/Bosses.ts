import { EntityDragon } from './EntityDragon';
import { EntityList } from './EntityList';
import { EntityWither } from './EntityWither';

/**
 * The bosses' EntityList names (end slice): the Ender Dragon (63) and the Wither (64). Imported
 * by Entities.ts.
 */
EntityList.addMapping(EntityDragon, 'EnderDragon');
EntityList.addMapping(EntityWither, 'WitherBoss');
