import type { MovingObjectPosition } from '../core/MovingObjectPosition';
import { getXPSplit } from './EntityLiving';
import { EntityThrowable } from './EntityThrowable';
import { EntityXPOrb } from './EntityXPOrb';

const f = Math.fround;

/** A thrown bottle o' enchanting (EntityExpBottle): breaks into 3-11 experience. */
export class EntityExpBottle extends EntityThrowable {
  protected override getGravityVelocity(): number {
    return f(0.07);
  }

  protected override getThrowVelocity(): number {
    return f(0.7);
  }

  protected override getThrowPitchOffset(): number {
    return -20;
  }

  protected onImpact(_hit: MovingObjectPosition): void {
    const w = this.worldObj;
    w.playAuxSFX(2002, Math.round(this.posX), Math.round(this.posY), Math.round(this.posZ), 0);
    let xp = 3 + w.rand.nextInt(5) + w.rand.nextInt(5);
    while (xp > 0) {
      const split = getXPSplit(xp);
      xp -= split;
      w.spawnEntityInWorld(new EntityXPOrb(w, this.posX, this.posY, this.posZ, split));
    }
    this.setDead();
  }
}
