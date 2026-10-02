import type { Entity } from '../Entity';
import type { EntityAnimal } from '../EntityAnimal';
import { EntityXPOrb } from '../EntityXPOrb';
import { EntityAIBase } from './EntityAIBase';

/**
 * Love-mode breeding (EntityAIMate): an animal in love walks to the nearest animal of its class
 * it can mate with and, after 60 ticks within 3 blocks, makes a baby (growing age -24000), both
 * parents get a 6000-tick cooldown, and an orb of 1-7 experience appears.
 */
export class EntityAIMate extends EntityAIBase {
  private targetMate: EntityAnimal | null = null;
  private spawnBabyDelay = 0;

  constructor(
    private readonly theAnimal: EntityAnimal,
    private readonly moveSpeed: number,
  ) {
    super();
    this.setMutexBits(3);
  }

  shouldExecute(): boolean {
    if (!this.theAnimal.isInLove()) return false;
    this.targetMate = this.getNearbyMate();
    return this.targetMate !== null;
  }

  override continueExecuting(): boolean {
    const m = this.targetMate!;
    return m.isEntityAlive() && m.isInLove() && this.spawnBabyDelay < 60;
  }

  override resetTask(): void {
    this.targetMate = null;
    this.spawnBabyDelay = 0;
  }

  override updateTask(): void {
    const a = this.theAnimal;
    const m = this.targetMate!;
    a.getLookHelper().setLookPositionWithEntity(m, 10, a.getVerticalFaceSpeed());
    a.getNavigator().tryMoveToEntityLiving(m, this.moveSpeed);
    this.spawnBabyDelay++;
    if (this.spawnBabyDelay >= 60 && a.getDistanceSqToEntity(m) < 9) this.spawnBaby();
  }

  private getNearbyMate(): EntityAnimal | null {
    const a = this.theAnimal;
    const r = 8;
    const cls = a.constructor as abstract new (...args: never[]) => EntityAnimal;
    let best = Number.MAX_VALUE;
    let found: EntityAnimal | null = null;
    for (const other of a.worldObj.getEntitiesWithinAABB((e: Entity): e is EntityAnimal => e instanceof cls, a.boundingBox.expand(r, r, r))) {
      if (a.canMateWith(other) && a.getDistanceSqToEntity(other) < best) {
        found = other;
        best = a.getDistanceSqToEntity(other);
      }
    }
    return found;
  }

  private spawnBaby(): void {
    const a = this.theAnimal;
    const m = this.targetMate!;
    const child = a.createChild(m);
    if (!child) return;
    a.setGrowingAge(6000);
    m.setGrowingAge(6000);
    a.resetInLove();
    m.resetInLove();
    child.setGrowingAge(-24000);
    child.setLocationAndAngles(a.posX, a.posY, a.posZ, 0, 0);
    a.worldObj.spawnEntityInWorld(child);
    // The original also spawns seven hearts here, but this task only runs on the integrated
    // server, whose particles are never shown; only their random draws are kept.
    const rand = a.getRNG();
    for (let i = 0; i < 7; i++) {
      rand.nextGaussian();
      rand.nextGaussian();
      rand.nextGaussian();
      rand.nextFloat();
      rand.nextFloat();
      rand.nextFloat();
    }
    a.worldObj.spawnEntityInWorld(new EntityXPOrb(a.worldObj, a.posX, a.posY, a.posZ, rand.nextInt(7) + 1));
  }
}
