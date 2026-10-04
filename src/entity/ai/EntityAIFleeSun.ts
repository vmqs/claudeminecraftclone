import { MathHelper } from '../../core/MathHelper';
import { Vec3 } from '../../core/Vec3';
import type { EntityCreature } from '../EntityCreature';
import { EntityAIBase } from './EntityAIBase';

/**
 * A burning mob under open sky in daytime runs for shade (EntityAIFleeSun): the first of ten
 * random spots within 10 blocks that cannot see the sky and has a negative path weight.
 */
export class EntityAIFleeSun extends EntityAIBase {
  private shelterX = 0;
  private shelterY = 0;
  private shelterZ = 0;

  constructor(
    private readonly theCreature: EntityCreature,
    private readonly movementSpeed: number,
  ) {
    super();
    this.setMutexBits(1);
  }

  shouldExecute(): boolean {
    const c = this.theCreature;
    const w = c.worldObj;
    if (!w.isDaytime() || !c.isBurning()) return false;
    if (!w.canBlockSeeTheSky(MathHelper.floor_double(c.posX), Math.trunc(c.boundingBox.minY), MathHelper.floor_double(c.posZ))) return false;
    const v = this.findPossibleShelter();
    if (!v) return false;
    this.shelterX = v.xCoord;
    this.shelterY = v.yCoord;
    this.shelterZ = v.zCoord;
    return true;
  }

  override continueExecuting(): boolean {
    return !this.theCreature.getNavigator().noPath();
  }

  override startExecuting(): void {
    this.theCreature.getNavigator().tryMoveToXYZ(this.shelterX, this.shelterY, this.shelterZ, this.movementSpeed);
  }

  private findPossibleShelter(): Vec3 | null {
    const c = this.theCreature;
    const r = c.getRNG();
    for (let i = 0; i < 10; i++) {
      const x = MathHelper.floor_double(c.posX + r.nextInt(20) - 10);
      const y = MathHelper.floor_double(c.boundingBox.minY + r.nextInt(6) - 3);
      const z = MathHelper.floor_double(c.posZ + r.nextInt(20) - 10);
      if (!c.worldObj.canBlockSeeTheSky(x, y, z) && c.getBlockPathWeight(x, y, z) < 0) return new Vec3(x, y, z);
    }
    return null;
  }
}
