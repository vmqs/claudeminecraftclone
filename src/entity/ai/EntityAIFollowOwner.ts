import { MathHelper } from '../../core/MathHelper';
import type { EntityLiving } from '../EntityLiving';
import type { EntityTameable } from '../EntityTameable';
import { EntityAIBase } from './EntityAIBase';

const f = Math.fround;

/**
 * A pet follows its owner once `minDist` away until within `maxDist`; when no path exists and
 * the owner is 12+ blocks away it teleports to a free spot on the edge of a 5x5 square around
 * the owner's feet.
 */
export class EntityAIFollowOwner extends EntityAIBase {
  private theOwner: EntityLiving | null = null;
  private repathDelay = 0;
  private avoidWater = false;

  constructor(
    private readonly thePet: EntityTameable,
    private readonly speed: number,
    private readonly minDist: number,
    private readonly maxDist: number,
  ) {
    super();
    this.setMutexBits(3);
  }

  shouldExecute(): boolean {
    const owner = this.thePet.getOwner();
    if (!owner || this.thePet.isSitting()) return false;
    if (this.thePet.getDistanceSqToEntity(owner) < this.minDist * this.minDist) return false;
    this.theOwner = owner;
    return true;
  }

  override continueExecuting(): boolean {
    return !this.thePet.getNavigator().noPath() && this.thePet.getDistanceSqToEntity(this.theOwner!) > this.maxDist * this.maxDist && !this.thePet.isSitting();
  }

  override startExecuting(): void {
    this.repathDelay = 0;
    this.avoidWater = this.thePet.getNavigator().getAvoidsWater();
    this.thePet.getNavigator().setAvoidsWater(false);
  }

  override resetTask(): void {
    this.theOwner = null;
    this.thePet.getNavigator().clearPathEntity();
    this.thePet.getNavigator().setAvoidsWater(this.avoidWater);
  }

  override updateTask(): void {
    const pet = this.thePet;
    const owner = this.theOwner!;
    pet.getLookHelper().setLookPositionWithEntity(owner, 10, pet.getVerticalFaceSpeed());
    if (pet.isSitting() || --this.repathDelay > 0) return;
    this.repathDelay = 10;
    if (pet.getNavigator().tryMoveToEntityLiving(owner, this.speed)) return;
    if (pet.getDistanceSqToEntity(owner) < 144) return;
    const w = pet.worldObj;
    const x0 = MathHelper.floor_double(owner.posX) - 2;
    const z0 = MathHelper.floor_double(owner.posZ) - 2;
    const y = MathHelper.floor_double(owner.boundingBox.minY);
    for (let i = 0; i <= 4; i++) {
      for (let j = 0; j <= 4; j++) {
        if (
          (i < 1 || j < 1 || i > 3 || j > 3) &&
          w.doesBlockHaveSolidTopSurface(x0 + i, y - 1, z0 + j) &&
          !w.isBlockNormalCube(x0 + i, y, z0 + j) &&
          !w.isBlockNormalCube(x0 + i, y + 1, z0 + j)
        ) {
          pet.setLocationAndAngles(f(x0 + i + f(0.5)), y, f(z0 + j + f(0.5)), pet.rotationYaw, pet.rotationPitch);
          pet.getNavigator().clearPathEntity();
          return;
        }
      }
    }
  }
}
