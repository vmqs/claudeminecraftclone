import type { World } from '../../world/World';
import type { Tessellator } from '../gl/Tessellator';
import { brightenSky } from './EntityEnchantmentTableParticleFX';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/**
 * "portal": the purple specks of portals, endermen and ender pearls (one of the eight smoke
 * cells). The velocity is an offset: the speck starts there and is drawn back to its spawn
 * point while drifting up by one block, brightening as it goes.
 */
export class EntityPortalFX extends EntityFX {
  private readonly portalParticleScale: number;
  private readonly portalPosX: number;
  private readonly portalPosY: number;
  private readonly portalPosZ: number;

  constructor(w: World, x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    super(w, x, y, z, vx, vy, vz);
    this.motionX = vx;
    this.motionY = vy;
    this.motionZ = vz;
    this.portalPosX = this.posX = x;
    this.portalPosY = this.posY = y;
    this.portalPosZ = this.posZ = z;
    const k = f(f(this.rand.nextFloat() * f(0.6)) + f(0.4));
    this.portalParticleScale = this.particleScale = f(f(this.rand.nextFloat() * f(0.2)) + f(0.5));
    this.particleRed = this.particleGreen = this.particleBlue = k;
    this.particleGreen = f(this.particleGreen * f(0.3));
    this.particleRed = f(this.particleRed * f(0.9));
    this.particleMaxAge = Math.trunc(Math.random() * 10) + 40;
    this.noClip = true;
    this.setParticleTextureIndex(Math.trunc(Math.random() * 8));
  }

  override renderParticle(t: Tessellator, pt: number, rx: number, rxz: number, rz: number, ryz: number, rxy: number): void {
    let k = f(f(this.particleAge + pt) / this.particleMaxAge);
    k = f(1 - k);
    k = f(k * k);
    k = f(1 - k);
    this.particleScale = f(this.portalParticleScale * k);
    super.renderParticle(t, pt, rx, rxz, rz, ryz, rxy);
  }

  override getBrightnessForRender(pt: number): number {
    return brightenSky(super.getBrightnessForRender(pt), this.particleAge, this.particleMaxAge);
  }

  override getBrightness(pt: number): number {
    const b = super.getBrightness(pt);
    let k = f(this.particleAge / this.particleMaxAge);
    k = f(f(f(k * k) * k) * k);
    return f(f(b * f(1 - k)) + k);
  }

  override onUpdate(): void {
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    const age = f(this.particleAge / this.particleMaxAge);
    const curve = f(f(-age) + f(f(age * age) * 2));
    const left = f(1 - curve);
    this.posX = this.portalPosX + this.motionX * left;
    this.posY = this.portalPosY + this.motionY * left + f(1 - age);
    this.posZ = this.portalPosZ + this.motionZ * left;
    if (this.particleAge++ >= this.particleMaxAge) this.setDead();
  }
}
