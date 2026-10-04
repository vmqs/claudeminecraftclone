import { MathHelper } from '../../core/MathHelper';
import type { EntityLiving } from '../EntityLiving';
import { EntityList } from '../EntityList';
import { EntityTameable } from '../EntityTameable';
import { EntityAIBase } from './EntityAIBase';

/** The name EntityLiving.canAttackClass is asked about: players are 'Player', mobs their EntityList name. */
export function targetClassName(e: EntityLiving): string | null {
  return e.isPlayerEntity ? 'Player' : EntityList.getEntityString(e);
}

/**
 * Base of the target-selection tasks (EntityAITarget): keeps the attack target while it is alive,
 * in range and (optionally) seen within the last 60 ticks, and decides whether an entity is a
 * suitable target. No mob ever picks a player whose capabilities disable damage (Creative);
 * `ignoreCreative` (revenge in 1.5.2, which did go after a Creative attacker) no longer matters.
 */
export abstract class EntityAITarget extends EntityAIBase {
  /** Whether the target must be reachable by a path ending within 1.5 blocks (checked every 10-14 ticks). */
  private readonly nearbyOnly: boolean;
  /** 0 = not checked, 1 = reachable, 2 = unreachable. */
  private targetSearchStatus = 0;
  private targetSearchDelay = 0;
  private targetUnseenTicks = 0;

  constructor(
    protected readonly taskOwner: EntityLiving,
    protected targetDistance: number,
    protected readonly shouldCheckSight: boolean,
    nearbyOnly = false,
  ) {
    super();
    this.nearbyOnly = nearbyOnly;
  }

  override continueExecuting(): boolean {
    const t = this.taskOwner.getAttackTarget();
    if (!t || !t.isEntityAlive()) return false;
    if (this.taskOwner.getDistanceSqToEntity(t) > this.targetDistance * this.targetDistance) return false;
    if (this.shouldCheckSight) {
      if (this.taskOwner.getEntitySenses().canSee(t)) this.targetUnseenTicks = 0;
      else if (++this.targetUnseenTicks > 60) return false;
    }
    return true;
  }

  override startExecuting(): void {
    this.targetSearchStatus = 0;
    this.targetSearchDelay = 0;
    this.targetUnseenTicks = 0;
  }

  override resetTask(): void {
    this.taskOwner.setAttackTarget(null);
  }

  protected isSuitableTarget(t: EntityLiving | null, _ignoreCreative: boolean): boolean {
    const owner = this.taskOwner;
    if (!t || t === owner || !t.isEntityAlive()) return false;
    if (!owner.canAttackClass(targetClassName(t))) return false;
    // Creative players are never targets, not even for revenge or by a tamed wolf (1.5.2 let a
    // mob hit by a Creative player go after them).
    if (t.isPlayerEntity && t.isCreativeInvulnerable()) return false;
    if (owner instanceof EntityTameable && owner.isTamed()) {
      if (t instanceof EntityTameable && t.isTamed()) return false;
      if (t === owner.getOwner()) return false;
    }
    if (!owner.isWithinHomeDistance(MathHelper.floor_double(t.posX), MathHelper.floor_double(t.posY), MathHelper.floor_double(t.posZ))) return false;
    if (this.shouldCheckSight && !owner.getEntitySenses().canSee(t)) return false;
    if (this.nearbyOnly) {
      if (--this.targetSearchDelay <= 0) this.targetSearchStatus = 0;
      if (this.targetSearchStatus === 0) this.targetSearchStatus = this.canEasilyReach(t) ? 1 : 2;
      if (this.targetSearchStatus === 2) return false;
    }
    return true;
  }

  /** func_75295_a: a path to the target ends within 1.5 blocks of it. */
  private canEasilyReach(t: EntityLiving): boolean {
    this.targetSearchDelay = 10 + this.taskOwner.getRNG().nextInt(5);
    const path = this.taskOwner.getNavigator().getPathToEntityLiving(t);
    if (!path) return false;
    const end = path.getFinalPathPoint();
    if (!end) return false;
    const dx = end.xCoord - MathHelper.floor_double(t.posX);
    const dz = end.zCoord - MathHelper.floor_double(t.posZ);
    return dx * dx + dz * dz <= 2.25;
  }
}
