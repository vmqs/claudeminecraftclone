import { ItemIds } from '../block/BlockIds';
import type { World } from '../world/World';
import { EntitySlime } from './EntitySlime';

const f = Math.fround;

/**
 * A magma cube (EntityMagmaCube, "LavaSlime"): a fire-immune, always fully lit slime with
 * size x 3 armour that jumps higher (0.42 + size x 0.1) and four times less often, always
 * hurts on touch (size + 2), ignores lava, never takes fall damage, squishes slower, leaves
 * flame particles and drops magma cream (size > 1).
 */
export class EntityMagmaCube extends EntitySlime {
  constructor(world: World) {
    super(world);
    this.texture = '/mob/lava.png';
    this.isImmuneToFire_ = true;
    this.landMovementFactor = f(0.2);
  }

  override getCanSpawnHere(): boolean {
    return (
      this.worldObj.difficultySetting > 0 &&
      this.worldObj.checkNoEntityCollision(this.boundingBox) &&
      this.worldObj.getCollidingBoundingBoxes(this, this.boundingBox).length === 0 &&
      !this.worldObj.isAnyLiquid(this.boundingBox)
    );
  }

  override getTotalArmorValue(): number {
    return this.getSlimeSize() * 3;
  }

  override getBrightnessForRender(_pt: number): number {
    return 15728880;
  }

  override getBrightness(_pt: number): number {
    return 1;
  }

  protected override getSlimeParticle(): string {
    return 'flame';
  }

  protected override createInstance(): EntitySlime {
    return new EntityMagmaCube(this.worldObj);
  }

  protected override getDropItemId(): number {
    return ItemIds.magmaCream;
  }

  protected override dropFewItems(_recentlyHit: boolean, looting: number): void {
    const id = this.getDropItemId();
    if (id <= 0 || this.getSlimeSize() <= 1) return;
    let n = this.rand.nextInt(4) - 2;
    if (looting > 0) n += this.rand.nextInt(looting + 1);
    for (let i = 0; i < n; i++) this.dropItem(id, 1);
  }

  override isBurning(): boolean {
    return false;
  }

  protected override getJumpDelay(): number {
    return super.getJumpDelay() * 4;
  }

  protected override alterSquishAmount(): void {
    this.squishAmount = f(this.squishAmount * f(0.9));
  }

  protected override jump(): void {
    this.motionY = f(f(0.42) + f(this.getSlimeSize() * f(0.1)));
    this.isAirBorne = true;
  }

  protected override fall(_dist: number): void {}

  protected override canDamagePlayer(): boolean {
    return true;
  }

  protected override getAttackStrength(): number {
    return super.getAttackStrength() + 2;
  }

  protected override getJumpSound(): string {
    return this.getSlimeSize() > 1 ? 'mob.magmacube.big' : 'mob.magmacube.small';
  }

  override handleLavaMovement(): boolean {
    return false;
  }

  protected override makesSoundOnLand(): boolean {
    return true;
  }
}
