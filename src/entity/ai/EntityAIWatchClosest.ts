import type { Entity } from '../Entity';
import type { EntityLiving } from '../EntityLiving';
import { EntityAIBase } from './EntityAIBase';

/** Entity filter standing in for the watched class (players use the closest-player lookup). */
export type EntityFilter = 'player' | ((e: Entity) => boolean);

/** Looks at the nearest matching entity within `maxDistance` for 2-4 seconds. */
export class EntityAIWatchClosest extends EntityAIBase {
  protected closestEntity: Entity | null = null;
  private lookTime = 0;

  constructor(
    private readonly theWatcher: EntityLiving,
    private readonly watched: EntityFilter,
    private readonly maxDistance: number,
    private readonly chance = Math.fround(0.02),
  ) {
    super();
    this.setMutexBits(2);
  }

  shouldExecute(): boolean {
    const w = this.theWatcher;
    if (w.getRNG().nextFloat() >= this.chance) return false;
    if (this.watched === 'player') this.closestEntity = w.worldObj.getClosestPlayerToEntity(w, this.maxDistance);
    else this.closestEntity = w.worldObj.findNearestEntityWithinAABB(this.watched, w.boundingBox.expand(this.maxDistance, 3, this.maxDistance), w);
    return this.closestEntity !== null;
  }

  override continueExecuting(): boolean {
    const e = this.closestEntity!;
    if (!e.isEntityAlive()) return false;
    return this.theWatcher.getDistanceSqToEntity(e) > this.maxDistance * this.maxDistance ? false : this.lookTime > 0;
  }

  override startExecuting(): void {
    this.lookTime = 40 + this.theWatcher.getRNG().nextInt(40);
  }

  override resetTask(): void {
    this.closestEntity = null;
  }

  override updateTask(): void {
    const e = this.closestEntity!;
    this.theWatcher.getLookHelper().setLookPosition(e.posX, e.posY + e.getEyeHeight(), e.posZ, 10, this.theWatcher.getVerticalFaceSpeed());
    this.lookTime--;
  }
}
