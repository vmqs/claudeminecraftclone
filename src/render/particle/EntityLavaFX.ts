import type { World } from '../../world/World';
import type { Tessellator } from '../gl/Tessellator';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/**
 * "lava" (cell 49): the spark popping out of a lava surface. Full block light, it arcs up,
 * shrinks and leaves a trail of "smoke" (more often while young).
 */
export class EntityLavaFX extends EntityFX {
  private readonly lavaParticleScale: number;

  constructor(w: World, x: number, y: number, z: number) {
    super(w, x, y, z, 0, 0, 0);
    this.motionX *= f(0.8);
    this.motionY *= f(0.8);
    this.motionZ *= f(0.8);
    this.motionY = f(f(this.rand.nextFloat() * f(0.4)) + f(0.05));
    this.particleRed = this.particleGreen = this.particleBlue = 1;
    this.particleScale = f(this.particleScale * f(f(this.rand.nextFloat() * 2) + f(0.2)));
    this.lavaParticleScale = this.particleScale;
    this.particleMaxAge = Math.trunc(16 / (Math.random() * 0.8 + 0.2));
    this.noClip = false;
    this.setParticleTextureIndex(49);
  }

  override getBrightnessForRender(pt: number): number {
    const sky = (super.getBrightnessForRender(pt) >> 16) & 255;
    return 240 | (sky << 16);
  }

  override getBrightness(_pt: number): number {
    return 1;
  }

  override renderParticle(t: Tessellator, pt: number, rx: number, rxz: number, rz: number, ryz: number, rxy: number): void {
    const k = f(f(this.particleAge + pt) / this.particleMaxAge);
    this.particleScale = f(this.lavaParticleScale * f(1 - f(k * k)));
    super.renderParticle(t, pt, rx, rxz, rz, ryz, rxy);
  }

  override onUpdate(): void {
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    if (this.particleAge++ >= this.particleMaxAge) this.setDead();
    const k = f(this.particleAge / this.particleMaxAge);
    if (this.rand.nextFloat() > k) this.worldObj.spawnParticle('smoke', this.posX, this.posY, this.posZ, this.motionX, this.motionY, this.motionZ);
    this.motionY -= 0.03;
    this.moveEntity(this.motionX, this.motionY, this.motionZ);
    this.motionX *= f(0.999);
    this.motionY *= f(0.999);
    this.motionZ *= f(0.999);
    if (this.onGround) {
      this.motionX *= f(0.7);
      this.motionZ *= f(0.7);
    }
  }
}
