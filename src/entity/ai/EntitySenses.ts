import type { Entity } from '../Entity';
import type { EntityLiving } from '../EntityLiving';

/** Per-tick cache of line-of-sight checks (EntitySenses). */
export class EntitySenses {
  private readonly seenEntities = new Set<Entity>();
  private readonly unseenEntities = new Set<Entity>();

  constructor(private readonly entityObj: EntityLiving) {}

  clearSensingCache(): void {
    this.seenEntities.clear();
    this.unseenEntities.clear();
  }

  canSee(e: Entity): boolean {
    if (this.seenEntities.has(e)) return true;
    if (this.unseenEntities.has(e)) return false;
    const seen = this.entityObj.canEntityBeSeen(e);
    (seen ? this.seenEntities : this.unseenEntities).add(e);
    return seen;
  }
}
