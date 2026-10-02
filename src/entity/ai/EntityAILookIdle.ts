import type { EntityLiving } from '../EntityLiving';
import { EntityAIBase } from './EntityAIBase';

/** Glances in a random horizontal direction for 1-2 seconds. */
export class EntityAILookIdle extends EntityAIBase {
  private lookX = 0;
  private lookZ = 0;
  private idleTime = 0;

  constructor(private readonly idleEntity: EntityLiving) {
    super();
    this.setMutexBits(3);
  }

  shouldExecute(): boolean {
    return this.idleEntity.getRNG().nextFloat() < Math.fround(0.02);
  }

  override continueExecuting(): boolean {
    return this.idleTime >= 0;
  }

  override startExecuting(): void {
    const a = Math.PI * 2 * this.idleEntity.getRNG().nextDouble();
    this.lookX = Math.cos(a);
    this.lookZ = Math.sin(a);
    this.idleTime = 20 + this.idleEntity.getRNG().nextInt(20);
  }

  override updateTask(): void {
    const e = this.idleEntity;
    this.idleTime--;
    e.getLookHelper().setLookPosition(e.posX + this.lookX, e.posY + e.getEyeHeight(), e.posZ + this.lookZ, 10, e.getVerticalFaceSpeed());
  }
}
