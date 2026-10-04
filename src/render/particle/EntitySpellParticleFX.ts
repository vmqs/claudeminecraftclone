import type { World } from '../../world/World';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/**
 * "spell", "instantSpell", "mobSpell", "mobSpellAmbient" and "witchMagic": a swirl that plays
 * eight cells backwards from its base (128 for the spiral, 144 for the instant sparkle) while
 * rising. Without a horizontal velocity it barely drifts.
 */
export class EntitySpellParticleFX extends EntityFX {
  private baseSpellTextureIndex = 128;

  constructor(w: World, x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    super(w, x, y, z, vx, vy, vz);
    this.motionY *= f(0.2);
    if (vx === 0 && vz === 0) {
      this.motionX *= f(0.1);
      this.motionZ *= f(0.1);
    }
    this.particleScale = f(this.particleScale * f(0.75));
    this.particleMaxAge = Math.trunc(8 / (Math.random() * 0.8 + 0.2));
    this.noClip = false;
  }

  override onUpdate(): void {
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    if (this.particleAge++ >= this.particleMaxAge) this.setDead();
    this.setParticleTextureIndex(this.baseSpellTextureIndex + (7 - Math.trunc((this.particleAge * 8) / this.particleMaxAge)));
    this.motionY += 0.004;
    this.moveEntity(this.motionX, this.motionY, this.motionZ);
    if (this.posY === this.prevPosY) {
      this.motionX *= 1.1;
      this.motionZ *= 1.1;
    }
    this.motionX *= f(0.96);
    this.motionY *= f(0.96);
    this.motionZ *= f(0.96);
    if (this.onGround) {
      this.motionX *= f(0.7);
      this.motionZ *= f(0.7);
    }
  }

  setBaseSpellTextureIndex(i: number): void {
    this.baseSpellTextureIndex = i;
  }
}
