import { Block } from '../../block/Block';
import { BlockIds } from '../../block/BlockIds';
import type { BlockDoor } from '../../block/BlockDoor';
import { MathHelper } from '../../core/MathHelper';
import type { EntityLiving } from '../EntityLiving';
import { EntityAIBase } from './EntityAIBase';

const f = Math.fround;

/**
 * Base of door tasks (EntityAIDoorInteract): starts when the mob bumps into something while its
 * path (with door breaking/entering allowed) leads through a wooden door within 1.5 blocks, and
 * ends once the mob has passed the door's centre.
 */
export abstract class EntityAIDoorInteract extends EntityAIBase {
  protected entityPosX = 0;
  protected entityPosY = 0;
  protected entityPosZ = 0;
  protected targetDoor: BlockDoor | null = null;
  private hasStoppedDoorInteraction = false;
  private entityPositionX = 0;
  private entityPositionZ = 0;

  constructor(protected readonly theEntity: EntityLiving) {
    super();
  }

  shouldExecute(): boolean {
    const e = this.theEntity;
    if (!e.isCollidedHorizontally) return false;
    const nav = e.getNavigator();
    const path = nav.getPath();
    if (!path || path.isFinished() || !nav.getCanBreakDoors()) return false;
    for (let i = 0; i < Math.min(path.getCurrentPathIndex() + 2, path.getCurrentPathLength()); i++) {
      const p = path.getPathPointFromIndex(i);
      this.entityPosX = p.xCoord;
      this.entityPosY = p.yCoord + 1;
      this.entityPosZ = p.zCoord;
      if (!(e.getDistanceSq(this.entityPosX, e.posY, this.entityPosZ) > 2.25)) {
        this.targetDoor = this.findUsableDoor(this.entityPosX, this.entityPosY, this.entityPosZ);
        if (this.targetDoor) return true;
      }
    }
    this.entityPosX = MathHelper.floor_double(e.posX);
    this.entityPosY = MathHelper.floor_double(e.posY + 1);
    this.entityPosZ = MathHelper.floor_double(e.posZ);
    this.targetDoor = this.findUsableDoor(this.entityPosX, this.entityPosY, this.entityPosZ);
    return this.targetDoor !== null;
  }

  override continueExecuting(): boolean {
    return !this.hasStoppedDoorInteraction;
  }

  override startExecuting(): void {
    this.hasStoppedDoorInteraction = false;
    this.entityPositionX = f(f(this.entityPosX + f(0.5)) - this.theEntity.posX);
    this.entityPositionZ = f(f(this.entityPosZ + f(0.5)) - this.theEntity.posZ);
  }

  override updateTask(): void {
    const dx = f(f(this.entityPosX + f(0.5)) - this.theEntity.posX);
    const dz = f(f(this.entityPosZ + f(0.5)) - this.theEntity.posZ);
    if (f(f(this.entityPositionX * dx) + f(this.entityPositionZ * dz)) < 0) this.hasStoppedDoorInteraction = true;
  }

  private findUsableDoor(x: number, y: number, z: number): BlockDoor | null {
    const id = this.theEntity.worldObj.getBlockId(x, y, z);
    return id !== BlockIds.doorWood ? null : (Block.blocksList[id] as BlockDoor);
  }
}
