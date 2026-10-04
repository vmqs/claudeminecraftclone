import type { World } from '../../world/World';
import type { Tessellator } from '../gl/Tessellator';
import { growIn } from './EntityCloudFX';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/** "snowshovel": the white puffs a snow golem leaves while walking; they fall instead of rising. */
export class EntitySnowShovelFX extends EntityFX {
  private readonly snowDigParticleScale: number;

  constructor(w: World, x: number, y: number, z: number, vx: number, vy: number, vz: number, scale = 1) {
    super(w, x, y, z, vx, vy, vz);
    this.motionX *= f(0.1);
    this.motionY *= f(0.1);
    this.motionZ *= f(0.1);
    this.motionX += vx;
    this.motionY += vy;
    this.motionZ += vz;
    this.particleRed = this.particleGreen = this.particleBlue = f(1 - f(Math.random() * f(0.3)));
    this.particleScale = f(this.particleScale * f(0.75));
    this.particleScale = f(this.particleScale * scale);
    this.snowDigParticleScale = this.particleScale;
    this.particleMaxAge = Math.trunc(8 / (Math.random() * 0.8 + 0.2));
    this.particleMaxAge = Math.trunc(f(this.particleMaxAge * scale));
    this.noClip = false;
  }

  override renderParticle(t: Tessellator, pt: number, rx: number, rxz: number, rz: number, ryz: number, rxy: number): void {
    this.particleScale = f(this.snowDigParticleScale * growIn(this.particleAge, this.particleMaxAge, pt));
    super.renderParticle(t, pt, rx, rxz, rz, ryz, rxy);
  }

  override onUpdate(): void {
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    if (this.particleAge++ >= this.particleMaxAge) this.setDead();
    this.setParticleTextureIndex(7 - Math.trunc((this.particleAge * 8) / this.particleMaxAge));
    this.motionY -= 0.03;
    this.moveEntity(this.motionX, this.motionY, this.motionZ);
    this.motionX *= f(0.99);
    this.motionY *= f(0.99);
    this.motionZ *= f(0.99);
    if (this.onGround) {
      this.motionX *= f(0.7);
      this.motionZ *= f(0.7);
    }
  }
}
