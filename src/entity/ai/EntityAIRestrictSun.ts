import type { EntityCreature } from '../EntityCreature';
import { EntityAIBase } from './EntityAIBase';

/** During the day, paths avoid sunlit blocks (EntityAIRestrictSun). */
export class EntityAIRestrictSun extends EntityAIBase {
  constructor(private readonly theEntity: EntityCreature) {
    super();
  }

  shouldExecute(): boolean {
    return this.theEntity.worldObj.isDaytime();
  }

  override startExecuting(): void {
    this.theEntity.getNavigator().setAvoidSun(true);
  }

  override resetTask(): void {
    this.theEntity.getNavigator().setAvoidSun(false);
  }
}
