import type { Entity } from '../Entity';
import type { EntityAnimal } from '../EntityAnimal';
import { EntityAIBase } from './EntityAIBase';

/** Babies walk to the nearest adult of their class within 8 blocks once it is 3+ blocks away. */
export class EntityAIFollowParent extends EntityAIBase {
  private parentAnimal: EntityAnimal | null = null;
  private delayCounter = 0;

  constructor(
    private readonly childAnimal: EntityAnimal,
    private readonly speed: number,
  ) {
    super();
  }

  shouldExecute(): boolean {
    const c = this.childAnimal;
    if (c.getGrowingAge() >= 0) return false;
    const cls = c.constructor as abstract new (...args: never[]) => EntityAnimal;
    let best = Number.MAX_VALUE;
    let parent: EntityAnimal | null = null;
    for (const a of c.worldObj.getEntitiesWithinAABB((e: Entity): e is EntityAnimal => e instanceof cls, c.boundingBox.expand(8, 4, 8))) {
      if (a.getGrowingAge() < 0) continue;
      const d = c.getDistanceSqToEntity(a);
      if (!(d > best)) {
        best = d;
        parent = a;
      }
    }
    if (!parent || best < 9) return false;
    this.parentAnimal = parent;
    return true;
  }

  override continueExecuting(): boolean {
    const p = this.parentAnimal!;
    if (!p.isEntityAlive()) return false;
    const d = this.childAnimal.getDistanceSqToEntity(p);
    return !(d < 9) && !(d > 256);
  }

  override startExecuting(): void {
    this.delayCounter = 0;
  }

  override resetTask(): void {
    this.parentAnimal = null;
  }

  override updateTask(): void {
    if (--this.delayCounter <= 0) {
      this.delayCounter = 10;
      this.childAnimal.getNavigator().tryMoveToEntityLiving(this.parentAnimal!, this.speed);
    }
  }
}
