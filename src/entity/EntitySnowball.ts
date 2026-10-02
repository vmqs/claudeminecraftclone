import type { MovingObjectPosition } from '../core/MovingObjectPosition';
import { DamageSource } from './DamageSource';
import { EntityList } from './EntityList';
import { EntityThrowable } from './EntityThrowable';

/** A thrown snowball (EntitySnowball): knocks back what it hits, 3 damage to blazes only. */
export class EntitySnowball extends EntityThrowable {
  protected onImpact(hit: MovingObjectPosition): void {
    if (hit.entityHit) {
      const dmg = EntityList.getEntityString(hit.entityHit) === 'Blaze' ? 3 : 0;
      hit.entityHit.attackEntityFrom(DamageSource.causeThrownDamage(this, this.getThrower()), dmg);
    }
    if (this.impactParticlesVisible(hit)) {
      for (let i = 0; i < 8; i++) this.worldObj.spawnParticle('snowballpoof', this.posX, this.posY, this.posZ, 0, 0, 0);
    }
    this.setDead();
  }
}
