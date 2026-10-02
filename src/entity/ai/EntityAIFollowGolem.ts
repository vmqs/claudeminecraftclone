import type { Entity } from '../Entity';
import { EntityList } from '../EntityList';
import type { EntityIronGolem } from '../EntityIronGolem';
import type { EntityVillager } from '../EntityVillager';
import { EntityAIBase } from './EntityAIBase';

const isGolem = (e: Entity): e is EntityIronGolem => EntityList.getEntityString(e) === 'VillagerGolem';

/** A child villager walks up to an iron golem offering a poppy and takes it. */
export class EntityAIFollowGolem extends EntityAIBase {
  private theGolem: EntityIronGolem | null = null;
  private takeGolemRoseTick = 0;
  private tookGolemRose = false;

  constructor(private readonly theVillager: EntityVillager) {
    super();
    this.setMutexBits(3);
  }

  shouldExecute(): boolean {
    const v = this.theVillager;
    if (v.getGrowingAge() >= 0 || !v.worldObj.isDaytime()) return false;
    const golems = v.worldObj.getEntitiesWithinAABB(isGolem, v.boundingBox.expand(6, 2, 6));
    if (golems.length === 0) return false;
    for (const g of golems) {
      if (g.getHoldRoseTick() > 0) {
        this.theGolem = g;
        break;
      }
    }
    return this.theGolem !== null;
  }

  override continueExecuting(): boolean {
    return this.theGolem!.getHoldRoseTick() > 0;
  }

  override startExecuting(): void {
    this.takeGolemRoseTick = this.theVillager.getRNG().nextInt(320);
    this.tookGolemRose = false;
    this.theGolem!.getNavigator().clearPathEntity();
  }

  override resetTask(): void {
    this.theGolem = null;
    this.theVillager.getNavigator().clearPathEntity();
  }

  override updateTask(): void {
    const v = this.theVillager;
    const g = this.theGolem!;
    v.getLookHelper().setLookPositionWithEntity(g, 30, 30);
    if (g.getHoldRoseTick() === this.takeGolemRoseTick) {
      v.getNavigator().tryMoveToEntityLiving(g, Math.fround(0.15));
      this.tookGolemRose = true;
    }
    if (this.tookGolemRose && v.getDistanceSqToEntity(g) < 4) {
      g.setHoldingRose(false);
      v.getNavigator().clearPathEntity();
    }
  }
}
