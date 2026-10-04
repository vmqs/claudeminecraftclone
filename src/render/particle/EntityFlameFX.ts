import type { World } from '../../world/World';
import type { Tessellator } from '../gl/Tessellator';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/**
 * "flame" (cell 48): torches, furnaces, spawners, fire charges. It shrinks while its block
 * light rises towards full brightness over its life.
 */
export class EntityFlameFX extends EntityFX {
  private readonly flameScale: number;

  constructor(w: World, x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    super(w, x, y, z, vx, vy, vz);
    this.motionX = this.motionX * f(0.01) + vx;
    this.motionY = this.motionY * f(0.01) + vy;
    this.motionZ = this.motionZ * f(0.01) + vz;
    // The original jitters copies of the spawn coordinates here, which changes nothing but the
    // random sequence.
    for (let i = 0; i < 3; i++) {
      this.rand.nextFloat();
      this.rand.nextFloat();
    }
    this.flameScale = this.particleScale;
    this.particleRed = this.particleGreen = this.particleBlue = 1;
    this.particleMaxAge = Math.trunc(8 / (Math.random() * 0.8 + 0.2)) + 4;
    this.noClip = true;
    this.setParticleTextureIndex(48);
  }

  override renderParticle(t: Tessellator, pt: number, rx: number, rxz: number, rz: number, ryz: number, rxy: number): void {
    const k = f(f(this.particleAge + pt) / this.particleMaxAge);
    this.particleScale = f(this.flameScale * f(1 - f(f(k * k) * f(0.5))));
    super.renderParticle(t, pt, rx, rxz, rz, ryz, rxy);
  }

  override getBrightnessForRender(pt: number): number {
    const k = lifeFraction(this.particleAge, this.particleMaxAge, pt);
    const packed = super.getBrightnessForRender(pt);
    let block = packed & 255;
    const sky = (packed >> 16) & 255;
    block += Math.trunc(f(f(k * 15) * 16));
    if (block > 240) block = 240;
    return block | (sky << 16);
  }

  override getBrightness(pt: number): number {
    const k = lifeFraction(this.particleAge, this.particleMaxAge, pt);
    return f(f(super.getBrightness(pt) * k) + f(1 - k));
  }

  override onUpdate(): void {
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    if (this.particleAge++ >= this.particleMaxAge) this.setDead();
    this.moveEntity(this.motionX, this.motionY, this.motionZ);
    this.motionX *= f(0.96);
    this.motionY *= f(0.96);
    this.motionZ *= f(0.96);
    if (this.onGround) {
      this.motionX *= f(0.7);
      this.motionZ *= f(0.7);
    }
  }
}

/** (age + partialTicks) / maxAge clamped to 0..1. */
export function lifeFraction(age: number, maxAge: number, pt: number): number {
  let k = f(f(age + pt) / maxAge);
  if (k < 0) k = 0;
  if (k > 1) k = 1;
  return k;
}
