import type { World } from '../../world/World';
import type { Tessellator } from '../gl/Tessellator';
import { growIn } from './EntityCloudFX';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/**
 * "smoke" (scale 1) and "largesmoke" (scale 2.5): a dark puff that rises slowly through the
 * eight smoke cells (7 down to 0) and spreads sideways under ceilings.
 */
export class EntitySmokeFX extends EntityFX {
  private readonly smokeParticleScale: number;

  constructor(w: World, x: number, y: number, z: number, vx: number, vy: number, vz: number, scale = 1) {
    super(w, x, y, z, 0, 0, 0);
    this.motionX *= f(0.1);
    this.motionY *= f(0.1);
    this.motionZ *= f(0.1);
    this.motionX += vx;
    this.motionY += vy;
    this.motionZ += vz;
    this.particleRed = this.particleGreen = this.particleBlue = f(Math.random() * f(0.3));
    this.particleScale = f(this.particleScale * f(0.75));
    this.particleScale = f(this.particleScale * scale);
    this.smokeParticleScale = this.particleScale;
    this.particleMaxAge = Math.trunc(8 / (Math.random() * 0.8 + 0.2));
    this.particleMaxAge = Math.trunc(f(this.particleMaxAge * scale));
    this.noClip = false;
  }

  override renderParticle(t: Tessellator, pt: number, rx: number, rxz: number, rz: number, ryz: number, rxy: number): void {
    this.particleScale = f(this.smokeParticleScale * growIn(this.particleAge, this.particleMaxAge, pt));
    super.renderParticle(t, pt, rx, rxz, rz, ryz, rxy);
  }

  override onUpdate(): void {
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    if (this.particleAge++ >= this.particleMaxAge) this.setDead();
    this.setParticleTextureIndex(7 - Math.trunc((this.particleAge * 8) / this.particleMaxAge));
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
}
