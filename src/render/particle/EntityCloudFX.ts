import type { World } from '../../world/World';
import type { Tessellator } from '../gl/Tessellator';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/**
 * "cloud": the white puff of a mob dying or a sheep being sheared; it shrinks through the
 * eight smoke frames and is pulled down towards the feet of a nearby player.
 */
export class EntityCloudFX extends EntityFX {
  private readonly baseScale: number;

  constructor(w: World, x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    super(w, x, y, z, 0, 0, 0);
    const scale = f(2.5);
    this.motionX *= f(0.1);
    this.motionY *= f(0.1);
    this.motionZ *= f(0.1);
    this.motionX += vx;
    this.motionY += vy;
    this.motionZ += vz;
    this.particleRed = this.particleGreen = this.particleBlue = f(1 - f(Math.random() * f(0.3)));
    this.particleScale = f(this.particleScale * f(0.75));
    this.particleScale = f(this.particleScale * scale);
    this.baseScale = this.particleScale;
    this.particleMaxAge = Math.trunc(8 / (Math.random() * 0.8 + 0.3));
    this.particleMaxAge = Math.trunc(f(this.particleMaxAge * scale));
    this.noClip = false;
  }

  override renderParticle(t: Tessellator, pt: number, rx: number, rxz: number, rz: number, ryz: number, rxy: number): void {
    this.particleScale = f(this.baseScale * growIn(this.particleAge, this.particleMaxAge, pt));
    super.renderParticle(t, pt, rx, rxz, rz, ryz, rxy);
  }

  override onUpdate(): void {
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    if (this.particleAge++ >= this.particleMaxAge) this.setDead();
    this.setParticleTextureIndex(7 - Math.trunc((this.particleAge * 8) / this.particleMaxAge));
    this.moveEntity(this.motionX, this.motionY, this.motionZ);
    this.motionX *= f(0.96);
    this.motionY *= f(0.96);
    this.motionZ *= f(0.96);
    const p = this.worldObj.getClosestPlayerToEntity(this, 2);
    if (p && this.posY > p.boundingBox.minY) {
      this.posY += (p.boundingBox.minY - this.posY) * 0.2;
      this.motionY += (p.motionY - this.motionY) * 0.2;
      this.setPosition(this.posX, this.posY, this.posZ);
    }
    if (this.onGround) {
      this.motionX *= f(0.7);
      this.motionZ *= f(0.7);
    }
  }
}

/** The "pop in" of smoke-like particles: full size after 1/32 of the lifetime. */
export function growIn(age: number, maxAge: number, pt: number): number {
  let k = f(f(f(age + pt) / maxAge) * 32);
  if (k < 0) k = 0;
  if (k > 1) k = 1;
  return k;
}
