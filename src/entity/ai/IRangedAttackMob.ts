import type { EntityLiving } from '../EntityLiving';

/** Mobs that shoot (IRangedAttackMob): skeletons, snow golems, witches, the wither. */
export interface IRangedAttackMob {
  /** `power` is 0.1-1 by distance (bow draw strength for skeletons). */
  attackEntityWithRangedAttack(target: EntityLiving, power: number): void;
}
