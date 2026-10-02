import type { EntityLiving } from '../EntityLiving';
import { EntityAIDoorInteract } from './EntityAIDoorInteract';

/** Villagers open the wooden door in their way and (with `closeDoor`) shut it 20 ticks later. */
export class EntityAIOpenDoor extends EntityAIDoorInteract {
  private closeDoorTemporisation = 0;

  constructor(
    entity: EntityLiving,
    private readonly closeDoor: boolean,
  ) {
    super(entity);
  }

  override continueExecuting(): boolean {
    return this.closeDoor && this.closeDoorTemporisation > 0 && super.continueExecuting();
  }

  override startExecuting(): void {
    this.closeDoorTemporisation = 20;
    this.targetDoor!.onPoweredBlockChange(this.theEntity.worldObj, this.entityPosX, this.entityPosY, this.entityPosZ, true);
  }

  override resetTask(): void {
    if (this.closeDoor) this.targetDoor!.onPoweredBlockChange(this.theEntity.worldObj, this.entityPosX, this.entityPosY, this.entityPosZ, false);
  }

  override updateTask(): void {
    this.closeDoorTemporisation--;
    super.updateTask();
  }
}
