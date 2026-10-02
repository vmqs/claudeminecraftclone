import { EntityList } from '../EntityList';
import type { EntityIronGolem } from '../EntityIronGolem';
import type { Entity } from '../Entity';
import { EntityAIBase } from './EntityAIBase';

/** By day an iron golem now and then (1 in 8000) holds out a poppy to a villager for 400 ticks. */
export class EntityAILookAtVillager extends EntityAIBase {
  private theVillager: Entity | null = null;
  private lookTime = 0;

  constructor(private readonly theGolem: EntityIronGolem) {
    super();
    this.setMutexBits(3);
  }

  shouldExecute(): boolean {
    const g = this.theGolem;
    if (!g.worldObj.isDaytime() || g.getRNG().nextInt(8000) !== 0) return false;
    this.theVillager = g.worldObj.findNearestEntityWithinAABB((e) => EntityList.getEntityString(e) === 'Villager', g.boundingBox.expand(6, 2, 6), g);
    return this.theVillager !== null;
  }

  override continueExecuting(): boolean {
    return this.lookTime > 0;
  }

  override startExecuting(): void {
    this.lookTime = 400;
    this.theGolem.setHoldingRose(true);
  }

  override resetTask(): void {
    this.theGolem.setHoldingRose(false);
    this.theVillager = null;
  }

  override updateTask(): void {
    this.theGolem.getLookHelper().setLookPositionWithEntity(this.theVillager!, 30, 30);
    this.lookTime--;
  }
}
