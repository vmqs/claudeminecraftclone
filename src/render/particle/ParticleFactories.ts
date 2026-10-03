import type { World } from '../../world/World';
import type { EntityFX } from './EntityFX';

/** Builds the particle for a World.spawnParticle name, or null to spawn nothing. */
export type ParticleFactory = (w: World, x: number, y: number, z: number, vx: number, vy: number, vz: number) => EntityFX | null;

/**
 * Builds the particle of a name family ("iconcrack_<id>", "tilecrack_<id>_<meta>"); `suffix`
 * is the part after the prefix.
 */
export type ParticlePrefixFactory = (w: World, suffix: string, x: number, y: number, z: number, vx: number, vy: number, vz: number) => EntityFX | null;

/**
 * The particle names of RenderGlobal.doSpawnParticle (exposed there as
 * RenderGlobal.particleFactories). These are skipped beyond 16 blocks from the viewer and by the
 * particle setting (Minimal: none, Decreased: a third dropped).
 */
export const particleFactories = new Map<string, ParticleFactory>();

/**
 * Names that are always created, whatever the distance and the particle setting
 * ("hugeexplosion", "largeexplode", "fireworksSpark").
 */
export const unculledParticleFactories = new Map<string, ParticleFactory>();

/** Name families matched by prefix after the exact names. */
export const particlePrefixFactories = new Map<string, ParticlePrefixFactory>();

/** Looks a culled particle name up: exact names first, then the prefix families. */
export function createParticle(name: string, w: World, x: number, y: number, z: number, vx: number, vy: number, vz: number): EntityFX | null {
  const exact = particleFactories.get(name);
  if (exact) return exact(w, x, y, z, vx, vy, vz);
  for (const [prefix, make] of particlePrefixFactories) {
    if (name.startsWith(prefix)) return make(w, name.slice(prefix.length), x, y, z, vx, vy, vz);
  }
  return null;
}
