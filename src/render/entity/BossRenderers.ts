import { EntityDragon } from '../../entity/EntityDragon';
import { EntityWither } from '../../entity/EntityWither';
import { RenderDragon } from './RenderDragon';
import { RenderManager } from './RenderManager';
import { RenderWither } from './RenderWither';

/** Renderers of the bosses (end slice), imported by EntityRenderers.ts. */
const rm = RenderManager.instance;
rm.register(EntityDragon, new RenderDragon());
rm.register(EntityWither, new RenderWither());
