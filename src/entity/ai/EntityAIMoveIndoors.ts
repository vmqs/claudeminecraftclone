import { MathHelper } from '../../core/MathHelper';
import { Vec3 } from '../../core/Vec3';
import type { VillageDoorInfo } from '../../world/village/VillageDoorInfo';
import type { EntityCreature } from '../EntityCreature';
import { EntityAIBase } from './EntityAIBase';
import { RandomPositionGenerator } from './RandomPositionGenerator';

const f = Math.fround;

/** At night or in rain villagers head for the inside of the least crowded village door nearby. */
export class EntityAIMoveIndoors extends EntityAIBase {
  private doorInfo: VillageDoorInfo | null = null;
  private insidePosX = -1;
  private insidePosZ = -1;

  constructor(private readonly entityObj: EntityCreature) {
    super();
    this.setMutexBits(1);
  }

  shouldExecute(): boolean {
    const e = this.entityObj;
    const w = e.worldObj;
    if ((w.isDaytime() && !w.isRaining()) || w.provider.hasNoSky) return false;
    if (e.getRNG().nextInt(50) !== 0) return false;
    if (this.insidePosX !== -1 && e.getDistanceSq(this.insidePosX, e.posY, this.insidePosZ) < 4) return false;
    const x = MathHelper.floor_double(e.posX);
    const y = MathHelper.floor_double(e.posY);
    const z = MathHelper.floor_double(e.posZ);
    const village = w.villageCollectionObj.findNearestVillage(x, y, z, 14);
    if (!village) return false;
    this.doorInfo = village.findNearestDoorUnrestricted(x, y, z);
    return this.doorInfo !== null;
  }

  override continueExecuting(): boolean {
    return !this.entityObj.getNavigator().noPath();
  }

  override startExecuting(): void {
    const e = this.entityObj;
    const d = this.doorInfo!;
    this.insidePosX = -1;
    if (e.getDistanceSq(d.getInsidePosX(), d.posY, d.getInsidePosZ()) > 256) {
      const v = RandomPositionGenerator.findRandomTargetBlockTowards(e, 14, 3, new Vec3(d.getInsidePosX() + 0.5, d.getInsidePosY(), d.getInsidePosZ() + 0.5));
      if (v) e.getNavigator().tryMoveToXYZ(v.xCoord, v.yCoord, v.zCoord, f(0.3));
    } else {
      e.getNavigator().tryMoveToXYZ(d.getInsidePosX() + 0.5, d.getInsidePosY(), d.getInsidePosZ() + 0.5, f(0.3));
    }
  }

  override resetTask(): void {
    const d = this.doorInfo!;
    this.insidePosX = d.getInsidePosX();
    this.insidePosZ = d.getInsidePosZ();
    this.doorInfo = null;
  }
}
