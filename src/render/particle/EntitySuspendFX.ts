import { Material } from '../../block/Material';
import { MathHelper } from '../../core/MathHelper';
import type { World } from '../../world/World';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/** "suspended": a motionless blue-grey speck floating in water (underwater ambience). */
export class EntitySuspendFX extends EntityFX {
  constructor(w: World, x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    super(w, x, y - 0.125, z, vx, vy, vz);
    this.setRBGColorF(f(0.4), f(0.4), f(0.7));
    this.setParticleTextureIndex(0);
    this.setSize(f(0.01), f(0.01));
    this.particleScale = f(this.particleScale * f(f(this.rand.nextFloat() * f(0.6)) + f(0.2)));
    this.motionX = vx * 0;
    this.motionY = vy * 0;
    this.motionZ = vz * 0;
    this.particleMaxAge = Math.trunc(16 / (Math.random() * 0.8 + 0.2));
  }

  override onUpdate(): void {
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    this.moveEntity(this.motionX, this.motionY, this.motionZ);
    const m = this.worldObj.getBlockMaterial(MathHelper.floor_double(this.posX), MathHelper.floor_double(this.posY), MathHelper.floor_double(this.posZ));
    if (m !== Material.water) this.setDead();
    if (this.particleMaxAge-- <= 0) this.setDead();
  }
}
