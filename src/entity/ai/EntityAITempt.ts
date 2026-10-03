import type { EntityCreature } from '../EntityCreature';
import type { EntityPlayer } from '../EntityPlayer';
import { EntityAIBase } from './EntityAIBase';

/**
 * Follows the closest player within 10 blocks holding `breedingFood`, stopping 2.5 blocks away.
 * With `scaredByPlayerMovement` (ocelots) the creature gives up when the player moves or turns
 * more than 5 degrees while within 6 blocks. After giving up it waits 100 ticks.
 */
export class EntityAITempt extends EntityAIBase {
  private targetX = 0;
  private targetY = 0;
  private targetZ = 0;
  private pitch = 0;
  private yaw = 0;
  private temptingPlayer: EntityPlayer | null = null;
  private delayTemptCounter = 0;
  private isRunning = false;
  private avoidWater = false;

  constructor(
    private readonly temptedEntity: EntityCreature,
    private readonly speed: number,
    private readonly breedingFood: number,
    private readonly scaredByPlayerMovement: boolean,
  ) {
    super();
    this.setMutexBits(3);
  }

  shouldExecute(): boolean {
    if (this.delayTemptCounter > 0) {
      this.delayTemptCounter--;
      return false;
    }
    this.temptingPlayer = this.temptedEntity.worldObj.getClosestPlayerToEntity(this.temptedEntity, 10);
    if (!this.temptingPlayer) return false;
    const held = this.temptingPlayer.getCurrentEquippedItem();
    return held !== null && held.itemID === this.breedingFood;
  }

  override continueExecuting(): boolean {
    if (this.scaredByPlayerMovement) {
      const p = this.temptingPlayer!;
      if (this.temptedEntity.getDistanceSqToEntity(p) < 36) {
        if (p.getDistanceSq(this.targetX, this.targetY, this.targetZ) > 0.010000000000000002) return false;
        if (Math.abs(p.rotationPitch - this.pitch) > 5 || Math.abs(p.rotationYaw - this.yaw) > 5) return false;
      } else {
        this.targetX = p.posX;
        this.targetY = p.posY;
        this.targetZ = p.posZ;
      }
      this.pitch = p.rotationPitch;
      this.yaw = p.rotationYaw;
    }
    return this.shouldExecute();
  }

  override startExecuting(): void {
    const p = this.temptingPlayer!;
    this.targetX = p.posX;
    this.targetY = p.posY;
    this.targetZ = p.posZ;
    this.isRunning = true;
    this.avoidWater = this.temptedEntity.getNavigator().getAvoidsWater();
    this.temptedEntity.getNavigator().setAvoidsWater(false);
  }

  override resetTask(): void {
    this.temptingPlayer = null;
    this.temptedEntity.getNavigator().clearPathEntity();
    this.delayTemptCounter = 100;
    this.isRunning = false;
    this.temptedEntity.getNavigator().setAvoidsWater(this.avoidWater);
  }

  override updateTask(): void {
    const e = this.temptedEntity;
    const p = this.temptingPlayer!;
    e.getLookHelper().setLookPositionWithEntity(p, 30, e.getVerticalFaceSpeed());
    if (e.getDistanceSqToEntity(p) < 6.25) e.getNavigator().clearPathEntity();
    else e.getNavigator().tryMoveToEntityLiving(p, this.speed);
  }

  /** func_75277_f: whether the creature is currently following a tempting player. */
  isRunningTask(): boolean {
    return this.isRunning;
  }
}
