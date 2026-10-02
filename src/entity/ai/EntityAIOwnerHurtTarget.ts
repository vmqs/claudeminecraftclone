import type { EntityLiving } from '../EntityLiving';
import type { EntityTameable } from '../EntityTameable';
import { EntityAITarget } from './EntityAITarget';

/** A pet attacks whatever its owner last attacked. */
export class EntityAIOwnerHurtTarget extends EntityAITarget {
  private theTarget: EntityLiving | null = null;

  constructor(private readonly theEntityTameable: EntityTameable) {
    super(theEntityTameable, 32, false);
    this.setMutexBits(1);
  }

  shouldExecute(): boolean {
    if (!this.theEntityTameable.isTamed()) return false;
    const owner = this.theEntityTameable.getOwner();
    if (!owner) return false;
    this.theTarget = owner.getLastAttackingEntity();
    return this.isSuitableTarget(this.theTarget, false);
  }

  override startExecuting(): void {
    this.taskOwner.setAttackTarget(this.theTarget);
    super.startExecuting();
  }
}
