import { EntityDragon } from '../../entity/EntityDragon';
import { RenderDragon } from './RenderDragon';
import { RenderManager } from './RenderManager';

/** Renderers of the bosses (end slice), imported by EntityRenderers.ts. */
const rm = RenderManager.instance;
rm.register(EntityDragon, new RenderDragon());
