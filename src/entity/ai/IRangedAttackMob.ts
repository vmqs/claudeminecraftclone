import type { EntityLiving } from '../EntityLiving';

/** A mob with a ranged attack (IRangedAttackMob): skeletons, witches, snow golems. */
export interface IRangedAttackMob {
  /** Fires at the target; `strength` is the distance factor (0.1-1) of EntityAIArrowAttack. */
  attackEntityWithRangedAttack(target: EntityLiving, strength: number): void;
}
