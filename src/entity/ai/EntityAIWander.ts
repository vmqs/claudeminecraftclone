import type { EntityCreature } from '../EntityCreature';
import { EntityAIBase } from './EntityAIBase';
import { RandomPositionGenerator } from './RandomPositionGenerator';

/** Walks to a random spot within 10 blocks about every 6 seconds while not idle-aged. */
export class EntityAIWander extends EntityAIBase {
  private xPosition = 0;
  private yPosition = 0;
  private zPosition = 0;

  constructor(
    private readonly entity: EntityCreature,
    private readonly speed: number,
  ) {
    super();
    this.setMutexBits(1);
  }

  shouldExecute(): boolean {
    if (this.entity.getAge() >= 100 || this.entity.getRNG().nextInt(120) !== 0) return false;
    const v = RandomPositionGenerator.findRandomTarget(this.entity, 10, 7);
    if (!v) return false;
    this.xPosition = v.xCoord;
    this.yPosition = v.yCoord;
    this.zPosition = v.zCoord;
    return true;
  }

  override continueExecuting(): boolean {
    return !this.entity.getNavigator().noPath();
  }

  override startExecuting(): void {
    this.entity.getNavigator().tryMoveToXYZ(this.xPosition, this.yPosition, this.zPosition, this.speed);
  }
}
