import type { World } from '../world/World';
import type { Entity } from './Entity';
import { EntityMob } from './EntityMob';

const f = Math.fround;

/**
 * The giant (EntityGiantZombie): a zombie six times the size with 100 health and 50 damage on
 * the old AI, preferring bright spots. It has no spawn egg and never spawns naturally.
 */
export class EntityGiantZombie extends EntityMob {
  constructor(world: World) {
    super(world);
    this.texture = '/mob/zombie.png';
    this.moveSpeed = f(0.5);
    this.yOffset = f(this.yOffset * 6);
    this.setSize(f(this.width * 6), f(this.height * 6));
  }

  getMaxHealth(): number {
    return 100;
  }

  override getBlockPathWeight(x: number, y: number, z: number): number {
    return f(this.worldObj.getLightBrightness(x, y, z) - f(0.5));
  }

  override getAttackStrength(_target: Entity): number {
    return 50;
  }
}
