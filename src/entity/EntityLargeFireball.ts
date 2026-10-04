import type { MovingObjectPosition } from '../core/MovingObjectPosition';
import { DamageSource } from './DamageSource';
import { EntityFireball } from './EntityFireball';
import type { TagCompound } from '../item/ItemStack';
import { NBT } from '../world/storage/NBT';

/** A ghast fireball (EntityLargeFireball): 6 damage to what it hits and a flaming explosion. */
export class EntityLargeFireball extends EntityFireball {
  /** Explosion strength (field_92057_e, "ExplosionPower"). */
  explosionPower = 1;

  protected onImpact(hit: MovingObjectPosition): void {
    if (hit.entityHit) hit.entityHit.attackEntityFrom(DamageSource.causeFireballDamage(this, this.shootingEntity), 6);
    this.worldObj.newExplosion(null, this.posX, this.posY, this.posZ, this.explosionPower, true, this.worldObj.worldInfo.gameRules.mobGriefing);
    this.setDead();
  }

  override writeEntityToNBT(tag: TagCompound): void {
    super.writeEntityToNBT(tag);
    NBT.setInteger(tag, 'ExplosionPower', this.explosionPower);
  }

  override readEntityFromNBT(tag: TagCompound): void {
    super.readEntityFromNBT(tag);
    if (NBT.hasKey(tag, 'ExplosionPower')) this.explosionPower = NBT.getInteger(tag, 'ExplosionPower');
  }
}
