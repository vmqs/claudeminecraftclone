import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../Entity';
import type { EntityLiving } from '../EntityLiving';
import type { PathEntity } from './PathEntity';
import { EntityAIBase } from './EntityAIBase';

const f = Math.fround;

/**
 * Melee (EntityAIAttackOnCollide): paths to the attack target (re-pathing every 4-10 ticks) and
 * hits it every 20 ticks once within (2 x width)^2. With `longMemory` it keeps chasing a target
 * it cannot see as long as the target stays inside the home area.
 */
export class EntityAIAttackOnCollide extends EntityAIBase {
  private entityTarget: EntityLiving | null = null;
  private attackTick = 0;
  private entityPathEntity: PathEntity | null = null;
  private repathDelay = 0;
  private readonly classTarget: ((e: Entity) => boolean) | null;

  constructor(attacker: EntityLiving, speed: number, longMemory: boolean);
  constructor(attacker: EntityLiving, classTarget: (e: Entity) => boolean, speed: number, longMemory: boolean);
  constructor(
    private readonly attacker: EntityLiving,
    a: number | ((e: Entity) => boolean),
    b: number | boolean,
    c?: boolean,
  ) {
    super();
    if (typeof a === 'function') {
      this.classTarget = a;
      this.speed = b as number;
      this.longMemory = c!;
    } else {
      this.classTarget = null;
      this.speed = a;
      this.longMemory = b as boolean;
    }
    this.setMutexBits(3);
  }

  private readonly speed: number;
  private readonly longMemory: boolean;

  /** The 1.5.2 (attacker, Class, speed, longMemory) constructor, named for readability. */
  static forClass(attacker: EntityLiving, cls: (e: Entity) => boolean, speed: number, longMemory: boolean): EntityAIAttackOnCollide {
    return new EntityAIAttackOnCollide(attacker, cls, speed, longMemory);
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
    if (!this.longMemory) return !this.attacker.getNavigator().noPath();
    const e = this.entityTarget!;
    return this.attacker.isWithinHomeDistance(MathHelper.floor_double(e.posX), MathHelper.floor_double(e.posY), MathHelper.floor_double(e.posZ));
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
    const reach = f(f(f(a.width * 2) * a.width) * 2);
    if (!(a.getDistanceSq(t.posX, t.boundingBox.minY, t.posZ) > reach) && this.attackTick <= 0) {
      this.attackTick = 20;
      if (a.getHeldItem()) a.swingItem();
      a.attackEntityAsMob(t);
    }
  }
}
