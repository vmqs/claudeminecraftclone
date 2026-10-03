import { MathHelper } from '../../core/MathHelper';
import type { EntityLiving } from '../EntityLiving';
import { EntityAIBase } from './EntityAIBase';
import type { IRangedAttackMob } from './IRangedAttackMob';

const f = Math.fround;

/**
 * Ranged attack (EntityAIArrowAttack): approaches the target until it has been visible for 20
 * ticks within `range`, then shoots every minInterval..maxInterval ticks (scaled by distance).
 * `new EntityAIArrowAttack(mob, speed, interval, range)` uses one interval for both bounds.
 */
export class EntityAIArrowAttack extends EntityAIBase {
  private attackTarget: EntityLiving | null = null;
  private rangedAttackTime = -1;
  private seeTime = 0;
  private readonly minInterval: number;
  private readonly maxInterval: number;
  private readonly range: number;
  private readonly rangeSq: number;

  constructor(host: EntityLiving & IRangedAttackMob, speed: number, interval: number, range: number);
  constructor(host: EntityLiving & IRangedAttackMob, speed: number, minInterval: number, maxInterval: number, range: number);
  constructor(
    private readonly entityHost: EntityLiving & IRangedAttackMob,
    private readonly entityMoveSpeed: number,
    a: number,
    b: number,
    c?: number,
  ) {
    super();
    this.minInterval = a;
    if (c === undefined) {
      this.maxInterval = a;
      this.range = b;
    } else {
      this.maxInterval = b;
      this.range = c;
    }
    this.rangeSq = f(this.range * this.range);
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
    this.seeTime = 0;
    this.rangedAttackTime = -1;
  }

  override updateTask(): void {
    const host = this.entityHost;
    const t = this.attackTarget!;
    const d = host.getDistanceSq(t.posX, t.boundingBox.minY, t.posZ);
    const sees = host.getEntitySenses().canSee(t);
    if (sees) this.seeTime++;
    else this.seeTime = 0;
    if (!(d > this.rangeSq) && this.seeTime >= 20) host.getNavigator().clearPathEntity();
    else host.getNavigator().tryMoveToEntityLiving(t, this.entityMoveSpeed);
    host.getLookHelper().setLookPositionWithEntity(t, 30, 30);
    if (--this.rangedAttackTime === 0) {
      if (d > this.rangeSq || !sees) return;
      const k = f(MathHelper.sqrt_double(d) / this.range);
      let power = k;
      if (k < f(0.1)) power = f(0.1);
      if (power > 1) power = 1;
      host.attackEntityWithRangedAttack(t, power);
      this.rangedAttackTime = MathHelper.floor_float(f(f(k * (this.maxInterval - this.minInterval)) + this.minInterval));
    } else if (this.rangedAttackTime < 0) {
      const k = f(MathHelper.sqrt_double(d) / this.range);
      this.rangedAttackTime = MathHelper.floor_float(f(f(k * (this.maxInterval - this.minInterval)) + this.minInterval));
    }
  }
}
