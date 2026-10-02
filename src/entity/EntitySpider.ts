import { ItemIds } from '../block/BlockIds';
import { MathHelper } from '../core/MathHelper';
import type { World } from '../world/World';
import type { Entity } from './Entity';
import { EnumCreatureAttribute } from './EntityLiving';
import { EntityMob } from './EntityMob';
import { EntitySkeleton } from './EntitySkeleton';
import { PotionId, type PotionEffectLike } from './PotionEffects';

const f = Math.fround;

/**
 * A spider (EntitySpider): old-AI mob that climbs walls (beside a block it counts as on a
 * ladder), is neutral in light above 0.5 (and may lose interest there), leaps at its target
 * from 2-6 blocks, ignores cobwebs and poison. 1% spawn with a skeleton riding them.
 */
export class EntitySpider extends EntityMob {
  /** DataWatcher 16 bit 0: beside a climbable block. */
  private climbFlags = 0;

  constructor(world: World) {
    super(world);
    this.texture = '/mob/spider.png';
    this.setSize(f(1.4), f(0.9));
    this.moveSpeed = f(0.8);
  }

  override onUpdate(): void {
    super.onUpdate();
    this.setBesideClimbableBlock(this.isCollidedHorizontally);
  }

  getMaxHealth(): number {
    return 16;
  }

  override getMountedYOffset(): number {
    return this.height * 0.75 - 0.5;
  }

  /** Only in the dark (brightness below 0.5). */
  protected override findPlayerToAttack(): Entity | null {
    if (this.getBrightness(1) < f(0.5)) return this.worldObj.getClosestVulnerablePlayerToEntity(this, 16);
    return null;
  }

  protected override getLivingSound(): string | null {
    return 'mob.spider.say';
  }

  protected override getHurtSound(): string | null {
    return 'mob.spider.say';
  }

  protected override getDeathSound(): string | null {
    return 'mob.spider.death';
  }

  protected override playStepSound(_x: number, _y: number, _z: number, _id: number): void {
    this.playSound('mob.spider.step', f(0.15), 1);
  }

  /** In the light it may give up (1/100 per tick); from 2-6 blocks it sometimes leaps. */
  protected override attackEntity(target: Entity, dist: number): void {
    if (this.getBrightness(1) > f(0.5) && this.rand.nextInt(100) === 0) {
      this.entityToAttack = null;
      return;
    }
    if (!(dist > 2) || !(dist < 6) || this.rand.nextInt(10) !== 0) {
      super.attackEntity(target, dist);
    } else if (this.onGround) {
      const dx = target.posX - this.posX;
      const dz = target.posZ - this.posZ;
      const d = MathHelper.sqrt_double(dx * dx + dz * dz);
      this.motionX = (dx / d) * 0.5 * f(0.8) + this.motionX * f(0.2);
      this.motionZ = (dz / d) * 0.5 * f(0.8) + this.motionZ * f(0.2);
      this.motionY = f(0.4);
    }
  }

  protected override getDropItemId(): number {
    return ItemIds.silk;
  }

  /** String, plus a spider eye (1 in 3, better with looting) when killed by a player. */
  protected override dropFewItems(recentlyHit: boolean, looting: number): void {
    super.dropFewItems(recentlyHit, looting);
    if (recentlyHit && (this.rand.nextInt(3) === 0 || this.rand.nextInt(1 + looting) > 0)) this.dropItem(ItemIds.spiderEye, 1);
  }

  override isOnLadder(): boolean {
    return this.isBesideClimbableBlock();
  }

  override setInWeb(): void {}

  /** Model scale (cave spiders are 0.7). */
  spiderScaleAmount(): number {
    return 1;
  }

  override getCreatureAttribute(): EnumCreatureAttribute {
    return EnumCreatureAttribute.ARTHROPOD;
  }

  override isPotionApplicable(effect: PotionEffectLike): boolean {
    return effect.getPotionID() === PotionId.poison ? false : super.isPotionApplicable(effect);
  }

  isBesideClimbableBlock(): boolean {
    return (this.climbFlags & 1) !== 0;
  }

  setBesideClimbableBlock(v: boolean): void {
    this.climbFlags = v ? this.climbFlags | 1 : this.climbFlags & -2;
  }

  /** Spider jockey: 1 in 100 get a skeleton rider. */
  override initCreature(): void {
    if (this.worldObj.rand.nextInt(100) === 0) {
      const rider = new EntitySkeleton(this.worldObj);
      rider.setLocationAndAngles(this.posX, this.posY, this.posZ, this.rotationYaw, 0);
      rider.initCreature();
      this.worldObj.spawnEntityInWorld(rider);
      rider.mountEntity(this);
    }
  }
}
