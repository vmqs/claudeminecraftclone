import type { World } from '../../world/World';
import type { Tessellator } from '../gl/Tessellator';
import { growIn } from './EntityCloudFX';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/**
 * "heart" (cell 80, animals in love, tamed pets) and "angryVillager" (cell 81): floats up for
 * 16 ticks, sliding sideways faster whenever it is stuck under a ceiling.
 */
export class EntityHeartFX extends EntityFX {
  private readonly particleScaleOverTime: number;

  constructor(w: World, x: number, y: number, z: number, _vx: number, _vy: number, _vz: number, scale = 2) {
    super(w, x, y, z, 0, 0, 0);
    this.motionX *= f(0.01);
    this.motionY *= f(0.01);
    this.motionZ *= f(0.01);
    this.motionY += 0.1;
    this.particleScale = f(this.particleScale * f(0.75));
    this.particleScale = f(this.particleScale * scale);
    this.particleScaleOverTime = this.particleScale;
    this.particleMaxAge = 16;
    this.noClip = false;
    this.setParticleTextureIndex(80);
  }

  override renderParticle(t: Tessellator, pt: number, rx: number, rxz: number, rz: number, ryz: number, rxy: number): void {
    this.particleScale = f(this.particleScaleOverTime * growIn(this.particleAge, this.particleMaxAge, pt));
    super.renderParticle(t, pt, rx, rxz, rz, ryz, rxy);
  }

  override onUpdate(): void {
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    if (this.particleAge++ >= this.particleMaxAge) this.setDead();
    this.moveEntity(this.motionX, this.motionY, this.motionZ);
    if (this.posY === this.prevPosY) {
      this.motionX *= 1.1;
      this.motionZ *= 1.1;
    }
    this.motionX *= f(0.86);
    this.motionY *= f(0.86);
    this.motionZ *= f(0.86);
    if (this.onGround) {
      this.motionX *= f(0.7);
      this.motionZ *= f(0.7);
    }
  }
}
