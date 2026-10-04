import type { EntityTameable } from '../EntityTameable';
import { EntityAIBase } from './EntityAIBase';

/** Tamed pets stay put when told to sit, unless the owner nearby is being attacked. */
export class EntityAISit extends EntityAIBase {
  private isSitting = false;

  constructor(private readonly theEntity: EntityTameable) {
    super();
    this.setMutexBits(5);
  }

  shouldExecute(): boolean {
    const e = this.theEntity;
    if (!e.isTamed() || e.isInWater() || !e.onGround) return false;
    const owner = e.getOwner();
    if (!owner) return true;
    return e.getDistanceSqToEntity(owner) < 144 && owner.getAITarget() !== null ? false : this.isSitting;
  }

  override startExecuting(): void {
    this.theEntity.getNavigator().clearPathEntity();
    this.theEntity.setSitting(true);
  }

  override resetTask(): void {
    this.theEntity.setSitting(false);
  }

  setSitting(v: boolean): void {
    this.isSitting = v;
  }
}
