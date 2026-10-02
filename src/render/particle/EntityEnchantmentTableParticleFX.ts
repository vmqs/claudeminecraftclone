import type { World } from '../../world/World';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/**
 * "enchantmenttable": one of the 26 glyphs of particles.png (cells 225-250) flying from a
 * bookshelf into the table along a curve that dips at the end; it brightens to full light as
 * it arrives. The velocity is the offset from the target, not a speed.
 */
export class EntityEnchantmentTableParticleFX extends EntityFX {
  private readonly startX: number;
  private readonly startY: number;
  private readonly startZ: number;

  constructor(w: World, x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    super(w, x, y, z, vx, vy, vz);
    this.motionX = vx;
    this.motionY = vy;
    this.motionZ = vz;
    this.startX = this.posX = x;
    this.startY = this.posY = y;
    this.startZ = this.posZ = z;
    const k = f(f(this.rand.nextFloat() * f(0.6)) + f(0.4));
    this.particleScale = f(f(this.rand.nextFloat() * f(0.5)) + f(0.2));
    this.particleRed = this.particleGreen = this.particleBlue = k;
    this.particleGreen = f(this.particleGreen * f(0.9));
    this.particleRed = f(this.particleRed * f(0.9));
    this.particleMaxAge = Math.trunc(Math.random() * 10) + 30;
    this.noClip = true;
    this.setParticleTextureIndex(Math.trunc(Math.random() * 26 + 1 + 224));
  }

  override getBrightnessForRender(pt: number): number {
    return brightenSky(super.getBrightnessForRender(pt), this.particleAge, this.particleMaxAge);
  }

  override getBrightness(pt: number): number {
    const b = super.getBrightness(pt);
    let k = f(this.particleAge / this.particleMaxAge);
    k = f(k * k);
    k = f(k * k);
    return f(f(b * f(1 - k)) + k);
  }

  override onUpdate(): void {
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    const left = f(1 - f(this.particleAge / this.particleMaxAge));
    let dip = f(1 - left);
    dip = f(dip * dip);
    dip = f(dip * dip);
    this.posX = this.startX + this.motionX * left;
    this.posY = this.startY + this.motionY * left - f(dip * f(1.2));
    this.posZ = this.startZ + this.motionZ * left;
    if (this.particleAge++ >= this.particleMaxAge) this.setDead();
  }
}

/**
 * Portal and enchantment glyphs: the sky-light half of the packed brightness rises with
 * (age / maxAge)^4 up to 240 (the block-light half is kept).
 */
export function brightenSky(packed: number, age: number, maxAge: number): number {
  let k = f(age / maxAge);
  k = f(k * k);
  k = f(k * k);
  const block = packed & 255;
  let sky = (packed >> 16) & 255;
  sky += Math.trunc(f(f(k * 15) * 16));
  if (sky > 240) sky = 240;
  return block | (sky << 16);
}
