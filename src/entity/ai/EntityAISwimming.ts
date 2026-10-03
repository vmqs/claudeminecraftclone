import type { EntityLiving } from '../EntityLiving';
import { EntityAIBase } from './EntityAIBase';

/** Keeps the mob afloat: jumps 80% of ticks in water or lava. */
export class EntityAISwimming extends EntityAIBase {
  constructor(private readonly theEntity: EntityLiving) {
    super();
    this.setMutexBits(4);
    theEntity.getNavigator().setCanSwim(true);
  }

  shouldExecute(): boolean {
    return this.theEntity.isInWater() || this.theEntity.handleLavaMovement();
  }

  override updateTask(): void {
    if (this.theEntity.getRNG().nextFloat() < Math.fround(0.8)) this.theEntity.getJumpHelper().setJumping();
  }
}
