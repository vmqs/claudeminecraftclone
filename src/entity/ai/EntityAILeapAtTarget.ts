import { MathHelper } from '../../core/MathHelper';
import type { EntityLiving } from '../EntityLiving';
import { EntityAIBase } from './EntityAIBase';

const f = Math.fround;

/** Pounces at the attack target from 2-4 blocks away (1 in 5 checks, only from the ground). */
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
    return this.leaper.onGround ? this.leaper.getRNG().nextInt(5) === 0 : false;
  }

  override continueExecuting(): boolean {
    return !this.leaper.onGround;
  }

  override startExecuting(): void {
    const e = this.leaper;
    const t = this.leapTarget!;
    const dx = t.posX - e.posX;
    const dz = t.posZ - e.posZ;
    const d = MathHelper.sqrt_double(dx * dx + dz * dz);
    e.motionX += (dx / d) * 0.5 * f(0.8) + e.motionX * f(0.2);
    e.motionZ += (dz / d) * 0.5 * f(0.8) + e.motionZ * f(0.2);
    e.motionY = this.leapMotionY;
  }
}
