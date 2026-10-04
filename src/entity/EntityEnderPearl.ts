import type { MovingObjectPosition } from '../core/MovingObjectPosition';
import { DamageSource } from './DamageSource';
import { EntityThrowable } from './EntityThrowable';

/** A thrown ender pearl (EntityEnderPearl): teleports the throwing player and hurts them 5 (fall). */
export class EntityEnderPearl extends EntityThrowable {
  protected onImpact(hit: MovingObjectPosition): void {
    if (hit.entityHit) hit.entityHit.attackEntityFrom(DamageSource.causeThrownDamage(this, this.getThrower()), 0);
    if (this.impactParticlesVisible(hit)) {
      for (let i = 0; i < 32; i++) {
        this.worldObj.spawnParticle('portal', this.posX, this.posY + this.rand.nextDouble() * 2, this.posZ, this.rand.nextGaussian(), 0, this.rand.nextGaussian());
      }
    }
    const thrower = this.getThrower();
    if (thrower && thrower.isPlayerEntity && thrower.worldObj === this.worldObj) {
      thrower.setPositionAndUpdate(this.posX, this.posY, this.posZ);
      thrower.fallDistance = 0;
      thrower.attackEntityFrom(DamageSource.fall, 5);
    }
    this.setDead();
  }
}
