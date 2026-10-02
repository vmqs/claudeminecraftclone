import type { World } from '../../world/World';
import { diesInsideBlock } from './EntityDropParticleFX';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/**
 * The rain splash on the ground (one of cells 19-22), spawned by EntityRenderer's
 * addRainParticles while it rains; "splash" is the same drop one cell to the right.
 */
export class EntityRainFX extends EntityFX {
  constructor(w: World, x: number, y: number, z: number) {
    super(w, x, y, z, 0, 0, 0);
    this.motionX *= f(0.3);
    this.motionY = f(f(Math.random()) * f(0.2) + f(0.1));
    this.motionZ *= f(0.3);
    this.particleRed = this.particleGreen = this.particleBlue = 1;
    this.setParticleTextureIndex(19 + this.rand.nextInt(4));
    this.setSize(f(0.01), f(0.01));
    this.particleGravity = f(0.06);
    this.particleMaxAge = Math.trunc(8 / (Math.random() * 0.8 + 0.2));
  }

  override onUpdate(): void {
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    this.motionY -= this.particleGravity;
    this.moveEntity(this.motionX, this.motionY, this.motionZ);
    this.motionX *= f(0.98);
    this.motionY *= f(0.98);
    this.motionZ *= f(0.98);
    if (this.particleMaxAge-- <= 0) this.setDead();
    if (this.onGround) {
      if (Math.random() < 0.5) this.setDead();
      this.motionX *= f(0.7);
      this.motionZ *= f(0.7);
    }
    diesInsideBlock(this);
  }
}
