import { AxisAlignedBB } from '../../core/AxisAlignedBB';
import type { Entity } from '../Entity';
import type { EntityLiving } from '../EntityLiving';
import { EntityAITarget } from './EntityAITarget';

/**
 * Targets whoever last hurt this mob (getAITarget). With `callForHelp` every mob of the same
 * class within 16 blocks (10 up/down) without a target joins in. A Creative attacker is never
 * a revenge target (EntityAITarget.isSuitableTarget).
 */
export class EntityAIHurtByTarget extends EntityAITarget {
  private lastRevengeTarget: EntityLiving | null = null;

  constructor(
    owner: EntityLiving,
    private readonly callForHelp: boolean,
  ) {
    super(owner, 16, false);
    this.setMutexBits(1);
  }

  shouldExecute(): boolean {
    return this.isSuitableTarget(this.taskOwner.getAITarget(), true);
  }

  override continueExecuting(): boolean {
    const t = this.taskOwner.getAITarget();
    return t !== null && t !== this.lastRevengeTarget;
  }

  override startExecuting(): void {
    const owner = this.taskOwner;
    owner.setAttackTarget(owner.getAITarget());
    this.lastRevengeTarget = owner.getAITarget();
    if (this.callForHelp) {
      const cls = owner.constructor as abstract new (...args: never[]) => EntityLiving;
      const box = AxisAlignedBB.getBoundingBox(owner.posX, owner.posY, owner.posZ, owner.posX + 1, owner.posY + 1, owner.posZ + 1).expand(this.targetDistance, 10, this.targetDistance);
      for (const other of owner.worldObj.getEntitiesWithinAABB((e: Entity): e is EntityLiving => e instanceof cls, box)) {
        if (other !== owner && other.getAttackTarget() === null) other.setAttackTarget(owner.getAITarget());
      }
    }
    super.startExecuting();
  }

  override resetTask(): void {
    const t = this.taskOwner.getAttackTarget();
    if (t && t.isPlayerEntity && t.isCreativeInvulnerable()) super.resetTask();
  }
}
