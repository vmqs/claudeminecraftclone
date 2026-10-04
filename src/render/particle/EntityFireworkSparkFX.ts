import type { AxisAlignedBB } from '../../core/AxisAlignedBB';
import type { World } from '../../world/World';
import type { Tessellator } from '../gl/Tessellator';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/** Where sparks add the trail sparks they leave behind. */
export interface FXSink {
  addEffect(fx: EntityFX): void;
}

/**
 * "fireworksSpark": one star of a firework explosion, full bright, playing cells 160-167. In
 * the second half of its life it fades out and (with fade colours) blends towards the fade
 * colour; with Trail it drops a copy every other tick, with Twinkle (flicker) it blinks.
 */
export class EntityFireworkSparkFX extends EntityFX {
  private readonly baseTextureIndex = 160;
  private hasTrail = false;
  private hasTwinkle = false;
  private fadeRed = 0;
  private fadeGreen = 0;
  private fadeBlue = 0;
  private hasFadeColour = false;

  constructor(
    w: World,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    private readonly effectRenderer: FXSink,
  ) {
    super(w, x, y, z);
    this.motionX = vx;
    this.motionY = vy;
    this.motionZ = vz;
    this.particleScale = f(this.particleScale * f(0.75));
    this.particleMaxAge = 48 + this.rand.nextInt(12);
    this.noClip = false;
  }

  setTrail(on: boolean): void {
    this.hasTrail = on;
  }

  setTwinkle(on: boolean): void {
    this.hasTwinkle = on;
  }

  setColour(rgb: number): void {
    this.setRBGColorF(f(((rgb & 0xff0000) >> 16) / 255), f(((rgb & 0xff00) >> 8) / 255), f((rgb & 0xff) / 255));
  }

  setFadeColour(rgb: number): void {
    this.fadeRed = f(((rgb & 0xff0000) >> 16) / 255);
    this.fadeGreen = f(((rgb & 0xff00) >> 8) / 255);
    this.fadeBlue = f((rgb & 0xff) / 255);
    this.hasFadeColour = true;
  }

  override getBoundingBox(): AxisAlignedBB | null {
    return null;
  }

  override canBePushed(): boolean {
    return false;
  }

  override renderParticle(t: Tessellator, pt: number, rx: number, rxz: number, rz: number, ryz: number, rxy: number): void {
    const max = this.particleMaxAge;
    if (!this.hasTwinkle || this.particleAge < Math.trunc(max / 3) || Math.trunc((this.particleAge + max) / 3) % 2 === 0) {
      super.renderParticle(t, pt, rx, rxz, rz, ryz, rxy);
    }
  }

  override onUpdate(): void {
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    if (this.particleAge++ >= this.particleMaxAge) this.setDead();
    const half = Math.trunc(this.particleMaxAge / 2);
    if (this.particleAge > half) {
      this.setAlphaF(f(1 - f(f(this.particleAge - half) / this.particleMaxAge)));
      if (this.hasFadeColour) {
        this.particleRed = f(this.particleRed + f(f(this.fadeRed - this.particleRed) * f(0.2)));
        this.particleGreen = f(this.particleGreen + f(f(this.fadeGreen - this.particleGreen) * f(0.2)));
        this.particleBlue = f(this.particleBlue + f(f(this.fadeBlue - this.particleBlue) * f(0.2)));
      }
    }
    this.setParticleTextureIndex(this.baseTextureIndex + (7 - Math.trunc((this.particleAge * 8) / this.particleMaxAge)));
    this.motionY -= 0.004;
    this.moveEntity(this.motionX, this.motionY, this.motionZ);
    this.motionX *= f(0.91);
    this.motionY *= f(0.91);
    this.motionZ *= f(0.91);
    if (this.onGround) {
      this.motionX *= f(0.7);
      this.motionZ *= f(0.7);
    }
    if (this.hasTrail && this.particleAge < half && (this.particleAge + this.particleMaxAge) % 2 === 0) {
      const trail = new EntityFireworkSparkFX(this.worldObj, this.posX, this.posY, this.posZ, 0, 0, 0, this.effectRenderer);
      trail.setRBGColorF(this.particleRed, this.particleGreen, this.particleBlue);
      trail.particleAge = Math.trunc(trail.particleMaxAge / 2);
      if (this.hasFadeColour) {
        trail.hasFadeColour = true;
        trail.fadeRed = this.fadeRed;
        trail.fadeGreen = this.fadeGreen;
        trail.fadeBlue = this.fadeBlue;
      }
      trail.hasTwinkle = this.hasTwinkle;
      this.effectRenderer.addEffect(trail);
    }
  }

  override getBrightnessForRender(_pt: number): number {
    return 15728880;
  }

  override getBrightness(_pt: number): number {
    return 1;
  }
}
