import type { EntityTameable } from '../EntityTameable';
import { EntityAINearestAttackableTarget, type TargetClass } from './EntityAINearestAttackableTarget';

/** Wild wolves and ocelots hunting sheep / chickens; tamed ones never do. */
export class EntityAITargetNonTamed extends EntityAINearestAttackableTarget {
  constructor(
    private readonly theTameable: EntityTameable,
    targetClass: TargetClass,
    distance: number,
    chance: number,
    checkSight: boolean,
  ) {
    super(theTameable, targetClass, distance, chance, checkSight);
  }

  override shouldExecute(): boolean {
    return this.theTameable.isTamed() ? false : super.shouldExecute();
  }
}
