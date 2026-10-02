import { MathHelper } from '../core/MathHelper';
import { EnumSkyBlock } from '../world/IBlockAccess';
import type { World } from '../world/World';
import { type DamageSource, EntityDamageSource } from './DamageSource';
import type { Entity } from './Entity';
import { EntityCreature } from './EntityCreature';

const f = Math.fround;

/**
 * A hostile monster (EntityMob, IMob): ages faster in light, removed on Peaceful, targets the
 * closest vulnerable player it can see (so Creative players are ignored until they attack),
 * melees for getAttackStrength() and spawns only in the dark.
 */
export abstract class EntityMob extends EntityCreature {
  constructor(world: World) {
    super(world);
    this.experienceValue = 5;
  }

  override get isIMob(): boolean {
    return true;
  }

  override onLivingUpdate(): void {
    this.updateArmSwingProgress();
    if (this.getBrightness(1) > 0.5) this.entityAge += 2;
    super.onLivingUpdate();
  }

  override onUpdate(): void {
    super.onUpdate();
    if (this.worldObj.difficultySetting === 0) this.setDead();
  }

  protected override findPlayerToAttack(): Entity | null {
    const p = this.worldObj.getClosestVulnerablePlayerToEntity(this, 16);
    return p && this.canEntityBeSeen(p) ? p : null;
  }

  override attackEntityFrom(src: DamageSource, amount: number): boolean {
    if (this.isEntityInvulnerable()) return false;
    if (!super.attackEntityFrom(src, amount)) return false;
    const attacker = src.getEntity();
    if (this.riddenByEntity !== attacker && this.ridingEntity !== attacker && attacker !== this) this.entityToAttack = attacker;
    return true;
  }

  /** Melee: getAttackStrength() as mob damage. */
  override attackEntityAsMob(target: Entity): boolean {
    const damage = this.getAttackStrength(target);
    return target.attackEntityFrom(EntityDamageSource.causeMobDamage(this), damage);
  }

  /** Old AI melee: within 2 blocks and overlapping vertically, every 20 ticks. */
  protected override attackEntity(target: Entity, dist: number): void {
    if (this.attackTime <= 0 && dist < 2 && target.boundingBox.maxY > this.boundingBox.minY && target.boundingBox.minY < this.boundingBox.maxY) {
      this.attackTime = 20;
      this.attackEntityAsMob(target);
    }
  }

  override getBlockPathWeight(x: number, y: number, z: number): number {
    return f(f(0.5) - this.worldObj.getLightBrightness(x, y, z));
  }

  /** Dark enough: sky light below a random 0-31 and block light (thunder darkened) below 0-7. */
  protected isValidLightLevel(): boolean {
    const x = MathHelper.floor_double(this.posX);
    const y = MathHelper.floor_double(this.boundingBox.minY);
    const z = MathHelper.floor_double(this.posZ);
    if (this.worldObj.getSavedLightValue(EnumSkyBlock.Sky, x, y, z) > this.rand.nextInt(32)) return false;
    let light = this.worldObj.getBlockLightValue(x, y, z);
    if (this.worldObj.isThundering()) {
      const saved = this.worldObj.skylightSubtracted;
      this.worldObj.skylightSubtracted = 10;
      light = this.worldObj.getBlockLightValue(x, y, z);
      this.worldObj.skylightSubtracted = saved;
    }
    return light <= this.rand.nextInt(8);
  }

  override getCanSpawnHere(): boolean {
    return this.isValidLightLevel() && super.getCanSpawnHere();
  }

  getAttackStrength(_target: Entity): number {
    return 2;
  }
}
