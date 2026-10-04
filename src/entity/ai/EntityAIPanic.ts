import type { EntityCreature } from '../EntityCreature';
import { EntityAIBase } from './EntityAIBase';
import { RandomPositionGenerator } from './RandomPositionGenerator';

/** Runs to random nearby spots while hurt recently or burning. */
export class EntityAIPanic extends EntityAIBase {
  private randPosX = 0;
  private randPosY = 0;
  private randPosZ = 0;

  constructor(
    private readonly theEntityCreature: EntityCreature,
    private readonly speed: number,
  ) {
    super();
    this.setMutexBits(1);
  }

  shouldExecute(): boolean {
    const e = this.theEntityCreature;
    if (e.getAITarget() === null && !e.isBurning()) return false;
    const v = RandomPositionGenerator.findRandomTarget(e, 5, 4);
    if (!v) return false;
    this.randPosX = v.xCoord;
    this.randPosY = v.yCoord;
    this.randPosZ = v.zCoord;
    return true;
  }

  override startExecuting(): void {
    this.theEntityCreature.getNavigator().tryMoveToXYZ(this.randPosX, this.randPosY, this.randPosZ, this.speed);
  }

  override continueExecuting(): boolean {
    return !this.theEntityCreature.getNavigator().noPath();
  }
}
