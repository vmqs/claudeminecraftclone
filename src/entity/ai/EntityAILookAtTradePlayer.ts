import type { EntityVillager } from '../EntityVillager';
import { EntityAIWatchClosest } from './EntityAIWatchClosest';

/** A trading villager keeps looking at its customer. */
export class EntityAILookAtTradePlayer extends EntityAIWatchClosest {
  constructor(private readonly theMerchant: EntityVillager) {
    super(theMerchant, 'player', 8);
  }

  override shouldExecute(): boolean {
    if (!this.theMerchant.isTrading()) return false;
    this.closestEntity = this.theMerchant.getCustomer();
    return true;
  }
}
