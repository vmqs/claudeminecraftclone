import type { MovingObjectPosition } from '../core/MovingObjectPosition';
import { DamageSource } from './DamageSource';
import { EntityFireball } from './EntityFireball';

/** A ghast fireball (EntityLargeFireball): 6 damage to what it hits and a flaming explosion. */
export class EntityLargeFireball extends EntityFireball {
  /** Explosion strength (field_92057_e, "ExplosionPower"). */
  explosionPower = 1;

  protected onImpact(hit: MovingObjectPosition): void {
    if (hit.entityHit) hit.entityHit.attackEntityFrom(DamageSource.causeFireballDamage(this, this.shootingEntity), 6);
    this.worldObj.newExplosion(null, this.posX, this.posY, this.posZ, this.explosionPower, true, this.worldObj.worldInfo.gameRules.mobGriefing);
    this.setDead();
  }
}
