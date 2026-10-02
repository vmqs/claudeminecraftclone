import type { World } from '../../world/World';
import type { Tessellator } from '../gl/Tessellator';
import { growIn } from './EntityCloudFX';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/**
 * "reddust": redstone dust, torches and ore glints. The velocity is a colour (0 red is
 * replaced by 1), each channel varied by 0.8-1.0 and the whole by 0.6-1.0; it plays the
 * eight smoke cells.
 */
export class EntityReddustFX extends EntityFX {
  private readonly reddustParticleScale: number;

  constructor(w: World, x: number, y: number, z: number, r: number, g: number, b: number, scale = 1) {
    super(w, x, y, z, 0, 0, 0);
    this.motionX *= f(0.1);
    this.motionY *= f(0.1);
    this.motionZ *= f(0.1);
    r = f(r);
    if (r === 0) r = 1;
    const k = f(f(f(Math.random()) * f(0.4)) + f(0.6));
    this.particleRed = f(f(f(f(Math.random() * f(0.2)) + f(0.8)) * r) * k);
    this.particleGreen = f(f(f(f(Math.random() * f(0.2)) + f(0.8)) * f(g)) * k);
    this.particleBlue = f(f(f(f(Math.random() * f(0.2)) + f(0.8)) * f(b)) * k);
    this.particleScale = f(this.particleScale * f(0.75));
    this.particleScale = f(this.particleScale * scale);
    this.reddustParticleScale = this.particleScale;
    this.particleMaxAge = Math.trunc(8 / (Math.random() * 0.8 + 0.2));
    this.particleMaxAge = Math.trunc(f(this.particleMaxAge * scale));
    this.noClip = false;
  }

  override renderParticle(t: Tessellator, pt: number, rx: number, rxz: number, rz: number, ryz: number, rxy: number): void {
    this.particleScale = f(this.reddustParticleScale * growIn(this.particleAge, this.particleMaxAge, pt));
    super.renderParticle(t, pt, rx, rxz, rz, ryz, rxy);
  }

  override onUpdate(): void {
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    if (this.particleAge++ >= this.particleMaxAge) this.setDead();
    this.setParticleTextureIndex(7 - Math.trunc((this.particleAge * 8) / this.particleMaxAge));
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
