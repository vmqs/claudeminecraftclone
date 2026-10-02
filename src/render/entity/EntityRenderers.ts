import { EntityItem } from '../../entity/EntityItem';
import { EntityPlayer } from '../../entity/EntityPlayer';
import { RenderItem } from './RenderItem';
import { RenderManager } from './RenderManager';
import { RenderPlayer } from './RenderPlayer';

/**
 * Entity class -> renderer (the table in RenderManager's constructor). Lookups walk up the
 * class chain, so a subclass without its own line uses its parent's renderer. Add one line per
 * renderer; Minecraft imports this module once.
 */
const rm = RenderManager.instance;
rm.register(EntityPlayer, new RenderPlayer());
rm.register(EntityItem, new RenderItem());
