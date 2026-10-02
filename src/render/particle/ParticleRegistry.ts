import { RenderGlobal } from '../RenderGlobal';
import { EntityCritFX } from './EntityCritFX';

const f = Math.fround;

/**
 * Particle names of World.spawnParticle -> constructors (the big if-chain of
 * RenderGlobal.doSpawnParticle). "tilecrack_<id>_<meta>" is handled by RenderGlobal itself.
 * Add one line per particle type here; Minecraft imports this module once.
 */
const factories = RenderGlobal.particleFactories;

factories.set('crit', (w, x, y, z, vx, vy, vz) => new EntityCritFX(w, x, y, z, vx, vy, vz));
factories.set('magicCrit', (w, x, y, z, vx, vy, vz) => {
  const fx = new EntityCritFX(w, x, y, z, vx, vy, vz);
  fx.setRBGColorF(f(fx.getRedColorF() * f(0.3)), f(fx.getGreenColorF() * f(0.8)), fx.getBlueColorF());
  fx.nextTextureIndexX();
  return fx;
});
