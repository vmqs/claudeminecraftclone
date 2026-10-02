import type { Entity } from '../Entity';
import type { EntityLiving } from '../EntityLiving';
import { EntityAITarget } from './EntityAITarget';

/**
 * The class a targeting task looks for: 'player' (EntityPlayer.class, found with
 * World.getClosestVulnerablePlayerToEntity) or a predicate standing in for the class test.
 */
export type TargetClass = 'player' | ((e: Entity) => boolean);

/**
 * Targets the nearest entity of a class (EntityAINearestAttackableTarget): one try in
 * `targetChance` ticks (0 = every tick); players come from the closest vulnerable player
 * lookup (so Creative players are never picked), other classes from the box around the owner
 * (range x 4 x range) sorted by distance, filtered by the optional entity selector.
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
    const list = owner.worldObj.getEntitiesWithinAABBExcludingEntity(null, box, (e) => e.isLivingEntity && cls(e) && (!sel || sel(e)));
    const d = new Map<Entity, number>();
    for (const e of list) d.set(e, owner.getDistanceSqToEntity(e));
    list.sort((a, b) => d.get(a)! - d.get(b)!);
    for (const e of list) {
      if (this.isSuitableTarget(e as EntityLiving, false)) {
        this.targetEntity = e as EntityLiving;
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
