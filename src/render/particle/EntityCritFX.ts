import type { World } from '../../world/World';
import type { Tessellator } from '../gl/Tessellator';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/** The star of a critical hit ("crit"; "magicCrit" is tinted by its spawner). */
export class EntityCritFX extends EntityFX {
  private readonly baseScale: number;

  constructor(w: World, x: number, y: number, z: number, vx: number, vy: number, vz: number, scale = 1) {
    super(w, x, y, z, 0, 0, 0);
    this.motionX *= f(0.1);
    this.motionY *= f(0.1);
    this.motionZ *= f(0.1);
    this.motionX += vx * 0.4;
    this.motionY += vy * 0.4;
    this.motionZ += vz * 0.4;
    this.particleRed = this.particleGreen = this.particleBlue = f(Math.random() * f(0.3) + f(0.6));
    this.particleScale = f(this.particleScale * f(0.75));
    this.particleScale = f(this.particleScale * scale);
    this.baseScale = this.particleScale;
    this.particleMaxAge = Math.trunc(6 / (Math.random() * 0.8 + 0.6));
    this.particleMaxAge = Math.trunc(f(this.particleMaxAge * scale));
    this.noClip = false;
    this.setParticleTextureIndex(65);
    this.onUpdate();
  }

  override renderParticle(t: Tessellator, pt: number, rx: number, rxz: number, rz: number, ryz: number, rxy: number): void {
    let k = f(f(f(this.particleAge + pt) / this.particleMaxAge) * 32);
    if (k < 0) k = 0;
    if (k > 1) k = 1;
    this.particleScale = f(this.baseScale * k);
    super.renderParticle(t, pt, rx, rxz, rz, ryz, rxy);
  }

  override onUpdate(): void {
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    if (this.particleAge++ >= this.particleMaxAge) this.setDead();
    this.moveEntity(this.motionX, this.motionY, this.motionZ);
    this.particleGreen = f(this.particleGreen * 0.96);
    this.particleBlue = f(this.particleBlue * 0.9);
    this.motionX *= f(0.7);
    this.motionY *= f(0.7);
    this.motionZ *= f(0.7);
    this.motionY -= f(0.02);
    if (this.onGround) {
      this.motionX *= f(0.7);
      this.motionZ *= f(0.7);
    }
  }
}
