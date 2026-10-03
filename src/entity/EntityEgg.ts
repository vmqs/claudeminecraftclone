import type { MovingObjectPosition } from '../core/MovingObjectPosition';
import { DamageSource } from './DamageSource';
import { EntityList } from './EntityList';
import { EntityThrowable } from './EntityThrowable';

/** A thrown egg (EntityEgg): 1 in 8 hatches a baby chicken, 1 in 256 four of them. */
export class EntityEgg extends EntityThrowable {
  protected onImpact(hit: MovingObjectPosition): void {
    if (hit.entityHit) hit.entityHit.attackEntityFrom(DamageSource.causeThrownDamage(this, this.getThrower()), 0);
    if (this.rand.nextInt(8) === 0) {
      let n = 1;
      if (this.rand.nextInt(32) === 0) n = 4;
      for (let i = 0; i < n; i++) {
        const chick = EntityList.createEntityByName('Chicken', this.worldObj);
        if (!chick) continue;
        (chick as { setGrowingAge?(age: number): void }).setGrowingAge?.(-24000);
        chick.setLocationAndAngles(this.posX, this.posY, this.posZ, this.rotationYaw, 0);
        this.worldObj.spawnEntityInWorld(chick);
      }
    }
    if (this.impactParticlesVisible(hit)) {
      for (let i = 0; i < 8; i++) this.worldObj.spawnParticle('snowballpoof', this.posX, this.posY, this.posZ, 0, 0, 0);
    }
    this.setDead();
  }
}
