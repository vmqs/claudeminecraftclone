import { Block } from '../../block/Block';
import { ItemIds } from '../../block/BlockIds';
import { Material } from '../../block/Material';
import { Item } from '../../item/Item';
import { World } from '../../world/World';
import { EffectRenderer } from './EffectRenderer';
import { EntityAuraFX } from './EntityAuraFX';
import { EntityBreakingFX } from './EntityBreakingFX';
import { EntityBubbleFX } from './EntityBubbleFX';
import { EntityCloudFX } from './EntityCloudFX';
import { EntityCritFX } from './EntityCritFX';
import { EntityDiggingFX } from './EntityDiggingFX';
import { EntityDropParticleFX } from './EntityDropParticleFX';
import { EntityEnchantmentTableParticleFX } from './EntityEnchantmentTableParticleFX';
import { EntityExplodeFX } from './EntityExplodeFX';
import { EntityFireworkSparkFX } from './EntityFireworkSparkFX';
import { EntityFireworkStarterFX } from './EntityFireworkStarterFX';
import { EntityFlameFX } from './EntityFlameFX';
import { EntityFootStepFX } from './EntityFootStepFX';
import { EntityHeartFX } from './EntityHeartFX';
import { EntityHugeExplodeFX } from './EntityHugeExplodeFX';
import { EntityLargeExplodeFX } from './EntityLargeExplodeFX';
import { EntityLavaFX } from './EntityLavaFX';
import { EntityNoteFX } from './EntityNoteFX';
import { EntityPortalFX } from './EntityPortalFX';
import { EntityRainFX } from './EntityRainFX';
import { EntityReddustFX } from './EntityReddustFX';
import { EntitySmokeFX } from './EntitySmokeFX';
import { EntitySnowShovelFX } from './EntitySnowShovelFX';
import { EntitySpellParticleFX } from './EntitySpellParticleFX';
import { EntitySplashFX } from './EntitySplashFX';
import { EntitySuspendFX } from './EntitySuspendFX';
import { particleFactories as factories, particlePrefixFactories as prefixes, unculledParticleFactories as unculled } from './ParticleFactories';

const f = Math.fround;

/**
 * Every particle name of the 1.5.2 RenderGlobal.doSpawnParticle chain, with the same
 * constructor arguments and post-construction tweaks. Minecraft imports this module once.
 */

// Created whatever the distance and particle setting.
unculled.set('hugeexplosion', (w, x, y, z, vx, vy, vz) => new EntityHugeExplodeFX(w, x, y, z, vx, vy, vz));
unculled.set('largeexplode', (w, x, y, z, vx, vy, vz) => new EntityLargeExplodeFX(EffectRenderer.instance!.renderer, w, x, y, z, vx, vy, vz));
unculled.set('fireworksSpark', (w, x, y, z, vx, vy, vz) => new EntityFireworkSparkFX(w, x, y, z, vx, vy, vz, EffectRenderer.instance!));

factories.set('bubble', (w, x, y, z, vx, vy, vz) => new EntityBubbleFX(w, x, y, z, vx, vy, vz));
factories.set('suspended', (w, x, y, z, vx, vy, vz) => new EntitySuspendFX(w, x, y, z, vx, vy, vz));
factories.set('depthsuspend', (w, x, y, z, vx, vy, vz) => new EntityAuraFX(w, x, y, z, vx, vy, vz));
factories.set('townaura', (w, x, y, z, vx, vy, vz) => new EntityAuraFX(w, x, y, z, vx, vy, vz));
factories.set('crit', (w, x, y, z, vx, vy, vz) => new EntityCritFX(w, x, y, z, vx, vy, vz));
factories.set('magicCrit', (w, x, y, z, vx, vy, vz) => {
  const fx = new EntityCritFX(w, x, y, z, vx, vy, vz);
  fx.setRBGColorF(f(fx.getRedColorF() * f(0.3)), f(fx.getGreenColorF() * f(0.8)), fx.getBlueColorF());
  fx.nextTextureIndexX();
  return fx;
});
factories.set('smoke', (w, x, y, z, vx, vy, vz) => new EntitySmokeFX(w, x, y, z, vx, vy, vz));
// Potion swirls of mobs: the velocity is the colour.
factories.set('mobSpell', (w, x, y, z, vx, vy, vz) => {
  const fx = new EntitySpellParticleFX(w, x, y, z, 0, 0, 0);
  fx.setRBGColorF(f(vx), f(vy), f(vz));
  return fx;
});
factories.set('mobSpellAmbient', (w, x, y, z, vx, vy, vz) => {
  const fx = new EntitySpellParticleFX(w, x, y, z, 0, 0, 0);
  fx.setAlphaF(f(0.15));
  fx.setRBGColorF(f(vx), f(vy), f(vz));
  return fx;
});
factories.set('spell', (w, x, y, z, vx, vy, vz) => new EntitySpellParticleFX(w, x, y, z, vx, vy, vz));
factories.set('instantSpell', (w, x, y, z, vx, vy, vz) => {
  const fx = new EntitySpellParticleFX(w, x, y, z, vx, vy, vz);
  fx.setBaseSpellTextureIndex(144);
  return fx;
});
factories.set('witchMagic', (w, x, y, z, vx, vy, vz) => {
  const fx = new EntitySpellParticleFX(w, x, y, z, vx, vy, vz);
  fx.setBaseSpellTextureIndex(144);
  const k = f(f(w.rand.nextFloat() * f(0.5)) + f(0.35));
  fx.setRBGColorF(k, 0, k);
  return fx;
});
factories.set('note', (w, x, y, z, vx, vy, vz) => new EntityNoteFX(w, x, y, z, vx, vy, vz));
factories.set('portal', (w, x, y, z, vx, vy, vz) => new EntityPortalFX(w, x, y, z, vx, vy, vz));
factories.set('enchantmenttable', (w, x, y, z, vx, vy, vz) => new EntityEnchantmentTableParticleFX(w, x, y, z, vx, vy, vz));
factories.set('explode', (w, x, y, z, vx, vy, vz) => new EntityExplodeFX(w, x, y, z, vx, vy, vz));
factories.set('flame', (w, x, y, z, vx, vy, vz) => new EntityFlameFX(w, x, y, z, vx, vy, vz));
factories.set('lava', (w, x, y, z) => new EntityLavaFX(w, x, y, z));
factories.set('footstep', (w, x, y, z) => new EntityFootStepFX(EffectRenderer.instance!.renderer, w, x, y, z));
factories.set('splash', (w, x, y, z, vx, vy, vz) => new EntitySplashFX(w, x, y, z, vx, vy, vz));
factories.set('largesmoke', (w, x, y, z, vx, vy, vz) => new EntitySmokeFX(w, x, y, z, vx, vy, vz, f(2.5)));
factories.set('cloud', (w, x, y, z, vx, vy, vz) => new EntityCloudFX(w, x, y, z, vx, vy, vz));
// The velocity is the colour (red 0 means red 1).
factories.set('reddust', (w, x, y, z, vx, vy, vz) => new EntityReddustFX(w, x, y, z, f(vx), f(vy), f(vz)));
factories.set('snowballpoof', (w, x, y, z) => {
  const item = Item.itemsList[ItemIds.snowball];
  return item ? new EntityBreakingFX(w, x, y, z, item) : null;
});
factories.set('dripWater', (w, x, y, z) => new EntityDropParticleFX(w, x, y, z, Material.water));
factories.set('dripLava', (w, x, y, z) => new EntityDropParticleFX(w, x, y, z, Material.lava));
factories.set('snowshovel', (w, x, y, z, vx, vy, vz) => new EntitySnowShovelFX(w, x, y, z, vx, vy, vz));
factories.set('slime', (w, x, y, z) => {
  const item = Item.itemsList[ItemIds.slimeBall];
  return item ? new EntityBreakingFX(w, x, y, z, item) : null;
});
factories.set('heart', (w, x, y, z, vx, vy, vz) => new EntityHeartFX(w, x, y, z, vx, vy, vz));
factories.set('angryVillager', (w, x, y, z, vx, vy, vz) => {
  const fx = new EntityHeartFX(w, x, y + 0.5, z, vx, vy, vz);
  fx.setParticleTextureIndex(81);
  fx.setRBGColorF(1, 1, 1);
  return fx;
});
factories.set('happyVillager', (w, x, y, z, vx, vy, vz) => {
  const fx = new EntityAuraFX(w, x, y, z, vx, vy, vz);
  fx.setParticleTextureIndex(82);
  fx.setRBGColorF(1, 1, 1);
  return fx;
});

// Not a doSpawnParticle name in 1.5.2: EntityRenderer.addRainParticles builds EntityRainFX
// directly. Registered so the rain renderer can look the splash up by name
// (RenderGlobal.particleFactories.get('rain')) and add it to the effect renderer itself.
factories.set('rain', (w, x, y, z) => new EntityRainFX(w, x, y, z));

// "iconcrack_<itemID>": a crumb of the item's icon.
prefixes.set('iconcrack_', (w, suffix, x, y, z, vx, vy, vz) => {
  const item = Item.itemsList[parseInt(suffix, 10)];
  return item ? new EntityBreakingFX(w, x, y, z, item, vx, vy, vz) : null;
});
// "tilecrack_<blockID>_<meta>": a block fragment tinted with the block's item colour.
prefixes.set('tilecrack_', (w, suffix, x, y, z, vx, vy, vz) => {
  const parts = suffix.split('_');
  const block = Block.blocksList[parseInt(parts[0], 10)];
  const meta = parseInt(parts[1] ?? '0', 10) || 0;
  return block ? new EntityDiggingFX(w, x, y, z, vx, vy, vz, block, 0, meta).applyRenderColor(meta) : null;
});

// Firework rockets exploding (WorldClient.func_92088_a). "Far" means no player within 16
// blocks (the original asks the render view entity, which is the only player here).
World.fireworksEffect = (w, x, y, z, vx, vy, vz, fireworks) => {
  const er = EffectRenderer.instance;
  if (!er) return;
  const isFar = (px: number, py: number, pz: number) => w.getClosestPlayer(px, py, pz, 16) === null;
  er.addEffect(new EntityFireworkStarterFX(w, x, y, z, vx, vy, vz, er, fireworks, isFar));
};
