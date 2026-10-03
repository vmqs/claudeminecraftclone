import type { World } from '../../world/World';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/**
 * "explode": the small white-grey smoke puff of explosions, dying mobs and spawners, rising
 * slowly through the eight smoke frames.
 */
export class EntityExplodeFX extends EntityFX {
  constructor(w: World, x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    super(w, x, y, z, vx, vy, vz);
    this.motionX = vx + f(f(Math.random() * 2 - 1) * f(0.05));
    this.motionY = vy + f(f(Math.random() * 2 - 1) * f(0.05));
    this.motionZ = vz + f(f(Math.random() * 2 - 1) * f(0.05));
    this.particleRed = this.particleGreen = this.particleBlue = f(f(this.rand.nextFloat() * f(0.3)) + f(0.7));
    this.particleScale = f(f(f(this.rand.nextFloat() * this.rand.nextFloat()) * 6) + 1);
    this.particleMaxAge = Math.trunc(16 / (this.rand.nextFloat() * 0.8 + 0.2)) + 2;
  }

  override onUpdate(): void {
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    if (this.particleAge++ >= this.particleMaxAge) this.setDead();
    this.setParticleTextureIndex(7 - Math.trunc((this.particleAge * 8) / this.particleMaxAge));
    this.motionY += 0.004;
    this.moveEntity(this.motionX, this.motionY, this.motionZ);
    this.motionX *= f(0.9);
    this.motionY *= f(0.9);
    this.motionZ *= f(0.9);
    if (this.onGround) {
      this.motionX *= f(0.7);
      this.motionZ *= f(0.7);
    }
  }
}
