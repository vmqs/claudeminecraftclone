import type { World } from '../world/World';
import { EntityCreature } from './EntityCreature';

/** Iron and snow golems (EntityGolem): no fall damage, silent by default, never despawn. */
export abstract class EntityGolem extends EntityCreature {
  constructor(world: World) {
    super(world);
  }

  protected override fall(_dist: number): void {}

  protected override getLivingSound(): string | null {
    return 'none';
  }

  protected override getHurtSound(): string | null {
    return 'none';
  }

  protected override getDeathSound(): string | null {
    return 'none';
  }

  override getTalkInterval(): number {
    return 120;
  }

  protected override canDespawn(): boolean {
    return false;
  }
}
