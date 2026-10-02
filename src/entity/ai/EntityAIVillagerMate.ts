import { MathHelper } from '../../core/MathHelper';
import type { Village } from '../../world/village/Village';
import { EntityList } from '../EntityList';
import type { EntityVillager } from '../EntityVillager';
import { EntityAIBase } from './EntityAIBase';

/**
 * Villager breeding: in the mating season, while the village has fewer villagers than 35% of its
 * doors, two adults next to each other for 300 ticks make a baby villager of a random profession.
 */
export class EntityAIVillagerMate extends EntityAIBase {
  private mate: EntityVillager | null = null;
  private matingTimeout = 0;
  private villageObj: Village | null = null;

  constructor(private readonly villagerObj: EntityVillager) {
    super();
    this.setMutexBits(3);
  }

  shouldExecute(): boolean {
    const v = this.villagerObj;
    if (v.getGrowingAge() !== 0 || v.getRNG().nextInt(500) !== 0) return false;
    this.villageObj = v.worldObj.villageCollectionObj.findNearestVillage(MathHelper.floor_double(v.posX), MathHelper.floor_double(v.posY), MathHelper.floor_double(v.posZ), 0);
    if (!this.villageObj || !this.checkSufficientDoorsPresentForNewVillager()) return false;
    const other = v.worldObj.findNearestEntityWithinAABB((e) => EntityList.getEntityString(e) === 'Villager', v.boundingBox.expand(8, 3, 8), v);
    if (!other) return false;
    this.mate = other as EntityVillager;
    return this.mate.getGrowingAge() === 0;
  }

  override startExecuting(): void {
    this.matingTimeout = 300;
    this.villagerObj.setMating(true);
  }

  override resetTask(): void {
    this.villageObj = null;
    this.mate = null;
    this.villagerObj.setMating(false);
  }

  override continueExecuting(): boolean {
    return this.matingTimeout >= 0 && this.checkSufficientDoorsPresentForNewVillager() && this.villagerObj.getGrowingAge() === 0;
  }

  override updateTask(): void {
    const v = this.villagerObj;
    const m = this.mate!;
    this.matingTimeout--;
    v.getLookHelper().setLookPositionWithEntity(m, 10, 30);
    if (v.getDistanceSqToEntity(m) > 2.25) v.getNavigator().tryMoveToEntityLiving(m, Math.fround(0.25));
    else if (this.matingTimeout === 0 && m.isMating()) this.giveBirth();
    if (v.getRNG().nextInt(35) === 0) v.worldObj.setEntityState(v, 12);
  }

  private checkSufficientDoorsPresentForNewVillager(): boolean {
    const village = this.villageObj!;
    if (!village.isMatingSeason()) return false;
    const max = Math.trunc(Math.fround(village.getNumVillageDoors()) * 0.35);
    return village.getNumVillagers() < max;
  }

  private giveBirth(): void {
    const v = this.villagerObj;
    const m = this.mate!;
    const baby = v.createChild(m);
    m.setGrowingAge(6000);
    v.setGrowingAge(6000);
    baby.setGrowingAge(-24000);
    baby.setLocationAndAngles(v.posX, v.posY, v.posZ, 0, 0);
    v.worldObj.spawnEntityInWorld(baby);
    v.worldObj.setEntityState(baby, 12);
  }
}
