import { ItemIds } from '../block/BlockIds';
import { EnchantmentHelper } from '../enchantment/EnchantmentHelper';
import { ItemStack } from '../item/ItemStack';
import { PotionEffect } from '../potion/PotionEffect';
import type { World } from '../world/World';
import { EntityAIArrowAttack } from './ai/EntityAIArrowAttack';
import { EntityAIAttackOnCollide } from './ai/EntityAIAttackOnCollide';
import { EntityAIFleeSun } from './ai/EntityAIFleeSun';
import { EntityAIHurtByTarget } from './ai/EntityAIHurtByTarget';
import { EntityAILookIdle } from './ai/EntityAILookIdle';
import { EntityAINearestAttackableTarget } from './ai/EntityAINearestAttackableTarget';
import { EntityAIRestrictSun } from './ai/EntityAIRestrictSun';
import { EntityAISwimming } from './ai/EntityAISwimming';
import { EntityAIWander } from './ai/EntityAIWander';
import { EntityAIWatchClosest } from './ai/EntityAIWatchClosest';
import type { IRangedAttackMob } from './ai/IRangedAttackMob';
import type { Entity } from './Entity';
import { EntityArrow } from './EntityArrow';
import { EntityLiving, EnumCreatureAttribute } from './EntityLiving';
import { EntityMob } from './EntityMob';
import { burnInDaylight, maybeHalloweenHelmet, tagNumber } from './HostileMobUtil';
import { PotionId, type PotionEffectLike } from './PotionEffects';

const f = Math.fround;

/** Enchantment effect IDs the skeleton's bow reads (power, punch, flame). */
const POWER = 48;
const PUNCH = 49;
const FLAME = 50;

/**
 * A skeleton (EntitySkeleton): AI-task archer that shoots players it may target with
 * EntityAIArrowAttack (20-60 ticks, 15 blocks), shelters from the sun and burns in it unless
 * helmeted. Type 1 is the wither skeleton (Nether only: stone sword, melee, wither effect,
 * fire immune, 1.2x scale); the combat task follows the held item (bow = ranged).
 */
export class EntitySkeleton extends EntityMob implements IRangedAttackMob {
  private readonly aiArrowAttack = new EntityAIArrowAttack(this, f(0.25), 20, 60, 15);
  private readonly aiAttackOnCollide = EntityAIAttackOnCollide.forClass(this, (e) => e.isPlayerEntity, f(0.31), false);
  /** DataWatcher 13: 0 normal, 1 wither. */
  private skeletonType = 0;

  constructor(world: World) {
    super(world);
    this.texture = '/mob/skeleton.png';
    this.moveSpeed = f(0.25);
    this.tasks.addTask(1, new EntityAISwimming(this));
    this.tasks.addTask(2, new EntityAIRestrictSun(this));
    this.tasks.addTask(3, new EntityAIFleeSun(this, this.moveSpeed));
    this.tasks.addTask(5, new EntityAIWander(this, this.moveSpeed));
    this.tasks.addTask(6, new EntityAIWatchClosest(this, 'player', 8));
    this.tasks.addTask(6, new EntityAILookIdle(this));
    this.targetTasks.addTask(1, new EntityAIHurtByTarget(this, false));
    this.targetTasks.addTask(2, new EntityAINearestAttackableTarget(this, 'player', 16, 0, true));
    if (world) this.setCombatTask();
  }

  protected override isAIEnabled(): boolean {
    return true;
  }

  getMaxHealth(): number {
    return 20;
  }

  protected override getLivingSound(): string | null {
    return 'mob.skeleton.say';
  }

  protected override getHurtSound(): string | null {
    return 'mob.skeleton.hurt';
  }

  protected override getDeathSound(): string | null {
    return 'mob.skeleton.death';
  }

  protected override playStepSound(_x: number, _y: number, _z: number, _id: number): void {
    this.playSound('mob.skeleton.step', f(0.15), 1);
  }

  /** Wither skeletons inflict 10 s of Wither. */
  override attackEntityAsMob(target: Entity): boolean {
    if (!super.attackEntityAsMob(target)) return false;
    if (this.getSkeletonType() === 1 && target.isLivingEntity) (target as EntityLiving).addPotionEffect(new PotionEffect(PotionId.wither, 200) as unknown as PotionEffectLike);
    return true;
  }

  override getAttackStrength(target: Entity): number {
    if (this.getSkeletonType() !== 1) return super.getAttackStrength(target);
    const held = this.getHeldItem();
    let dmg = 4;
    if (held) dmg += held.getDamageVsEntity(this);
    return dmg;
  }

  override getCreatureAttribute(): EnumCreatureAttribute {
    return EnumCreatureAttribute.UNDEAD;
  }

  override onLivingUpdate(): void {
    burnInDaylight(this, this.rand);
    super.onLivingUpdate();
  }

  protected override getDropItemId(): number {
    return ItemIds.arrow;
  }

  /** 0-2 arrows (wither: up to 1 coal) and 0-2 bones, more with looting. */
  protected override dropFewItems(_recentlyHit: boolean, looting: number): void {
    if (this.getSkeletonType() === 1) {
      const n = this.rand.nextInt(3 + looting) - 1;
      for (let i = 0; i < n; i++) this.dropItem(ItemIds.coal, 1);
    } else {
      const n = this.rand.nextInt(3 + looting);
      for (let i = 0; i < n; i++) this.dropItem(ItemIds.arrow, 1);
    }
    const bones = this.rand.nextInt(3 + looting);
    for (let i = 0; i < bones; i++) this.dropItem(ItemIds.bone, 1);
  }

  /** Wither skeleton skull. */
  protected override dropRareDrop(_kind: number): void {
    if (this.getSkeletonType() === 1) this.entityDropItem(new ItemStack(ItemIds.skull, 1, 1), 0);
  }

  protected override addRandomArmor(): void {
    super.addRandomArmor();
    this.setCurrentItemOrArmor(0, new ItemStack(ItemIds.bow, 1, 0));
  }

  override getTexture(): string {
    return this.getSkeletonType() === 1 ? '/mob/skeleton_wither.png' : '/mob/skeleton.png';
  }

  override initCreature(): void {
    if (this.worldObj.provider.isHellWorld && this.getRNG().nextInt(5) > 0) {
      this.tasks.addTask(4, this.aiAttackOnCollide);
      this.setSkeletonType(1);
      this.setCurrentItemOrArmor(0, new ItemStack(ItemIds.swordStone, 1, 0));
    } else {
      this.tasks.addTask(4, this.aiArrowAttack);
      this.addRandomArmor();
      this.enchantEquipment();
    }
    this.setCanPickUpLoot(this.rand.nextFloat() < EntityLiving.pickUpLootProbability[this.worldObj.difficultySetting]);
    maybeHalloweenHelmet(this, this.rand, this.equipmentDropChances);
  }

  /** Bow in hand: ranged attack; anything else: melee. */
  setCombatTask(): void {
    this.tasks.removeTask(this.aiAttackOnCollide);
    this.tasks.removeTask(this.aiArrowAttack);
    const held = this.getHeldItem();
    this.tasks.addTask(4, held && held.itemID === ItemIds.bow ? this.aiArrowAttack : this.aiAttackOnCollide);
  }

  /**
   * An arrow at 1.6 speed with 14 - 4 x difficulty inaccuracy; damage 2 x strength plus noise
   * and difficulty, raised by Power, Punch knockback, set alight by Flame or a wither skeleton.
   */
  attackEntityWithRangedAttack(target: EntityLiving, strength: number): void {
    const arrow = new EntityArrow(this.worldObj, this, target, f(1.6), 14 - this.worldObj.difficultySetting * 4);
    const held = this.getHeldItem();
    const power = EnchantmentHelper.getEnchantmentLevel(POWER, held);
    const punch = EnchantmentHelper.getEnchantmentLevel(PUNCH, held);
    arrow.setDamage(f(strength * 2) + this.rand.nextGaussian() * 0.25 + f(this.worldObj.difficultySetting * f(0.11)));
    if (power > 0) arrow.setDamage(arrow.getDamage() + power * 0.5 + 0.5);
    if (punch > 0) arrow.setKnockbackStrength(punch);
    if (EnchantmentHelper.getEnchantmentLevel(FLAME, held) > 0 || this.getSkeletonType() === 1) arrow.setFire(100);
    this.playSound('random.bow', 1, f(1 / f(f(this.getRNG().nextFloat() * f(0.4)) + f(0.8))));
    this.worldObj.spawnEntityInWorld(arrow);
  }

  getSkeletonType(): number {
    return this.skeletonType;
  }

  setSkeletonType(type: number): void {
    this.skeletonType = type;
    this.isImmuneToFire_ = type === 1;
    if (type === 1) this.setSize(f(0.72), f(2.34));
    else this.setSize(f(0.6), f(1.8));
  }

  readEntityFromNBT(tag: Record<string, unknown>): void {
    const t = tagNumber(tag, 'SkeletonType');
    if (t !== undefined) this.setSkeletonType(t);
    this.setCombatTask();
  }

  writeEntityToNBT(tag: Record<string, unknown>): void {
    tag.SkeletonType = this.getSkeletonType();
  }

  override setCurrentItemOrArmor(slot: number, stack: ItemStack | null): void {
    super.setCurrentItemOrArmor(slot, stack);
    if (slot === 0 && this.aiArrowAttack) this.setCombatTask();
  }
}
