import { ItemIds } from '../block/BlockIds';
import { MathHelper } from '../core/MathHelper';
import type { World } from '../world/World';
import { DamageSource } from './DamageSource';
import type { Entity } from './Entity';
import { EntityMob } from './EntityMob';
import { EntitySmallFireball } from './EntitySmallFireball';

const f = Math.fround;

/**
 * A blaze (EntityBlaze): an old-AI, fully lit, fire-immune mob that hovers at a random height
 * offset around its target, crackles and smokes, takes damage in water and, within 30 blocks,
 * flares up for 3 s then fires three small fireballs 6 ticks apart before a 5 s rest. Spawns
 * in any light; drops blaze rods only when killed by a player.
 */
export class EntityBlaze extends EntityMob {
  private heightOffset = f(0.5);
  private heightOffsetUpdateTime = 0;
  /** Shot counter of the current burst (field_70846_g). */
  private shotCount = 0;
  /** DataWatcher 16 bit 0: on fire (charging). */
  private blazeFlags = 0;

  constructor(world: World) {
    super(world);
    this.texture = '/mob/fire.png';
    this.isImmuneToFire_ = true;
    this.experienceValue = 10;
  }

  getMaxHealth(): number {
    return 20;
  }

  protected override getLivingSound(): string | null {
    return 'mob.blaze.breathe';
  }

  protected override getHurtSound(): string | null {
    return 'mob.blaze.hit';
  }

  protected override getDeathSound(): string | null {
    return 'mob.blaze.death';
  }

  override getBrightnessForRender(_pt: number): number {
    return 15728880;
  }

  override getBrightness(_pt: number): number {
    return 1;
  }

  override onLivingUpdate(): void {
    if (this.isWet()) this.attackEntityFrom(DamageSource.drown, 1);
    this.heightOffsetUpdateTime--;
    if (this.heightOffsetUpdateTime <= 0) {
      this.heightOffsetUpdateTime = 100;
      this.heightOffset = f(f(0.5) + f(f(this.rand.nextGaussian()) * 3));
    }
    const t = this.getEntityToAttack();
    if (t && t.posY + t.getEyeHeight() > this.posY + this.getEyeHeight() + this.heightOffset) this.motionY += (f(0.3) - this.motionY) * f(0.3);
    if (this.rand.nextInt(24) === 0) {
      this.worldObj.playSoundEffect(this.posX + 0.5, this.posY + 0.5, this.posZ + 0.5, 'fire.fire', f(1 + this.rand.nextFloat()), f(f(this.rand.nextFloat() * f(0.7)) + f(0.3)));
    }
    if (!this.onGround && this.motionY < 0) this.motionY *= 0.6;
    for (let i = 0; i < 2; i++) {
      this.worldObj.spawnParticle(
        'largesmoke',
        this.posX + (this.rand.nextDouble() - 0.5) * this.width,
        this.posY + this.rand.nextDouble() * this.height,
        this.posZ + (this.rand.nextDouble() - 0.5) * this.width,
        0,
        0,
        0,
      );
    }
    super.onLivingUpdate();
  }

  protected override attackEntity(target: Entity, dist: number): void {
    if (this.attackTime <= 0 && dist < 2 && target.boundingBox.maxY > this.boundingBox.minY && target.boundingBox.minY < this.boundingBox.maxY) {
      this.attackTime = 20;
      this.attackEntityAsMob(target);
    } else if (dist < 30) {
      const dx = target.posX - this.posX;
      const dy = target.boundingBox.minY + f(target.height / 2) - (this.posY + f(this.height / 2));
      const dz = target.posZ - this.posZ;
      if (this.attackTime === 0) {
        this.shotCount++;
        if (this.shotCount === 1) {
          this.attackTime = 60;
          this.setOnFireFlag(true);
        } else if (this.shotCount <= 4) {
          this.attackTime = 6;
        } else {
          this.attackTime = 100;
          this.shotCount = 0;
          this.setOnFireFlag(false);
        }
        if (this.shotCount > 1) {
          const spread = f(MathHelper.sqrt_float(dist) * f(0.5));
          this.worldObj.playAuxSFXAtEntity(null, 1009, Math.trunc(this.posX), Math.trunc(this.posY), Math.trunc(this.posZ), 0);
          const ball = new EntitySmallFireball(this.worldObj, this, dx + this.rand.nextGaussian() * spread, dy, dz + this.rand.nextGaussian() * spread);
          ball.posY = this.posY + f(this.height / 2) + 0.5;
          this.worldObj.spawnEntityInWorld(ball);
        }
      }
      this.rotationYaw = f(f((Math.atan2(dz, dx) * 180) / f(Math.PI)) - 90);
      this.hasAttacked = true;
    }
  }

  protected override fall(_dist: number): void {}

  protected override getDropItemId(): number {
    return ItemIds.blazeRod;
  }

  /** Burning (shown on fire) while charging a burst. */
  override isBurning(): boolean {
    return this.isOnFireFlag();
  }

  protected override dropFewItems(recentlyHit: boolean, looting: number): void {
    if (!recentlyHit) return;
    const n = this.rand.nextInt(2 + looting);
    for (let i = 0; i < n; i++) this.dropItem(ItemIds.blazeRod, 1);
  }

  /** func_70845_n */
  isOnFireFlag(): boolean {
    return (this.blazeFlags & 1) !== 0;
  }

  /** func_70844_e */
  setOnFireFlag(v: boolean): void {
    this.blazeFlags = v ? this.blazeFlags | 1 : this.blazeFlags & -2;
  }

  protected override isValidLightLevel(): boolean {
    return true;
  }

  override getAttackStrength(_target: Entity): number {
    return 6;
  }
}
