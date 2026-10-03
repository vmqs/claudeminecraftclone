import type { EntityLiving } from '../EntityLiving';
import { type EntityFilter, EntityAIWatchClosest } from './EntityAIWatchClosest';

/** EntityAIWatchClosest that also blocks movement while watching (mutex 3), used by villagers. */
export class EntityAIWatchClosest2 extends EntityAIWatchClosest {
  constructor(watcher: EntityLiving, watched: EntityFilter, maxDistance: number, chance: number) {
    super(watcher, watched, maxDistance, chance);
    this.setMutexBits(3);
  }
}
