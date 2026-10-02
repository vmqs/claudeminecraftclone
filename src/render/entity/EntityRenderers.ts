import { ItemIds } from '../../block/BlockIds';
import { Entity } from '../../entity/Entity';
import { EntityArrow } from '../../entity/EntityArrow';
import { EntityEgg } from '../../entity/EntityEgg';
import { EntityEnderPearl } from '../../entity/EntityEnderPearl';
import { EntityExpBottle } from '../../entity/EntityExpBottle';
import { EntityItem } from '../../entity/EntityItem';
import { EntityLiving } from '../../entity/EntityLiving';
import { EntityPlayer } from '../../entity/EntityPlayer';
import { EntityPotion } from '../../entity/EntityPotion';
import { EntitySnowball } from '../../entity/EntitySnowball';
import { EntityXPOrb } from '../../entity/EntityXPOrb';
import './EntityClientHooks';
import { ModelBiped } from './ModelBiped';
import { RenderArrow } from './RenderArrow';
import { RenderEntity } from './RenderEntity';
import { RenderItem } from './RenderItem';
import { RenderLiving } from './RenderLiving';
import { RenderManager } from './RenderManager';
import { RenderPlayer } from './RenderPlayer';
import { RenderSnowball } from './RenderSnowball';
import { RenderXPOrb } from './RenderXPOrb';

/**
 * Entity class -> renderer (the table in RenderManager's constructor). Lookups walk up the
 * class chain, so a subclass without its own line uses its parent's renderer. Add one line per
 * renderer; Minecraft imports this module once.
 */
const rm = RenderManager.instance;
rm.register(EntityPlayer, new RenderPlayer());
rm.register(EntityLiving, new RenderLiving(new ModelBiped(), 0.5));
rm.register(Entity, new RenderEntity());
rm.register(EntityArrow, new RenderArrow());
rm.register(EntitySnowball, new RenderSnowball(ItemIds.snowball, 0, 'snowball'));
rm.register(EntityEnderPearl, new RenderSnowball(ItemIds.enderPearl, 0, 'enderPearl'));
rm.register(EntityEgg, new RenderSnowball(ItemIds.egg, 0, 'egg'));
rm.register(EntityPotion, new RenderSnowball(ItemIds.potion, 16384, 'potion_splash'));
rm.register(EntityExpBottle, new RenderSnowball(ItemIds.expBottle, 0, 'expBottle'));
rm.register(EntityItem, new RenderItem());
rm.register(EntityXPOrb, new RenderXPOrb());
