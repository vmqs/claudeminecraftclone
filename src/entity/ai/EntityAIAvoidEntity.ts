import { Vec3 } from '../../core/Vec3';
import type { Entity } from '../Entity';
import type { EntityCreature } from '../EntityCreature';
import { EntityAIBase } from './EntityAIBase';
import type { TargetClass } from './EntityAINearestAttackableTarget';
import type { PathEntity } from './PathEntity';
import type { PathNavigate } from './PathNavigate';
import { RandomPositionGenerator } from './RandomPositionGenerator';

/** What avoidance needs of a tameable mob (EntityTameable). */
interface TameableLike {
  isTamed(): boolean;
}

/**
 * Runs from the nearest visible entity of a class within `distance` (EntityAIAvoidEntity):
 * picks a spot up to 16 blocks away that is further from it, walking at `farSpeed` and at
 * `nearSpeed` while it is within 7 blocks. Tamed mobs do not flee from players.
 */
export class EntityAIAvoidEntity extends EntityAIBase {
  private closestLivingEntity: Entity | null = null;
  private entityPathEntity: PathEntity | null = null;
  private readonly entityPathNavigate: PathNavigate;

  constructor(
    private readonly theEntity: EntityCreature,
    private readonly targetEntityClass: TargetClass,
    private readonly distanceFromEntity: number,
    private readonly farSpeed: number,
    private readonly nearSpeed: number,
  ) {
    super();
    this.entityPathNavigate = theEntity.getNavigator();
    this.setMutexBits(1);
  }

  shouldExecute(): boolean {
    const me = this.theEntity;
    if (this.targetEntityClass === 'player') {
      const t = me as EntityCreature & Partial<TameableLike>;
      if (typeof t.isTamed === 'function' && t.isTamed()) return false;
      this.closestLivingEntity = me.worldObj.getClosestPlayerToEntity(me, this.distanceFromEntity);
      if (!this.closestLivingEntity) return false;
    } else {
      const cls = this.targetEntityClass;
      const box = me.boundingBox.expand(this.distanceFromEntity, 3, this.distanceFromEntity);
      const list = me.worldObj.getEntitiesWithinAABBExcludingEntity(null, box, (e) => cls(e) && e.isEntityAlive() && me.getEntitySenses().canSee(e));
      if (list.length === 0) return false;
      this.closestLivingEntity = list[0];
    }
    const from = this.closestLivingEntity;
    const v = RandomPositionGenerator.findRandomTargetBlockAwayFrom(me, 16, 7, new Vec3(from.posX, from.posY, from.posZ));
    if (!v) return false;
    if (from.getDistanceSq(v.xCoord, v.yCoord, v.zCoord) < from.getDistanceSqToEntity(me)) return false;
    this.entityPathEntity = this.entityPathNavigate.getPathToXYZ(v.xCoord, v.yCoord, v.zCoord);
    return this.entityPathEntity !== null && this.entityPathEntity.isDestinationSame(v);
  }

  override continueExecuting(): boolean {
    return !this.entityPathNavigate.noPath();
  }

  override startExecuting(): void {
    this.entityPathNavigate.setPath(this.entityPathEntity, this.farSpeed);
  }

  override resetTask(): void {
    this.closestLivingEntity = null;
  }

  override updateTask(): void {
    const near = this.theEntity.getDistanceSqToEntity(this.closestLivingEntity!) < 49;
    this.theEntity.getNavigator().setSpeed(near ? this.nearSpeed : this.farSpeed);
  }
}
