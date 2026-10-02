import { MathHelper } from '../../core/MathHelper';
import { Vec3 } from '../../core/Vec3';
import type { Village } from '../../world/village/Village';
import type { VillageDoorInfo } from '../../world/village/VillageDoorInfo';
import type { EntityCreature } from '../EntityCreature';
import { EntityAIBase } from './EntityAIBase';
import type { PathEntity } from './PathEntity';
import { RandomPositionGenerator } from './RandomPositionGenerator';

/**
 * Walks from door to door of the nearest village, only at night when `isNocturnal` (iron
 * golems; zombies walk at any time), remembering the last 15 doors it reached.
 */
export class EntityAIMoveThroughVillage extends EntityAIBase {
  private entityPathNavigate: PathEntity | null = null;
  private doorInfo: VillageDoorInfo | null = null;
  private readonly doorList: VillageDoorInfo[] = [];

  constructor(
    private readonly theEntity: EntityCreature,
    private readonly movementSpeed: number,
    private readonly isNocturnal: boolean,
  ) {
    super();
    this.setMutexBits(1);
  }

  shouldExecute(): boolean {
    const e = this.theEntity;
    if (this.doorList.length > 15) this.doorList.shift();
    if (this.isNocturnal && e.worldObj.isDaytime()) return false;
    const village = e.worldObj.villageCollectionObj.findNearestVillage(MathHelper.floor_double(e.posX), MathHelper.floor_double(e.posY), MathHelper.floor_double(e.posZ), 0);
    if (!village) return false;
    this.doorInfo = this.findNearestUnvisitedDoor(village);
    if (!this.doorInfo) return false;
    const nav = e.getNavigator();
    const breakDoors = nav.getCanBreakDoors();
    nav.setBreakDoors(false);
    this.entityPathNavigate = nav.getPathToXYZ(this.doorInfo.posX, this.doorInfo.posY, this.doorInfo.posZ);
    nav.setBreakDoors(breakDoors);
    if (this.entityPathNavigate) return true;
    const v = RandomPositionGenerator.findRandomTargetBlockTowards(e, 10, 7, new Vec3(this.doorInfo.posX, this.doorInfo.posY, this.doorInfo.posZ));
    if (!v) return false;
    nav.setBreakDoors(false);
    this.entityPathNavigate = nav.getPathToXYZ(v.xCoord, v.yCoord, v.zCoord);
    nav.setBreakDoors(breakDoors);
    return this.entityPathNavigate !== null;
  }

  override continueExecuting(): boolean {
    const e = this.theEntity;
    if (e.getNavigator().noPath()) return false;
    const r = Math.fround(e.width + 4);
    const d = this.doorInfo!;
    return e.getDistanceSq(d.posX, d.posY, d.posZ) > r * r;
  }

  override startExecuting(): void {
    this.theEntity.getNavigator().setPath(this.entityPathNavigate, this.movementSpeed);
  }

  override resetTask(): void {
    const d = this.doorInfo!;
    if (this.theEntity.getNavigator().noPath() || this.theEntity.getDistanceSq(d.posX, d.posY, d.posZ) < 16) this.doorList.push(d);
  }

  private findNearestUnvisitedDoor(village: Village): VillageDoorInfo | null {
    const e = this.theEntity;
    let best: VillageDoorInfo | null = null;
    let bestD = 2147483647;
    for (const d of village.getVillageDoorInfoList()) {
      const dist = d.getDistanceSquared(MathHelper.floor_double(e.posX), MathHelper.floor_double(e.posY), MathHelper.floor_double(e.posZ));
      if (dist < bestD && !this.doorList.some((o) => o.posX === d.posX && o.posY === d.posY && o.posZ === d.posZ)) {
        best = d;
        bestD = dist;
      }
    }
    return best;
  }
}
