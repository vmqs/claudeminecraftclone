import { Vec3 } from '../../core/Vec3';
import type { EntityCreature } from '../EntityCreature';
import type { EntityLiving } from '../EntityLiving';
import { EntityAIBase } from './EntityAIBase';
import { RandomPositionGenerator } from './RandomPositionGenerator';

/** Heads for a random spot towards the attack target while it is within `maxTargetDistance`. */
export class EntityAIMoveTowardsTarget extends EntityAIBase {
  private targetEntity: EntityLiving | null = null;
  private movePosX = 0;
  private movePosY = 0;
  private movePosZ = 0;

  constructor(
    private readonly theEntity: EntityCreature,
    private readonly speed: number,
    private readonly maxTargetDistance: number,
  ) {
    super();
    this.setMutexBits(1);
  }

  shouldExecute(): boolean {
    const e = this.theEntity;
    this.targetEntity = e.getAttackTarget();
    const t = this.targetEntity;
    if (!t || t.getDistanceSqToEntity(e) > this.maxTargetDistance * this.maxTargetDistance) return false;
    const v = RandomPositionGenerator.findRandomTargetBlockTowards(e, 16, 7, new Vec3(t.posX, t.posY, t.posZ));
    if (!v) return false;
    this.movePosX = v.xCoord;
    this.movePosY = v.yCoord;
    this.movePosZ = v.zCoord;
    return true;
  }

  override continueExecuting(): boolean {
    const t = this.targetEntity!;
    return !this.theEntity.getNavigator().noPath() && t.isEntityAlive() && t.getDistanceSqToEntity(this.theEntity) < this.maxTargetDistance * this.maxTargetDistance;
  }

  override resetTask(): void {
    this.targetEntity = null;
  }

  override startExecuting(): void {
    this.theEntity.getNavigator().tryMoveToXYZ(this.movePosX, this.movePosY, this.movePosZ, this.speed);
  }
}
