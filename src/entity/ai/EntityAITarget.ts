import { MathHelper } from '../../core/MathHelper';
import type { EntityLiving } from '../EntityLiving';
import type { EntityPlayer } from '../EntityPlayer';
import { EntityList } from '../EntityList';
import { EntityAIBase } from './EntityAIBase';

/** What target selection needs of a tameable mob (EntityTameable), checked by duck typing. */
interface TameableLike {
  isTamed(): boolean;
  getOwner(): EntityLiving | null;
}

function asTameable(e: EntityLiving): TameableLike | null {
  const t = e as EntityLiving & Partial<TameableLike>;
  return typeof t.isTamed === 'function' && typeof t.getOwner === 'function' ? (t as TameableLike) : null;
}

/**
 * Base of the target-selecting tasks (EntityAITarget): keeps the attack target while it lives,
 * stays in range and (with sight checks) was seen in the last 60 ticks. isSuitableTarget()
 * applies the 1.5.2 rules: no self, no dead targets, canAttackClass, tamed mobs spare their
 * owner and other tamed mobs, players whose capabilities disable damage (Creative) are skipped
 * unless `allowInvulnerable` (revenge), the home area, line of sight and the optional
 * reachability check (a path ending within 1.5 blocks of the target).
 */
export abstract class EntityAITarget extends EntityAIBase {
  protected targetDistance: number;
  /** Re-check reachability: 0 = unknown, 1 = reachable, 2 = not (field_75301_b). */
  private reachCache = 0;
  /** Ticks until the reachability check is repeated (field_75302_c). */
  private reachDelay = 0;
  /** Ticks the target has been out of sight (field_75298_g). */
  private unseenTicks = 0;

  constructor(
    protected readonly taskOwner: EntityLiving,
    targetDistance: number,
    protected readonly shouldCheckSight: boolean,
    private readonly nearbyOnly = false,
  ) {
    super();
    this.targetDistance = targetDistance;
  }

  override continueExecuting(): boolean {
    const t = this.taskOwner.getAttackTarget();
    if (!t || !t.isEntityAlive()) return false;
    if (this.taskOwner.getDistanceSqToEntity(t) > this.targetDistance * this.targetDistance) return false;
    if (this.shouldCheckSight) {
      if (this.taskOwner.getEntitySenses().canSee(t)) this.unseenTicks = 0;
      else if (++this.unseenTicks > 60) return false;
    }
    return true;
  }

  override startExecuting(): void {
    this.reachCache = 0;
    this.reachDelay = 0;
    this.unseenTicks = 0;
  }

  override resetTask(): void {
    this.taskOwner.setAttackTarget(null);
  }

  protected isSuitableTarget(target: EntityLiving | null, allowInvulnerable: boolean): boolean {
    if (!target || target === this.taskOwner || !target.isEntityAlive()) return false;
    if (!this.taskOwner.canAttackClass(EntityList.getEntityString(target))) return false;
    const tame = asTameable(this.taskOwner);
    if (tame && tame.isTamed()) {
      const other = asTameable(target);
      if (other && other.isTamed()) return false;
      if (target === tame.getOwner()) return false;
    } else if (target.isPlayerEntity && !allowInvulnerable && (target as unknown as EntityPlayer).capabilities.disableDamage) {
      return false;
    }
    if (!this.taskOwner.isWithinHomeDistance(MathHelper.floor_double(target.posX), MathHelper.floor_double(target.posY), MathHelper.floor_double(target.posZ))) return false;
    if (this.shouldCheckSight && !this.taskOwner.getEntitySenses().canSee(target)) return false;
    if (this.nearbyOnly) {
      if (--this.reachDelay <= 0) this.reachCache = 0;
      if (this.reachCache === 0) this.reachCache = this.canReach(target) ? 1 : 2;
      if (this.reachCache === 2) return false;
    }
    return true;
  }

  /** func_75295_a: a path to the target whose end lies within 1.5 blocks of it (horizontally). */
  private canReach(target: EntityLiving): boolean {
    this.reachDelay = 10 + this.taskOwner.getRNG().nextInt(5);
    const path = this.taskOwner.getNavigator().getPathToEntityLiving(target);
    const end = path?.getFinalPathPoint();
    if (!end) return false;
    const dx = end.xCoord - MathHelper.floor_double(target.posX);
    const dz = end.zCoord - MathHelper.floor_double(target.posZ);
    return dx * dx + dz * dz <= 2.25;
  }
}
