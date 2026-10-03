import type { Entity } from '../Entity';
import type { EntityLiving } from '../EntityLiving';
import { EntityList } from '../EntityList';
import type { EntityVillager } from '../EntityVillager';
import { EntityAIBase } from './EntityAIBase';
import { RandomPositionGenerator } from './RandomPositionGenerator';

const isVillager = (e: Entity): e is EntityVillager => EntityList.getEntityString(e) === 'Villager';

/** Child villagers chase another child (or run around) for up to 1000 ticks. */
export class EntityAIPlay extends EntityAIBase {
  private targetVillager: EntityLiving | null = null;
  private playTime = 0;

  constructor(
    private readonly villagerObj: EntityVillager,
    private readonly speed: number,
  ) {
    super();
    this.setMutexBits(1);
  }

  shouldExecute(): boolean {
    const v = this.villagerObj;
    if (v.getGrowingAge() >= 0 || v.getRNG().nextInt(400) !== 0) return false;
    let best = Number.MAX_VALUE;
    for (const o of v.worldObj.getEntitiesWithinAABB(isVillager, v.boundingBox.expand(6, 3, 6))) {
      if (o === v || o.isPlaying() || o.getGrowingAge() >= 0) continue;
      const d = o.getDistanceSqToEntity(v);
      if (!(d > best)) {
        best = d;
        this.targetVillager = o;
      }
    }
    if (!this.targetVillager && !RandomPositionGenerator.findRandomTarget(v, 16, 3)) return false;
    return true;
  }

  override continueExecuting(): boolean {
    return this.playTime > 0;
  }

  override startExecuting(): void {
    if (this.targetVillager) this.villagerObj.setPlaying(true);
    this.playTime = 1000;
  }

  override resetTask(): void {
    this.villagerObj.setPlaying(false);
    this.targetVillager = null;
  }

  override updateTask(): void {
    const v = this.villagerObj;
    this.playTime--;
    if (this.targetVillager) {
      if (v.getDistanceSqToEntity(this.targetVillager) > 4) v.getNavigator().tryMoveToEntityLiving(this.targetVillager, this.speed);
    } else if (v.getNavigator().noPath()) {
      const p = RandomPositionGenerator.findRandomTarget(v, 16, 3);
      if (p) v.getNavigator().tryMoveToXYZ(p.xCoord, p.yCoord, p.zCoord, this.speed);
    }
  }
}
