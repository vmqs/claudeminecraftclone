import { MathHelper } from '../../core/MathHelper';
import type { EntityLiving } from '../EntityLiving';
import { EntityAIBase } from './EntityAIBase';
import type { IRangedAttackMob } from './IRangedAttackMob';

const f = Math.fround;

/**
 * Ranged attack (EntityAIArrowAttack): walks towards the attack target until it has seen it
 * for 20 ticks within `maxRange`, then stands and shoots; the delay between shots scales with
 * the distance from `minDelay` (point blank) to `maxDelay` (at max range).
 */
export class EntityAIArrowAttack extends EntityAIBase {
  private attackTarget: EntityLiving | null = null;
  private rangedAttackTime = -1;
  private seenTicks = 0;
  private readonly maxRangeSq: number;

  constructor(
    private readonly entityHost: EntityLiving & IRangedAttackMob,
    private readonly entityMoveSpeed: number,
    private readonly minDelay: number,
    private readonly maxDelay: number,
    private readonly maxRange: number,
  ) {
    super();
    this.maxRange = f(maxRange);
    this.maxRangeSq = f(this.maxRange * this.maxRange);
    this.setMutexBits(3);
  }

  shouldExecute(): boolean {
    const t = this.entityHost.getAttackTarget();
    if (!t) return false;
    this.attackTarget = t;
    return true;
  }

  override continueExecuting(): boolean {
    return this.shouldExecute() || !this.entityHost.getNavigator().noPath();
  }

  override resetTask(): void {
    this.attackTarget = null;
    this.seenTicks = 0;
    this.rangedAttackTime = -1;
  }

  override updateTask(): void {
    const host = this.entityHost;
    const t = this.attackTarget!;
    const d = host.getDistanceSq(t.posX, t.boundingBox.minY, t.posZ);
    const canSee = host.getEntitySenses().canSee(t);
    if (canSee) this.seenTicks++;
    else this.seenTicks = 0;
    if (d <= this.maxRangeSq && this.seenTicks >= 20) host.getNavigator().clearPathEntity();
    else host.getNavigator().tryMoveToEntityLiving(t, this.entityMoveSpeed);
    host.getLookHelper().setLookPositionWithEntity(t, 30, 30);
    if (--this.rangedAttackTime === 0) {
      if (d > this.maxRangeSq || !canSee) return;
      const k = f(MathHelper.sqrt_double(d) / this.maxRange);
      let strength = k;
      if (k < f(0.1)) strength = f(0.1);
      if (strength > 1) strength = 1;
      host.attackEntityWithRangedAttack(t, strength);
      this.rangedAttackTime = MathHelper.floor_float(f(f(k * (this.maxDelay - this.minDelay)) + this.minDelay));
    } else if (this.rangedAttackTime < 0) {
      const k = f(MathHelper.sqrt_double(d) / this.maxRange);
      this.rangedAttackTime = MathHelper.floor_float(f(f(k * (this.maxDelay - this.minDelay)) + this.minDelay));
    }
  }
}
