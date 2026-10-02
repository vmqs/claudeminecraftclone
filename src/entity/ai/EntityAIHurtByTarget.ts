import { AxisAlignedBB } from '../../core/AxisAlignedBB';
import type { EntityLiving } from '../EntityLiving';
import type { EntityPlayer } from '../EntityPlayer';
import { EntityAITarget } from './EntityAITarget';

/**
 * Targets whoever hurt the owner (EntityAIHurtByTarget), Creative players included (revenge
 * skips the invulnerability test, as in 1.5.2); with `callForHelp` every idle mob of the same
 * class within 16 blocks (10 up and down) joins in. The target is only dropped on reset when it
 * is a player that cannot be damaged.
 */
export class EntityAIHurtByTarget extends EntityAITarget {
  private lastAttacker: EntityLiving | null = null;

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
    return t !== null && t !== this.lastAttacker;
  }

  override startExecuting(): void {
    const owner = this.taskOwner;
    owner.setAttackTarget(owner.getAITarget());
    this.lastAttacker = owner.getAITarget();
    if (this.callForHelp) {
      const cls = owner.constructor;
      const box = AxisAlignedBB.getBoundingBox(owner.posX, owner.posY, owner.posZ, owner.posX + 1, owner.posY + 1, owner.posZ + 1).expand(this.targetDistance, 10, this.targetDistance);
      for (const e of owner.worldObj.getEntitiesWithinAABBExcludingEntity(null, box, (o) => o instanceof cls)) {
        const other = e as EntityLiving;
        if (other !== owner && other.getAttackTarget() === null) other.setAttackTarget(owner.getAITarget());
      }
    }
    super.startExecuting();
  }

  override resetTask(): void {
    const t = this.taskOwner.getAttackTarget();
    if (t && t.isPlayerEntity && (t as unknown as EntityPlayer).capabilities.disableDamage) super.resetTask();
  }
}
