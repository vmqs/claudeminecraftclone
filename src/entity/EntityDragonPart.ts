import type { World } from '../world/World';
import type { DamageSource } from './DamageSource';
import { Entity } from './Entity';

/** The whole of a multi-part entity (IEntityMultiPart): the Ender Dragon. */
export interface IEntityMultiPart extends Entity {
  /** func_82194_d: the world the parts live in. */
  getWorld(): World;
  attackEntityFromPart(part: EntityDragonPart, src: DamageSource, amount: number): boolean;
}

/**
 * One hit box of the Ender Dragon (EntityDragonPart: head, body, three tail pieces, two wings).
 * Parts are never in the world's entity list: the dragon moves them every tick and the world's
 * entity queries return them next to it (Chunk.getEntitiesWithinAABBForEntity), so players,
 * arrows and explosions hit the parts and the parts pass the damage on.
 */
export class EntityDragonPart extends Entity {
  constructor(
    readonly entityDragonObj: IEntityMultiPart,
    readonly name: string,
    width: number,
    height: number,
  ) {
    super(entityDragonObj.getWorld());
    this.setSize(width, height);
  }

  protected entityInit(): void {}

  override canBeCollidedWith(): boolean {
    return true;
  }

  override attackEntityFrom(src: DamageSource, amount: number): boolean {
    return this.isEntityInvulnerable() ? false : this.entityDragonObj.attackEntityFromPart(this, src, amount);
  }

  override isEntityEqual(e: Entity): boolean {
    return this === e || this.entityDragonObj === e;
  }

  override getMultiPartOwner(): Entity {
    return this.entityDragonObj;
  }
}
