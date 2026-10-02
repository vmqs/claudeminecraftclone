import { MathHelper } from '../../core/MathHelper';
import { Vec3 } from '../../core/Vec3';
import type { EntityCreature } from '../EntityCreature';
import { EntityAIBase } from './EntityAIBase';
import type { PathEntity } from './PathEntity';
import { RandomPositionGenerator } from './RandomPositionGenerator';

/** A door of a village (VillageDoorInfo), as far as this task needs it. */
export interface VillageDoorLike {
  readonly posX: number;
  readonly posY: number;
  readonly posZ: number;
  getDistanceSquared(x: number, y: number, z: number): number;
}

/** A village (Village) and the world's village collection (VillageCollection). */
export interface VillageLike {
  getVillageDoorInfoList(): readonly VillageDoorLike[];
}
export interface VillageCollectionLike {
  findNearestVillage(x: number, y: number, z: number, radius: number): VillageLike | null;
}

/**
 * Walks from door to door through the nearest village (EntityAIMoveThroughVillage): the
 * closest door not visited recently (the last 15 are remembered), pathing without breaking
 * doors; nocturnal walkers only go at night. Villages come from `World.villageCollectionObj`
 * when the village code provides one; without it there is never a village to walk through.
 */
export class EntityAIMoveThroughVillage extends EntityAIBase {
  private entityPathNavigate: PathEntity | null = null;
  private doorInfo: VillageDoorLike | null = null;
  private readonly doorList: VillageDoorLike[] = [];

  constructor(
    private readonly theEntity: EntityCreature,
    private readonly movementSpeed: number,
    private readonly isNocturnal: boolean,
  ) {
    super();
    this.setMutexBits(1);
  }

  shouldExecute(): boolean {
    if (this.doorList.length > 15) this.doorList.shift();
    const e = this.theEntity;
    if (this.isNocturnal && e.worldObj.isDaytime()) return false;
    const villages = (e.worldObj as { villageCollectionObj?: VillageCollectionLike | null }).villageCollectionObj;
    const village = villages?.findNearestVillage(MathHelper.floor_double(e.posX), MathHelper.floor_double(e.posY), MathHelper.floor_double(e.posZ), 0) ?? null;
    if (!village) return false;
    this.doorInfo = this.findNearestDoor(village);
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
    if (this.theEntity.getNavigator().noPath()) return false;
    const r = Math.fround(this.theEntity.width + 4);
    const d = this.doorInfo!;
    return this.theEntity.getDistanceSq(d.posX, d.posY, d.posZ) > r * r;
  }

  override startExecuting(): void {
    this.theEntity.getNavigator().setPath(this.entityPathNavigate, this.movementSpeed);
  }

  override resetTask(): void {
    const d = this.doorInfo!;
    if (this.theEntity.getNavigator().noPath() || this.theEntity.getDistanceSq(d.posX, d.posY, d.posZ) < 16) this.doorList.push(d);
  }

  private findNearestDoor(village: VillageLike): VillageDoorLike | null {
    const e = this.theEntity;
    let best: VillageDoorLike | null = null;
    let bestD = 2147483647;
    for (const door of village.getVillageDoorInfoList()) {
      const d = door.getDistanceSquared(MathHelper.floor_double(e.posX), MathHelper.floor_double(e.posY), MathHelper.floor_double(e.posZ));
      if (d < bestD && !this.doorList.some((o) => o.posX === door.posX && o.posY === door.posY && o.posZ === door.posZ)) {
        best = door;
        bestD = d;
      }
    }
    return best;
  }
}
