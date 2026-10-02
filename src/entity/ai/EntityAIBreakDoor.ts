import type { EntityLiving } from '../EntityLiving';
import { EntityAIDoorInteract } from './EntityAIDoorInteract';

/**
 * Zombies hammering on closed wooden doors (EntityAIBreakDoor, mobGriefing only): knocking
 * sounds, the crack overlay over 240 ticks, and on Hard the door breaks.
 */
export class EntityAIBreakDoor extends EntityAIDoorInteract {
  private breakingTime = 0;
  private lastProgress = -1;

  constructor(entity: EntityLiving) {
    super(entity);
  }

  override shouldExecute(): boolean {
    if (!super.shouldExecute()) return false;
    const w = this.theEntity.worldObj;
    if (!w.worldInfo.gameRules.mobGriefing) return false;
    return !this.targetDoor!.isDoorOpen(w, this.entityPosX, this.entityPosY, this.entityPosZ);
  }

  override startExecuting(): void {
    super.startExecuting();
    this.breakingTime = 0;
  }

  override continueExecuting(): boolean {
    const d = this.theEntity.getDistanceSq(this.entityPosX, this.entityPosY, this.entityPosZ);
    return this.breakingTime <= 240 && !this.targetDoor!.isDoorOpen(this.theEntity.worldObj, this.entityPosX, this.entityPosY, this.entityPosZ) && d < 4;
  }

  override resetTask(): void {
    super.resetTask();
    this.theEntity.worldObj.destroyBlockInWorldPartially(this.theEntity.entityId, this.entityPosX, this.entityPosY, this.entityPosZ, -1);
  }

  override updateTask(): void {
    super.updateTask();
    const w = this.theEntity.worldObj;
    if (this.theEntity.getRNG().nextInt(20) === 0) w.playAuxSFX(1010, this.entityPosX, this.entityPosY, this.entityPosZ, 0);
    this.breakingTime++;
    const progress = Math.trunc(Math.fround(Math.fround(this.breakingTime / Math.fround(240)) * 10));
    if (progress !== this.lastProgress) {
      w.destroyBlockInWorldPartially(this.theEntity.entityId, this.entityPosX, this.entityPosY, this.entityPosZ, progress);
      this.lastProgress = progress;
    }
    if (this.breakingTime === 240 && w.difficultySetting === 3) {
      w.setBlockToAir(this.entityPosX, this.entityPosY, this.entityPosZ);
      w.playAuxSFX(1012, this.entityPosX, this.entityPosY, this.entityPosZ, 0);
      w.playAuxSFX(2001, this.entityPosX, this.entityPosY, this.entityPosZ, this.targetDoor!.blockID);
    }
  }
}
