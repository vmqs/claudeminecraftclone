import { ItemIds } from '../../block/BlockIds';
import { Entity } from '../../entity/Entity';
import { EntityArrow } from '../../entity/EntityArrow';
import { EntityBoat } from '../../entity/EntityBoat';
import { EntityEgg } from '../../entity/EntityEgg';
import { EntityEnderCrystal } from '../../entity/EntityEnderCrystal';
import { EntityEnderEye } from '../../entity/EntityEnderEye';
import { EntityEnderPearl } from '../../entity/EntityEnderPearl';
import { EntityExpBottle } from '../../entity/EntityExpBottle';
import { EntityFallingSand } from '../../entity/EntityFallingSand';
import { EntityFireworkRocket } from '../../entity/EntityFireworkRocket';
import { EntityFishHook } from '../../entity/EntityFishHook';
import { EntityItem } from '../../entity/EntityItem';
import { EntityItemFrame } from '../../entity/EntityItemFrame';
import { EntityLargeFireball } from '../../entity/EntityLargeFireball';
import { EntityLiving } from '../../entity/EntityLiving';
import { EntityMinecart } from '../../entity/EntityMinecart';
import { EntityMinecartMobSpawner } from '../../entity/EntityMinecartMobSpawner';
import { EntityMinecartTNT } from '../../entity/EntityMinecartTNT';
import { EntityPainting } from '../../entity/EntityPainting';
import { EntityPlayer } from '../../entity/EntityPlayer';
import { EntityPotion } from '../../entity/EntityPotion';
import { EntitySmallFireball } from '../../entity/EntitySmallFireball';
import { EntitySnowball } from '../../entity/EntitySnowball';
import { EntityTNTPrimed } from '../../entity/EntityTNTPrimed';
import { EntityWitherSkull } from '../../entity/EntityWitherSkull';
import { EntityXPOrb } from '../../entity/EntityXPOrb';
import './EntityClientHooks';
import './PassiveMobRenderers';
import { ModelBiped } from './ModelBiped';
import { RenderArrow } from './RenderArrow';
import { RenderBoat } from './RenderBoat';
import { RenderEnderCrystal } from './RenderEnderCrystal';
import { RenderEntity } from './RenderEntity';
import { RenderFallingSand } from './RenderFallingSand';
import { RenderFireball } from './RenderFireball';
import { RenderFish } from './RenderFish';
import { RenderItem } from './RenderItem';
import { RenderItemFrame } from './RenderItemFrame';
import { RenderLiving } from './RenderLiving';
import { RenderManager } from './RenderManager';
import { RenderMinecart } from './RenderMinecart';
import { RenderMinecartMobSpawner } from './RenderMinecartMobSpawner';
import { RenderPainting } from './RenderPainting';
import { RenderPlayer } from './RenderPlayer';
import { RenderSnowball } from './RenderSnowball';
import { RenderTntMinecart } from './RenderTntMinecart';
import { RenderTNTPrimed } from './RenderTNTPrimed';
import { RenderWitherSkull } from './RenderWitherSkull';
import { RenderXPOrb } from './RenderXPOrb';

/**
 * Entity class -> renderer (the table in RenderManager's constructor). Lookups walk up the
 * class chain, so a subclass without its own line uses its parent's renderer. Add one line per
 * renderer; Minecraft imports this module once.
 */
const rm = RenderManager.instance;
rm.register(EntityPlayer, new RenderPlayer());
rm.register(EntityLiving, new RenderLiving(new ModelBiped(), 0.5));
rm.register(EntityEnderCrystal, new RenderEnderCrystal());
rm.register(Entity, new RenderEntity());
rm.register(EntityPainting, new RenderPainting());
rm.register(EntityItemFrame, new RenderItemFrame());
rm.register(EntityArrow, new RenderArrow());
rm.register(EntitySnowball, new RenderSnowball(ItemIds.snowball, 0, 'snowball'));
rm.register(EntityEnderPearl, new RenderSnowball(ItemIds.enderPearl, 0, 'enderPearl'));
rm.register(EntityEgg, new RenderSnowball(ItemIds.egg, 0, 'egg'));
rm.register(EntityPotion, new RenderSnowball(ItemIds.potion, 16384, 'potion_splash'));
rm.register(EntityEnderEye, new RenderSnowball(ItemIds.eyeOfEnder, 0, 'eyeOfEnder'));
rm.register(EntityExpBottle, new RenderSnowball(ItemIds.expBottle, 0, 'expBottle'));
rm.register(EntityFireworkRocket, new RenderSnowball(ItemIds.firework, 0, 'fireworks'));
rm.register(EntityLargeFireball, new RenderFireball(2));
rm.register(EntitySmallFireball, new RenderFireball(0.5));
rm.register(EntityWitherSkull, new RenderWitherSkull());
rm.register(EntityItem, new RenderItem());
rm.register(EntityXPOrb, new RenderXPOrb());
rm.register(EntityTNTPrimed, new RenderTNTPrimed());
rm.register(EntityFallingSand, new RenderFallingSand());
rm.register(EntityMinecartTNT, new RenderTntMinecart());
rm.register(EntityMinecartMobSpawner, new RenderMinecartMobSpawner());
rm.register(EntityMinecart, new RenderMinecart());
rm.register(EntityBoat, new RenderBoat());
rm.register(EntityFishHook, new RenderFish());

// Hostile and Nether mobs (mobshostile slice).
import './HostileMobRenderers';
