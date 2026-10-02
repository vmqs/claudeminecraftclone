import { MathHelper } from '../../core/MathHelper';
import type { EntityLiving } from '../EntityLiving';
import { EntityAIBase } from './EntityAIBase';

const f = Math.fround;

/** Pounces at the attack target from 2-4 blocks away, one chance in 5 per tick (EntityAILeapAtTarget). */
export class EntityAILeapAtTarget extends EntityAIBase {
  private leapTarget: EntityLiving | null = null;

  constructor(
    private readonly leaper: EntityLiving,
    private readonly leapMotionY: number,
  ) {
    super();
    this.setMutexBits(5);
  }

  shouldExecute(): boolean {
    this.leapTarget = this.leaper.getAttackTarget();
    if (!this.leapTarget) return false;
    const d = this.leaper.getDistanceSqToEntity(this.leapTarget);
    if (d < 4 || d > 16) return false;
    return this.leaper.onGround && this.leaper.getRNG().nextInt(5) === 0;
  }

  override continueExecuting(): boolean {
    return !this.leaper.onGround;
  }

  override startExecuting(): void {
    const l = this.leaper;
    const dx = this.leapTarget!.posX - l.posX;
    const dz = this.leapTarget!.posZ - l.posZ;
    const d = MathHelper.sqrt_double(dx * dx + dz * dz);
    l.motionX += (dx / d) * 0.5 * f(0.8) + l.motionX * f(0.2);
    l.motionZ += (dz / d) * 0.5 * f(0.8) + l.motionZ * f(0.2);
    l.motionY = f(this.leapMotionY);
  }
}
