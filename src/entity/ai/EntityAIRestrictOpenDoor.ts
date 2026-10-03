import { MathHelper } from '../../core/MathHelper';
import type { VillageDoorInfo } from '../../world/village/VillageDoorInfo';
import type { EntityCreature } from '../EntityCreature';
import { EntityAIBase } from './EntityAIBase';

/** At night a villager standing just inside a village door does not path through doors. */
export class EntityAIRestrictOpenDoor extends EntityAIBase {
  private frontDoor: VillageDoorInfo | null = null;

  constructor(private readonly entityObj: EntityCreature) {
    super();
  }

  shouldExecute(): boolean {
    const e = this.entityObj;
    if (e.worldObj.isDaytime()) return false;
    const x = MathHelper.floor_double(e.posX);
    const y = MathHelper.floor_double(e.posY);
    const z = MathHelper.floor_double(e.posZ);
    const village = e.worldObj.villageCollectionObj.findNearestVillage(x, y, z, 16);
    if (!village) return false;
    this.frontDoor = village.findNearestDoor(x, y, z);
    return this.frontDoor ? this.frontDoor.getInsideDistanceSquare(x, y, z) < 2.25 : false;
  }

  override continueExecuting(): boolean {
    const e = this.entityObj;
    if (e.worldObj.isDaytime()) return false;
    const d = this.frontDoor!;
    return !d.isDetachedFromVillageFlag && d.isInside(MathHelper.floor_double(e.posX), MathHelper.floor_double(e.posZ));
  }

  override startExecuting(): void {
    this.entityObj.getNavigator().setBreakDoors(false);
    this.entityObj.getNavigator().setEnterDoors(false);
  }

  override resetTask(): void {
    this.entityObj.getNavigator().setBreakDoors(true);
    this.entityObj.getNavigator().setEnterDoors(true);
    this.frontDoor = null;
  }

  override updateTask(): void {
    this.frontDoor!.incrementDoorOpeningRestrictionCounter();
  }
}
