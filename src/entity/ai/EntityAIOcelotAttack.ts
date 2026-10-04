import type { EntityLiving } from '../EntityLiving';
import { EntityAIBase } from './EntityAIBase';

const f = Math.fround;

/** Ocelots stalk the attack target (slow far away, sprinting within 4 blocks) and hit every 20 ticks. */
export class EntityAIOcelotAttack extends EntityAIBase {
  private theVictim: EntityLiving | null = null;
  private attackCountdown = 0;

  constructor(private readonly theEntity: EntityLiving) {
    super();
    this.setMutexBits(3);
  }

  shouldExecute(): boolean {
    const t = this.theEntity.getAttackTarget();
    if (!t) return false;
    this.theVictim = t;
    return true;
  }

  override continueExecuting(): boolean {
    const v = this.theVictim!;
    if (!v.isEntityAlive() || v.isCreativeInvulnerable()) return false;
    if (this.theEntity.getDistanceSqToEntity(v) > 225) return false;
    return !this.theEntity.getNavigator().noPath() || this.shouldExecute();
  }

  override resetTask(): void {
    this.theVictim = null;
    this.theEntity.getNavigator().clearPathEntity();
  }

  override updateTask(): void {
    const e = this.theEntity;
    const v = this.theVictim!;
    e.getLookHelper().setLookPositionWithEntity(v, 30, 30);
    const reach = f(f(f(e.width * 2) * e.width) * 2);
    const d = e.getDistanceSq(v.posX, v.boundingBox.minY, v.posZ);
    let speed = f(0.23);
    if (d > reach && d < 16) speed = f(0.4);
    else if (d < 225) speed = f(0.18);
    e.getNavigator().tryMoveToEntityLiving(v, speed);
    this.attackCountdown = Math.max(this.attackCountdown - 1, 0);
    if (!(d > reach) && this.attackCountdown <= 0) {
      this.attackCountdown = 20;
      e.attackEntityAsMob(v);
    }
  }
}
