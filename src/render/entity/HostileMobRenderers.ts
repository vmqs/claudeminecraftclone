import { EntityBlaze } from '../../entity/EntityBlaze';
import { EntityCaveSpider } from '../../entity/EntityCaveSpider';
import { EntityCreeper } from '../../entity/EntityCreeper';
import { EntityEnderman } from '../../entity/EntityEnderman';
import { EntityGhast } from '../../entity/EntityGhast';
import { EntityGiantZombie } from '../../entity/EntityGiantZombie';
import { EntityMagmaCube } from '../../entity/EntityMagmaCube';
import { EntitySilverfish } from '../../entity/EntitySilverfish';
import { EntitySkeleton } from '../../entity/EntitySkeleton';
import { EntitySlime } from '../../entity/EntitySlime';
import { EntitySpider } from '../../entity/EntitySpider';
import { EntityWitch } from '../../entity/EntityWitch';
import { EntityZombie } from '../../entity/EntityZombie';
import { ModelSlime } from './ModelSlime';
import { ModelZombie } from './ModelZombie';
import { RenderBlaze } from './RenderBlaze';
import { RenderCreeper } from './RenderCreeper';
import { RenderEnderman } from './RenderEnderman';
import { RenderGhast } from './RenderGhast';
import { RenderGiantZombie } from './RenderGiantZombie';
import { RenderMagmaCube } from './RenderMagmaCube';
import { RenderManager } from './RenderManager';
import { RenderSilverfish } from './RenderSilverfish';
import { RenderSkeleton } from './RenderSkeleton';
import { RenderSlime } from './RenderSlime';
import { RenderSpider } from './RenderSpider';
import { RenderWitch } from './RenderWitch';
import { RenderZombie } from './RenderZombie';

/**
 * Renderers of the hostile and Nether mobs (RenderManager's table). Pigmen use RenderZombie
 * through their superclass, as in 1.5.2.
 */
const rm = RenderManager.instance;
rm.register(EntityCreeper, new RenderCreeper());
rm.register(EntitySpider, new RenderSpider());
rm.register(EntityCaveSpider, new RenderSpider());
rm.register(EntitySkeleton, new RenderSkeleton());
rm.register(EntitySilverfish, new RenderSilverfish());
rm.register(EntityZombie, new RenderZombie());
rm.register(EntitySlime, new RenderSlime(new ModelSlime(16), new ModelSlime(0), 0.25));
rm.register(EntityMagmaCube, new RenderMagmaCube());
rm.register(EntityGiantZombie, new RenderGiantZombie(new ModelZombie(), 0.5, 6));
rm.register(EntityEnderman, new RenderEnderman());
rm.register(EntityGhast, new RenderGhast());
rm.register(EntityBlaze, new RenderBlaze());
rm.register(EntityWitch, new RenderWitch());
