import { EntityLightningBolt } from '../../entity/EntityLightningBolt';
import { World } from '../../world/World';
import { RenderLightningBolt } from '../entity/RenderLightningBolt';
import { RenderManager } from '../entity/RenderManager';

/**
 * Weather wiring that World and RenderManager cannot import themselves: the bolt a thunderstorm
 * strikes with (WorldServer.tickBlocksAndAmbiance) and its renderer. Minecraft imports this once.
 */
World.lightningBoltFactory = (w, x, y, z) => new EntityLightningBolt(w, x, y, z);
RenderManager.instance.register(EntityLightningBolt, new RenderLightningBolt());
