import type { World } from '../../world/World';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/**
 * A tiny dark speck that drifts without colliding: "townaura" (mycelium), "depthsuspend"
 * (void fog near bedrock) and, re-textured and white, "happyVillager".
 */
export class EntityAuraFX extends EntityFX {
  constructor(w: World, x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    super(w, x, y, z, vx, vy, vz);
    const grey = f(f(this.rand.nextFloat() * f(0.1)) + f(0.2));
    this.particleRed = this.particleGreen = this.particleBlue = grey;
    this.setParticleTextureIndex(0);
    this.setSize(f(0.02), f(0.02));
    this.particleScale = f(this.particleScale * f(f(this.rand.nextFloat() * f(0.6)) + f(0.5)));
    this.motionX *= f(0.02);
    this.motionY *= f(0.02);
    this.motionZ *= f(0.02);
    this.particleMaxAge = Math.trunc(20 / (Math.random() * 0.8 + 0.2));
    this.noClip = true;
  }

  override onUpdate(): void {
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    this.moveEntity(this.motionX, this.motionY, this.motionZ);
    this.motionX *= 0.99;
    this.motionY *= 0.99;
    this.motionZ *= 0.99;
    if (this.particleMaxAge-- <= 0) this.setDead();
  }
}
