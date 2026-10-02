import { Vec3 } from '../../core/Vec3';
import type { EntityCreature } from '../EntityCreature';
import { EntityAIBase } from './EntityAIBase';
import { RandomPositionGenerator } from './RandomPositionGenerator';

/** Walks back towards the home area when outside it (EntityAIMoveTwardsRestriction, sic). */
export class EntityAIMoveTwardsRestriction extends EntityAIBase {
  private movePosX = 0;
  private movePosY = 0;
  private movePosZ = 0;

  constructor(
    private readonly theEntity: EntityCreature,
    private readonly movementSpeed: number,
  ) {
    super();
    this.setMutexBits(1);
  }

  shouldExecute(): boolean {
    if (this.theEntity.isWithinHomeDistanceCurrentPosition()) return false;
    const home = this.theEntity.getHomePosition();
    const v = RandomPositionGenerator.findRandomTargetBlockTowards(this.theEntity, 16, 7, new Vec3(home.posX, home.posY, home.posZ));
    if (!v) return false;
    this.movePosX = v.xCoord;
    this.movePosY = v.yCoord;
    this.movePosZ = v.zCoord;
    return true;
  }

  override continueExecuting(): boolean {
    return !this.theEntity.getNavigator().noPath();
  }

  override startExecuting(): void {
    this.theEntity.getNavigator().tryMoveToXYZ(this.movePosX, this.movePosY, this.movePosZ, this.movementSpeed);
  }
}
