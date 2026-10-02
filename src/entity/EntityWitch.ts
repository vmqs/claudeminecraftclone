import { ItemIds } from '../block/BlockIds';
import { MathHelper } from '../core/MathHelper';
import { ItemStack } from '../item/ItemStack';
import { PotionEffect } from '../potion/PotionEffect';
import type { World } from '../world/World';
import { EntityAIArrowAttack } from './ai/EntityAIArrowAttack';
import { EntityAIHurtByTarget } from './ai/EntityAIHurtByTarget';
import { EntityAILookIdle } from './ai/EntityAILookIdle';
import { EntityAINearestAttackableTarget } from './ai/EntityAINearestAttackableTarget';
import { EntityAISwimming } from './ai/EntityAISwimming';
import { EntityAIWander } from './ai/EntityAIWander';
import { EntityAIWatchClosest } from './ai/EntityAIWatchClosest';
import type { IRangedAttackMob } from './ai/IRangedAttackMob';
import type { DamageSource } from './DamageSource';
import type { EntityLiving } from './EntityLiving';
import { EntityMob } from './EntityMob';
import { EntityPotion } from './EntityPotion';
import { PotionHooks, PotionId, type PotionEffectLike } from './PotionEffects';

const f = Math.fround;

/** Loot table (EntityWitch.witchDrops): sticks twice as likely. */
const WITCH_DROPS = [
  ItemIds.lightStoneDust,
  ItemIds.sugar,
  ItemIds.redstone,
  ItemIds.spiderEye,
  ItemIds.glassBottle,
  ItemIds.gunpowder,
  ItemIds.stick,
  ItemIds.stick,
];

/** Drinkable potions the witch picks (damage values): fire resistance, healing, swiftness. */
const DRINK_FIRE_RESISTANCE = 16307;
const DRINK_HEALING = 16341;
const DRINK_SWIFTNESS = 16274;
/** Splash potions she throws: harming (default), slowness, poison, weakness. */
const SPLASH_HARMING = 32732;
const SPLASH_SLOWNESS = 32698;
const SPLASH_POISON = 32660;
const SPLASH_WEAKNESS = 32696;

/**
 * A witch (EntityWitch): throws splash potions at the players she may target (harming;
 * slowness from 8 blocks on, poison at 8+ health, sometimes weakness up close), drinks fire
 * resistance when burning, healing when hurt and swiftness to chase (walking 25% slower while
 * drinking), takes 15% of magic damage and none from her own potions, and sparkles now and then.
 */
export class EntityWitch extends EntityMob implements IRangedAttackMob {
  private witchAttackTimer = 0;
  /** DataWatcher 21: drinking. */
  private aggressive = false;

  constructor(world: World) {
    super(world);
    this.texture = '/mob/villager/witch.png';
    this.moveSpeed = f(0.25);
    this.tasks.addTask(1, new EntityAISwimming(this));
    this.tasks.addTask(2, new EntityAIArrowAttack(this, this.moveSpeed, 60, 60, 10));
    this.tasks.addTask(2, new EntityAIWander(this, this.moveSpeed));
    this.tasks.addTask(3, new EntityAIWatchClosest(this, 'player', 8));
    this.tasks.addTask(3, new EntityAILookIdle(this));
    this.targetTasks.addTask(1, new EntityAIHurtByTarget(this, false));
    this.targetTasks.addTask(2, new EntityAINearestAttackableTarget(this, 'player', 16, 0, true));
  }

  protected override getLivingSound(): string | null {
    return 'mob.witch.idle';
  }

  protected override getHurtSound(): string | null {
    return 'mob.witch.hurt';
  }

  protected override getDeathSound(): string | null {
    return 'mob.witch.death';
  }

  setAggressive(v: boolean): void {
    this.aggressive = v;
  }

  getAggressive(): boolean {
    return this.aggressive;
  }

  getMaxHealth(): number {
    return 26;
  }

  protected override isAIEnabled(): boolean {
    return true;
  }

  override onLivingUpdate(): void {
    if (this.getAggressive()) {
      if (this.witchAttackTimer-- <= 0) {
        this.setAggressive(false);
        const held = this.getHeldItem();
        this.setCurrentItemOrArmor(0, null);
        if (held && held.itemID === ItemIds.potion) {
          const effects = PotionHooks.effectsOf?.(held) ?? null;
          if (effects) for (const e of effects) this.addPotionEffect(PotionEffect.copyOf(e as unknown as PotionEffect) as unknown as PotionEffectLike);
        }
      }
    } else {
      let potion = -1;
      const t = this.getAttackTarget();
      if (this.rand.nextFloat() < f(0.15) && this.isBurning() && !this.isPotionActive(PotionId.fireResistance)) potion = DRINK_FIRE_RESISTANCE;
      else if (this.rand.nextFloat() < f(0.05) && this.health < this.getMaxHealth()) potion = DRINK_HEALING;
      else if (this.rand.nextFloat() < f(0.25) && t && !this.isPotionActive(PotionId.moveSpeed) && t.getDistanceSqToEntity(this) > 121) potion = DRINK_SWIFTNESS;
      else if (this.rand.nextFloat() < f(0.25) && t && !this.isPotionActive(PotionId.moveSpeed) && t.getDistanceSqToEntity(this) > 121) potion = DRINK_SWIFTNESS;
      if (potion > -1) {
        this.setCurrentItemOrArmor(0, new ItemStack(ItemIds.potion, 1, potion));
        this.witchAttackTimer = this.getHeldItem()!.getMaxItemUseDuration();
        this.setAggressive(true);
      }
    }
    if (this.rand.nextFloat() < f(7.5e-4)) this.worldObj.setEntityState(this, 15);
    super.onLivingUpdate();
  }

  override handleHealthUpdate(status: number): void {
    if (status === 15) {
      // The bound is rolled again on every pass, as in the original loop condition.
      for (let i = 0; i < this.rand.nextInt(35) + 10; i++) {
        this.worldObj.spawnParticle(
          'witchMagic',
          this.posX + this.rand.nextGaussian() * f(0.13),
          this.boundingBox.maxY + 0.5 + this.rand.nextGaussian() * f(0.13),
          this.posZ + this.rand.nextGaussian() * f(0.13),
          0,
          0,
          0,
        );
      }
    } else {
      super.handleHealthUpdate(status);
    }
  }

  protected override applyPotionDamageCalculations(src: DamageSource, amount: number): number {
    amount = super.applyPotionDamageCalculations(src, amount);
    if (src.getEntity() === this) amount = 0;
    if (src.isMagicDamage()) amount = Math.trunc(amount * 0.15);
    return amount;
  }

  override getSpeedModifier(): number {
    let k = super.getSpeedModifier();
    if (this.getAggressive()) k = f(k * f(0.75));
    return k;
  }

  /** 1-3 picks from the loot table, 0-2 of each (more with looting). */
  protected override dropFewItems(_recentlyHit: boolean, looting: number): void {
    const picks = this.rand.nextInt(3) + 1;
    for (let i = 0; i < picks; i++) {
      let n = this.rand.nextInt(3);
      const id = WITCH_DROPS[this.rand.nextInt(WITCH_DROPS.length)];
      if (looting > 0) n += this.rand.nextInt(looting + 1);
      for (let j = 0; j < n; j++) this.dropItem(id, 1);
    }
  }

  /** Throws a splash potion leading the target (not while drinking). */
  attackEntityWithRangedAttack(target: EntityLiving, _strength: number): void {
    if (this.getAggressive()) return;
    const potion = new EntityPotion(this.worldObj, this, SPLASH_HARMING);
    potion.rotationPitch -= -20;
    const dx = target.posX + target.motionX - this.posX;
    const dy = target.posY + target.getEyeHeight() - f(1.1) - this.posY;
    const dz = target.posZ + target.motionZ - this.posZ;
    const dist = MathHelper.sqrt_double(dx * dx + dz * dz);
    if (dist >= 8 && !target.isPotionActive(PotionId.moveSlowdown)) potion.setPotionDamage(SPLASH_SLOWNESS);
    else if (target.getHealth() >= 8 && !target.isPotionActive(PotionId.poison)) potion.setPotionDamage(SPLASH_POISON);
    else if (dist <= 3 && !target.isPotionActive(PotionId.weakness) && this.rand.nextFloat() < f(0.25)) potion.setPotionDamage(SPLASH_WEAKNESS);
    potion.setThrowableHeading(dx, dy + f(dist * f(0.2)), dz, f(0.75), 8);
    this.worldObj.spawnEntityInWorld(potion);
  }
}
