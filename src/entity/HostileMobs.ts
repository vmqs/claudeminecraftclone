import { EntityBlaze } from './EntityBlaze';
import { EntityCaveSpider } from './EntityCaveSpider';
import { EntityCreeper } from './EntityCreeper';
import { EntityEnderman } from './EntityEnderman';
import { EntityGhast } from './EntityGhast';
import { EntityGiantZombie } from './EntityGiantZombie';
import { EntityList } from './EntityList';
import { EntityMagmaCube } from './EntityMagmaCube';
import { EntityPigZombie } from './EntityPigZombie';
import { EntitySilverfish } from './EntitySilverfish';
import { EntitySkeleton } from './EntitySkeleton';
import { EntitySlime } from './EntitySlime';
import { EntitySpider } from './EntitySpider';
import { EntityWitch } from './EntityWitch';
import { EntityZombie } from './EntityZombie';

/**
 * The hostile and Nether mobs of 1.5.2 (EntityList's static block, IDs 50-62 and 66). Eggs
 * and IDs come from the EntityList table; Giant has no egg.
 */
EntityList.addMapping(EntityCreeper, 'Creeper');
EntityList.addMapping(EntitySkeleton, 'Skeleton');
EntityList.addMapping(EntitySpider, 'Spider');
EntityList.addMapping(EntityGiantZombie, 'Giant');
EntityList.addMapping(EntityZombie, 'Zombie');
EntityList.addMapping(EntitySlime, 'Slime');
EntityList.addMapping(EntityGhast, 'Ghast');
EntityList.addMapping(EntityPigZombie, 'PigZombie');
EntityList.addMapping(EntityEnderman, 'Enderman');
EntityList.addMapping(EntityCaveSpider, 'CaveSpider');
EntityList.addMapping(EntitySilverfish, 'Silverfish');
EntityList.addMapping(EntityBlaze, 'Blaze');
EntityList.addMapping(EntityMagmaCube, 'LavaSlime');
EntityList.addMapping(EntityWitch, 'Witch');
