import type { EntityLiving } from '../EntityLiving';
import type { EntityTameable } from '../EntityTameable';
import { EntityAITarget } from './EntityAITarget';

/** A pet attacks whatever hurt its owner (the owner's revenge target). */
export class EntityAIOwnerHurtByTarget extends EntityAITarget {
  private theOwnerAttacker: EntityLiving | null = null;

  constructor(private readonly theDefendingTameable: EntityTameable) {
    super(theDefendingTameable, 32, false);
    this.setMutexBits(1);
  }

  shouldExecute(): boolean {
    if (!this.theDefendingTameable.isTamed()) return false;
    const owner = this.theDefendingTameable.getOwner();
    if (!owner) return false;
    this.theOwnerAttacker = owner.getAITarget();
    return this.isSuitableTarget(this.theOwnerAttacker, false);
  }

  override startExecuting(): void {
    this.taskOwner.setAttackTarget(this.theOwnerAttacker);
    super.startExecuting();
  }
}
