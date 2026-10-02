import type { Entity } from '../Entity';
import type { EntityLiving } from '../EntityLiving';
import { EntityAITarget } from './EntityAITarget';

/**
 * The kind of entity a targeting task looks for, standing in for the Java class argument:
 * 'player' uses the closest vulnerable player, otherwise a type guard over living entities.
 */
export type TargetClass = 'player' | ((e: Entity) => e is EntityLiving);

/** Any living entity (EntityLiving.class). */
export const anyLiving = (e: Entity): e is EntityLiving => e.isLivingEntity;

/**
 * Targets the nearest suitable entity of a class within `distance` (4 blocks up/down), with a
 * 1-in-`chance` roll per check (0 = always) and an optional extra selector (IEntitySelector).
 */
export class EntityAINearestAttackableTarget extends EntityAITarget {
  private targetEntity: EntityLiving | null = null;

  constructor(
    owner: EntityLiving,
    private readonly targetClass: TargetClass,
    distance: number,
    private readonly targetChance: number,
    checkSight: boolean,
    nearbyOnly = false,
    private readonly selector: ((e: Entity) => boolean) | null = null,
  ) {
    super(owner, distance, checkSight, nearbyOnly);
    this.setMutexBits(1);
  }

  shouldExecute(): boolean {
    const owner = this.taskOwner;
    if (this.targetChance > 0 && owner.getRNG().nextInt(this.targetChance) !== 0) return false;
    if (this.targetClass === 'player') {
      const p = owner.worldObj.getClosestVulnerablePlayerToEntity(owner, this.targetDistance);
      if (this.isSuitableTarget(p, false)) {
        this.targetEntity = p;
        return true;
      }
      return false;
    }
    const cls = this.targetClass;
    const sel = this.selector;
    const box = owner.boundingBox.expand(this.targetDistance, 4, this.targetDistance);
    const found = owner.worldObj.getEntitiesWithinAABBExcludingEntity(null, box, (e) => cls(e) && (!sel || sel(e))) as EntityLiving[];
    // EntityAINearestAttackableTargetSorter: nearest first (stable, like Collections.sort).
    const dist = new Map<EntityLiving, number>();
    for (const e of found) dist.set(e, owner.getDistanceSqToEntity(e));
    found.sort((a, b) => dist.get(a)! - dist.get(b)!);
    for (const e of found) {
      if (this.isSuitableTarget(e, false)) {
        this.targetEntity = e;
        return true;
      }
    }
    return false;
  }

  override startExecuting(): void {
    this.taskOwner.setAttackTarget(this.targetEntity);
    super.startExecuting();
  }
}
