import { EntityBat } from './EntityBat';
import { EntityChicken } from './EntityChicken';
import { EntityCow } from './EntityCow';
import { EntityIronGolem } from './EntityIronGolem';
import { EntityList } from './EntityList';
import { EntityMooshroom } from './EntityMooshroom';
import { EntityOcelot } from './EntityOcelot';
import { EntityPig } from './EntityPig';
import { EntitySheep } from './EntitySheep';
import { EntitySnowman } from './EntitySnowman';
import { EntitySquid } from './EntitySquid';
import { EntityVillager } from './EntityVillager';
import { EntityWolf } from './EntityWolf';

/**
 * The passive and neutral mobs of 1.5.2 under their EntityList names (IDs and spawn-egg colours
 * come from EntityList's table). Imported by src/entity/Entities.ts.
 */
EntityList.addMapping(EntityBat, 'Bat');
EntityList.addMapping(EntityPig, 'Pig');
EntityList.addMapping(EntitySheep, 'Sheep');
EntityList.addMapping(EntityCow, 'Cow');
EntityList.addMapping(EntityChicken, 'Chicken');
EntityList.addMapping(EntitySquid, 'Squid');
EntityList.addMapping(EntityWolf, 'Wolf');
EntityList.addMapping(EntityMooshroom, 'MushroomCow');
EntityList.addMapping(EntitySnowman, 'SnowMan');
EntityList.addMapping(EntityOcelot, 'Ozelot');
EntityList.addMapping(EntityIronGolem, 'VillagerGolem');
EntityList.addMapping(EntityVillager, 'Villager');
