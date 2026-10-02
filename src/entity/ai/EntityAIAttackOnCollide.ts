import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../Entity';
import type { EntityLiving } from '../EntityLiving';
import type { World } from '../../world/World';
import { EntityAIBase } from './EntityAIBase';
import type { PathEntity } from './PathEntity';

/**
 * Melee chase (EntityAIAttackOnCollide): paths to the attack target (optionally only targets of
 * one class), re-paths every 4-10 ticks while it can see it (or always when
 * `longMemory`), and hits it once per 20 ticks when within (2 x width)^2 of its feet, swinging
 * a held item.
 */
export class EntityAIAttackOnCollide extends EntityAIBase {
  private readonly worldObj: World;
  private entityTarget: EntityLiving | null = null;
  private attackTick = 0;
  private entityPathEntity: PathEntity | null = null;
  private repathDelay = 0;

  constructor(
    private readonly attacker: EntityLiving,
    private readonly speed: number,
    private readonly longMemory: boolean,
    private readonly classTarget: ((e: Entity) => boolean) | null = null,
  ) {
    super();
    this.worldObj = attacker.worldObj;
    this.setMutexBits(3);
  }

  /** The 1.5.2 constructor order (attacker, Class, speed, longMemory). */
  static forClass(attacker: EntityLiving, cls: (e: Entity) => boolean, speed: number, longMemory: boolean): EntityAIAttackOnCollide {
    return new EntityAIAttackOnCollide(attacker, speed, longMemory, cls);
  }

  shouldExecute(): boolean {
    const t = this.attacker.getAttackTarget();
    if (!t) return false;
    if (this.classTarget && !this.classTarget(t)) return false;
    this.entityTarget = t;
    this.entityPathEntity = this.attacker.getNavigator().getPathToEntityLiving(t);
    return this.entityPathEntity !== null;
  }

  override continueExecuting(): boolean {
    const t = this.attacker.getAttackTarget();
    if (!t || !this.entityTarget!.isEntityAlive()) return false;
    const e = this.entityTarget!;
    return !this.longMemory
      ? !this.attacker.getNavigator().noPath()
      : this.attacker.isWithinHomeDistance(MathHelper.floor_double(e.posX), MathHelper.floor_double(e.posY), MathHelper.floor_double(e.posZ));
  }

  override startExecuting(): void {
    this.attacker.getNavigator().setPath(this.entityPathEntity, this.speed);
    this.repathDelay = 0;
  }

  override resetTask(): void {
    this.entityTarget = null;
    this.attacker.getNavigator().clearPathEntity();
  }

  override updateTask(): void {
    const a = this.attacker;
    const t = this.entityTarget!;
    a.getLookHelper().setLookPositionWithEntity(t, 30, 30);
    if ((this.longMemory || a.getEntitySenses().canSee(t)) && --this.repathDelay <= 0) {
      this.repathDelay = 4 + a.getRNG().nextInt(7);
      a.getNavigator().tryMoveToEntityLiving(t, this.speed);
    }
    this.attackTick = Math.max(this.attackTick - 1, 0);
    const w2 = Math.fround(Math.fround(a.width * 2) * Math.fround(a.width * 2));
    if (a.getDistanceSq(t.posX, t.boundingBox.minY, t.posZ) <= w2 && this.attackTick <= 0) {
      this.attackTick = 20;
      if (a.getHeldItem()) a.swingItem();
      a.attackEntityAsMob(t);
    }
  }
}
