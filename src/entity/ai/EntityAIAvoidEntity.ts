import { Vec3 } from '../../core/Vec3';
import type { Entity } from '../Entity';
import type { EntityCreature } from '../EntityCreature';
import { EntityTameable } from '../EntityTameable';
import { EntityAIBase } from './EntityAIBase';
import type { PathEntity } from './PathEntity';
import { RandomPositionGenerator } from './RandomPositionGenerator';

/** The entities to run from: 'player' (closest player; tamed pets ignore players) or a filter. */
export type AvoidClass = 'player' | ((e: Entity) => boolean);

/**
 * Runs from the nearest visible entity of a class within `distance` (3 up/down) to a random
 * spot 16 blocks away from it, at `farSpeed`, or `nearSpeed` while it is within 7 blocks.
 */
export class EntityAIAvoidEntity extends EntityAIBase {
  private closestLivingEntity: Entity | null = null;
  private entityPathEntity: PathEntity | null = null;

  constructor(
    private readonly theEntity: EntityCreature,
    private readonly targetEntityClass: AvoidClass,
    private readonly distanceFromEntity: number,
    private readonly farSpeed: number,
    private readonly nearSpeed: number,
  ) {
    super();
    this.setMutexBits(1);
  }

  shouldExecute(): boolean {
    const e = this.theEntity;
    if (this.targetEntityClass === 'player') {
      if (e instanceof EntityTameable && e.isTamed()) return false;
      this.closestLivingEntity = e.worldObj.getClosestPlayerToEntity(e, this.distanceFromEntity);
      if (!this.closestLivingEntity) return false;
    } else {
      const cls = this.targetEntityClass;
      const box = e.boundingBox.expand(this.distanceFromEntity, 3, this.distanceFromEntity);
      // EntityAIAvoidEntitySelector: alive and visible.
      const list = e.worldObj.getEntitiesWithinAABBExcludingEntity(null, box, (o) => cls(o) && o.isEntityAlive() && e.getEntitySenses().canSee(o));
      if (list.length === 0) return false;
      this.closestLivingEntity = list[0];
    }
    const from = this.closestLivingEntity;
    const v = RandomPositionGenerator.findRandomTargetBlockAwayFrom(e, 16, 7, new Vec3(from.posX, from.posY, from.posZ));
    if (!v) return false;
    if (from.getDistanceSq(v.xCoord, v.yCoord, v.zCoord) < from.getDistanceSqToEntity(e)) return false;
    this.entityPathEntity = e.getNavigator().getPathToXYZ(v.xCoord, v.yCoord, v.zCoord);
    return this.entityPathEntity === null ? false : this.entityPathEntity.isDestinationSame(v);
  }

  override continueExecuting(): boolean {
    return !this.theEntity.getNavigator().noPath();
  }

  override startExecuting(): void {
    this.theEntity.getNavigator().setPath(this.entityPathEntity, this.farSpeed);
  }

  override resetTask(): void {
    this.closestLivingEntity = null;
  }

  override updateTask(): void {
    const near = this.closestLivingEntity !== null && this.theEntity.getDistanceSqToEntity(this.closestLivingEntity) < 49;
    this.theEntity.getNavigator().setSpeed(near ? this.nearSpeed : this.farSpeed);
  }
}
