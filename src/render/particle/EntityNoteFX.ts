import { MathHelper } from '../../core/MathHelper';
import type { World } from '../../world/World';
import type { Tessellator } from '../gl/Tessellator';
import { growIn } from './EntityCloudFX';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/**
 * "note" (cell 64): the note block's coloured note. The x velocity is the pitch as a fraction
 * of the 24 semitones, mapped onto a hue wheel (three phase-shifted sines).
 */
export class EntityNoteFX extends EntityFX {
  private readonly noteParticleScale: number;

  constructor(w: World, x: number, y: number, z: number, hue: number, _vy: number, _vz: number, scale = 2) {
    super(w, x, y, z, 0, 0, 0);
    this.motionX *= f(0.01);
    this.motionY *= f(0.01);
    this.motionZ *= f(0.01);
    this.motionY += 0.2;
    const h = f(hue);
    const tau = f(f(Math.PI) * 2);
    this.particleRed = f(f(MathHelper.sin(f(f(h + 0) * tau)) * f(0.65)) + f(0.35));
    this.particleGreen = f(f(MathHelper.sin(f(f(h + f(0.33333334)) * tau)) * f(0.65)) + f(0.35));
    this.particleBlue = f(f(MathHelper.sin(f(f(h + f(0.6666667)) * tau)) * f(0.65)) + f(0.35));
    this.particleScale = f(this.particleScale * f(0.75));
    this.particleScale = f(this.particleScale * scale);
    this.noteParticleScale = this.particleScale;
    this.particleMaxAge = 6;
    this.noClip = false;
    this.setParticleTextureIndex(64);
  }

  override renderParticle(t: Tessellator, pt: number, rx: number, rxz: number, rz: number, ryz: number, rxy: number): void {
    this.particleScale = f(this.noteParticleScale * growIn(this.particleAge, this.particleMaxAge, pt));
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
    this.motionX *= f(0.66);
    this.motionY *= f(0.66);
    this.motionZ *= f(0.66);
    if (this.onGround) {
      this.motionX *= f(0.7);
      this.motionZ *= f(0.7);
    }
  }
}
