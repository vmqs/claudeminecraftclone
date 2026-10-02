import { Material } from '../../block/Material';
import { MathHelper } from '../../core/MathHelper';
import type { World } from '../../world/World';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/** "bubble": rises slowly under water and pops as soon as it leaves it. */
export class EntityBubbleFX extends EntityFX {
  constructor(w: World, x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    super(w, x, y, z, vx, vy, vz);
    this.particleRed = this.particleGreen = this.particleBlue = 1;
    this.setParticleTextureIndex(32);
    this.setSize(f(0.02), f(0.02));
    this.particleScale = f(this.particleScale * f(f(this.rand.nextFloat() * f(0.6)) + f(0.2)));
    this.motionX = vx * f(0.2) + f(f(Math.random() * 2 - 1) * f(0.02));
    this.motionY = vy * f(0.2) + f(f(Math.random() * 2 - 1) * f(0.02));
    this.motionZ = vz * f(0.2) + f(f(Math.random() * 2 - 1) * f(0.02));
    this.particleMaxAge = Math.trunc(8 / (Math.random() * 0.8 + 0.2));
  }

  override onUpdate(): void {
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    this.motionY += 0.002;
    this.moveEntity(this.motionX, this.motionY, this.motionZ);
    this.motionX *= f(0.85);
    this.motionY *= f(0.85);
    this.motionZ *= f(0.85);
    const m = this.worldObj.getBlockMaterial(MathHelper.floor_double(this.posX), MathHelper.floor_double(this.posY), MathHelper.floor_double(this.posZ));
    if (m !== Material.water) this.setDead();
    if (this.particleMaxAge-- <= 0) this.setDead();
  }
}
