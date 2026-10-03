import { BlockIds } from '../../block/BlockIds';
import { MathHelper } from '../../core/MathHelper';
import type { EntityLiving } from '../EntityLiving';
import { EntityAIBase } from './EntityAIBase';

/**
 * Sheep grazing (EntityAIEatGrass): 1 in 1000 ticks (1 in 50 for lambs) on tall grass or a
 * grass block, the head goes down for 40 ticks (entity status 10); at tick 4 the tall grass is
 * eaten or the grass block below turns to dirt (with its break effect), and eatGrassBonus runs.
 */
export class EntityAIEatGrass extends EntityAIBase {
  private eatGrassTick = 0;

  constructor(private readonly theEntity: EntityLiving) {
    super();
    this.setMutexBits(7);
  }

  shouldExecute(): boolean {
    const e = this.theEntity;
    if (e.getRNG().nextInt(e.isChild() ? 50 : 1000) !== 0) return false;
    const w = e.worldObj;
    const x = MathHelper.floor_double(e.posX);
    const y = MathHelper.floor_double(e.posY);
    const z = MathHelper.floor_double(e.posZ);
    if (w.getBlockId(x, y, z) === BlockIds.tallGrass && w.getBlockMetadata(x, y, z) === 1) return true;
    return w.getBlockId(x, y - 1, z) === BlockIds.grass;
  }

  override startExecuting(): void {
    this.eatGrassTick = 40;
    this.theEntity.worldObj.setEntityState(this.theEntity, 10);
    this.theEntity.getNavigator().clearPathEntity();
  }

  override resetTask(): void {
    this.eatGrassTick = 0;
  }

  override continueExecuting(): boolean {
    return this.eatGrassTick > 0;
  }

  getEatGrassTick(): number {
    return this.eatGrassTick;
  }

  override updateTask(): void {
    this.eatGrassTick = Math.max(0, this.eatGrassTick - 1);
    if (this.eatGrassTick !== 4) return;
    const e = this.theEntity;
    const w = e.worldObj;
    const x = MathHelper.floor_double(e.posX);
    const y = MathHelper.floor_double(e.posY);
    const z = MathHelper.floor_double(e.posZ);
    if (w.getBlockId(x, y, z) === BlockIds.tallGrass) {
      w.runNaturally(() => w.destroyBlock(x, y, z, false));
      e.eatGrassBonus();
    } else if (w.getBlockId(x, y - 1, z) === BlockIds.grass) {
      w.playAuxSFX(2001, x, y - 1, z, BlockIds.grass);
      w.runNaturally(() => w.setBlock(x, y - 1, z, BlockIds.dirt, 0, 2));
      e.eatGrassBonus();
    }
  }
}
