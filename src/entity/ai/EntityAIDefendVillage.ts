import type { EntityIronGolem } from '../EntityIronGolem';
import type { EntityLiving } from '../EntityLiving';
import { EntityAITarget } from './EntityAITarget';

/**
 * Iron golems target whoever recently hurt a villager of their village, or (1 in 20 checks) the
 * nearest player whose reputation there is -15 or lower.
 */
export class EntityAIDefendVillage extends EntityAITarget {
  private villageAgressorTarget: EntityLiving | null = null;

  constructor(private readonly irongolem: EntityIronGolem) {
    super(irongolem, 16, false, true);
    this.setMutexBits(1);
  }

  shouldExecute(): boolean {
    const village = this.irongolem.getVillage();
    if (!village) return false;
    this.villageAgressorTarget = village.findNearestVillageAggressor(this.irongolem);
    if (this.isSuitableTarget(this.villageAgressorTarget, false)) return true;
    if (this.taskOwner.getRNG().nextInt(20) !== 0) return false;
    this.villageAgressorTarget = village.findNearestUnpopularPlayer(this.irongolem);
    return this.isSuitableTarget(this.villageAgressorTarget, false);
  }

  override startExecuting(): void {
    this.irongolem.setAttackTarget(this.villageAgressorTarget);
    super.startExecuting();
  }
}
