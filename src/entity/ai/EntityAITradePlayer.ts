import type { EntityVillager } from '../EntityVillager';
import { EntityAIBase } from './EntityAIBase';

/** A villager stands still while its customer (within 4 blocks) has the trading window open. */
export class EntityAITradePlayer extends EntityAIBase {
  constructor(private readonly villager: EntityVillager) {
    super();
    this.setMutexBits(5);
  }

  shouldExecute(): boolean {
    const v = this.villager;
    if (!v.isEntityAlive() || v.isInWater() || !v.onGround || v.velocityChanged) return false;
    const p = v.getCustomer();
    if (!p) return false;
    return v.getDistanceSqToEntity(p) > 16 ? false : p.openContainer != null;
  }

  override startExecuting(): void {
    this.villager.getNavigator().clearPathEntity();
  }

  override resetTask(): void {
    this.villager.setCustomer(null);
  }
}
