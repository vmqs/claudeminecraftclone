import { Block } from '../block/Block';
import { BlockIds } from '../block/BlockIds';
import { Material } from '../block/Material';
import { MathHelper } from '../core/MathHelper';
import type { MovingObjectPosition } from '../core/MovingObjectPosition';
import { Vec3 } from '../core/Vec3';
import type { JavaRandom } from '../core/JavaRandom';
import { ItemStack } from '../item/ItemStack';
import type { World } from '../world/World';
import { EntityAITasks } from './ai/EntityAITasks';
import { EntityBodyHelper } from './ai/EntityBodyHelper';
import { EntityJumpHelper } from './ai/EntityJumpHelper';
import { EntityLookHelper } from './ai/EntityLookHelper';
import { EntityMoveHelper } from './ai/EntityMoveHelper';
import { EntitySenses } from './ai/EntitySenses';
import { PathNavigate } from './ai/PathNavigate';
import { DamageSource } from './DamageSource';
import { EnchantmentHooks } from './EnchantmentHooks';
import { armorPoints } from './InventoryPlayer';
import { Entity } from './Entity';
import { EntityList } from './EntityList';
import type { EntityPlayer } from './EntityPlayer';
import { areAllPotionsAmbient, calcPotionLiquidColor, PotionId, type PotionEffectLike } from './PotionEffects';
import type { TagCompound } from '../item/ItemStack';
import { NBT, NBTType } from '../world/storage/NBT';
import { PotionEffect } from '../potion/PotionEffect';

const f = Math.fround;
const DEG = f(Math.PI / 180);
const PI_F = f(Math.PI);

/** Creature type for damage enchantments (EnumCreatureAttribute). */
export enum EnumCreatureAttribute {
  UNDEFINED,
  UNDEAD,
  ARTHROPOD,
}

/** A block position (ChunkCoordinates), used for AI home areas. */
export class ChunkCoordinates {
  constructor(
    public posX = 0,
    public posY = 0,
    public posZ = 0,
  ) {}

  set(x: number, y: number, z: number): void {
    this.posX = x;
    this.posY = y;
    this.posZ = z;
  }

  getDistanceSquared(x: number, y: number, z: number): number {
    const dx = this.posX - x;
    const dy = this.posY - y;
    const dz = this.posZ - z;
    return f(dx * dx + dy * dy + dz * dz);
  }
}

/** Spawns experience orbs (installed by EntityXPOrb; null = no orbs). */
export type ExperienceOrbFactory = (w: World, x: number, y: number, z: number, value: number) => Entity | null;

/** Difficulty-indexed chances (peaceful, easy, normal, hard). */
const ENCHANTMENT_PROBABILITY = [0, 0, f(0.1), f(0.2)];
const ARMOR_ENCHANTMENT_PROBABILITY = [0, 0, f(0.25), f(0.5)];
const ARMOR_PROBABILITY = [0, 0, f(0.05), f(0.07)];

/** Sword item IDs -> material damage (ItemSword.func_82803_g), for mobs comparing swords they find. */
const SWORD_MATERIAL_DAMAGE = new Map<number, number>([
  [268, 0],
  [272, 1],
  [267, 2],
  [276, 3],
  [283, 0],
]);

/** Armour item IDs by slot (1 boots .. 4 helmet) and tier (leather, gold, chain, iron, diamond). */
const ARMOR_BY_SLOT: Record<number, readonly number[]> = {
  4: [298, 314, 302, 306, 310],
  3: [299, 315, 303, 307, 311],
  2: [300, 316, 304, 308, 312],
  1: [301, 317, 305, 309, 313],
};

/**
 * Everything that lives (EntityLiving): health and hurt/death timers with the original's damage
 * rules and knockback, hurt/death/living sounds, drops, equipment, despawning, the "old AI"
 * wander/look behaviour, and the AI-task path for mobs that override isAIEnabled() (tasks,
 * target tasks, navigator, look/move/jump/body helpers, senses).
 */
export abstract class EntityLiving extends Entity {
  static experienceOrbFactory: ExperienceOrbFactory | null = null;
  /**
   * The client's half of an item pickup (NetClientHandler.handleCollect: the pop or orb sound
   * and the EntityPickupFX flying to the collector); installed by the renderer side.
   */
  static collectEffect: ((item: Entity, collector: EntityLiving) => void) | null = null;
  /** Chance per difficulty that a mob may pick up loot (pickUpLootProability). */
  static readonly pickUpLootProbability = [0, f(0.1), f(0.15), f(0.45)];

  maxHurtResistantTime = 20;
  renderYawOffset = 0;
  prevRenderYawOffset = 0;
  rotationYawHead = 0;
  prevRotationYawHead = 0;
  /** field_70768_au / field_70766_av: smoothed on-ground walking factor. */
  prevOnGroundSpeedFactor = 0;
  onGroundSpeedFactor = 0;
  /** field_70763_ax / field_70764_aw: accumulated body movement. */
  prevMovedDistance = 0;
  movedDistance = 0;
  protected texture = '/mob/char.png';
  /** Experience dropped on death when recently hit by a player. */
  protected experienceValue = 0;
  protected scoreValue = 0;
  landMovementFactor = f(0.1);
  jumpMovementFactor = f(0.02);
  prevSwingProgress = 0;
  swingProgress = 0;
  protected health: number;
  prevHealth = 0;
  /** Damage left over by the armour/potion rounding (carryoverDamage). */
  protected carryoverDamage = 0;
  livingSoundTime = 0;
  hurtTime = 0;
  maxHurtTime = 0;
  attackedAtYaw = 0;
  deathTime = 0;
  attackTime = 0;
  prevCameraPitch = 0;
  cameraPitch = 0;
  /** Set once onDeath ran. */
  protected dead = false;
  prevLimbYaw = 0;
  limbYaw = 0;
  limbSwing = 0;
  /** The player that hit this recently (drops XP and rare loot), and for how long. */
  protected attackingPlayer: EntityPlayer | null = null;
  protected recentlyHit = 0;
  private entityLivingToAttack: EntityLiving | null = null;
  private revengeTimer = 0;
  private lastAttackingEntity: EntityLiving | null = null;
  arrowHitTimer = 0;
  private arrowCount = 0;
  private attackTarget: EntityLiving | null = null;
  private AIMoveSpeed = 0;
  private readonly homePosition = new ChunkCoordinates();
  private maximumHomeDistance = -1;
  /** 0 = held item, 1-4 = boots, leggings, chestplate, helmet. */
  private readonly equipment: (ItemStack | null)[] = [null, null, null, null, null];
  protected readonly equipmentDropChances: number[] = [f(0.085), f(0.085), f(0.085), f(0.085), f(0.085)];
  isSwingInProgress = false;
  swingProgressInt = 0;
  private canPickUpLootFlag = false;
  protected persistenceRequired = false;
  protected newPosRotationIncrements = 0;
  protected lastDamage = 0;
  protected entityAge = 0;
  protected moveStrafing = 0;
  protected moveForward = 0;
  protected randomYawVelocity = 0;
  protected isJumping = false;
  protected defaultPitch = 0;
  /** Walking speed of the old AI (moveSpeed). */
  protected moveSpeed = f(0.7);
  private jumpTicks = 0;
  private currentTarget: Entity | null = null;
  protected numTicksToChaseTarget = 0;
  /** Custom name from a name tag or a named spawn egg ("" = none). */
  private customName = '';
  private alwaysRenderNameTag = false;
  protected readonly tasks = new EntityAITasks();
  protected readonly targetTasks = new EntityAITasks();
  private readonly lookHelper: EntityLookHelper;
  private readonly moveHelper: EntityMoveHelper;
  private readonly jumpHelper: EntityJumpHelper;
  private readonly bodyHelper: EntityBodyHelper;
  private readonly navigator: PathNavigate;
  private readonly senses: EntitySenses;
  /** Active potion effects by potion ID (activePotionsMap). */
  protected readonly activePotionsMap = new Map<number, PotionEffectLike>();
  private potionsNeedUpdate = true;
  /** DataWatcher 8 and 9: the swirl colour of the active effects (0 = none) and whether all are ambient. */
  private potionSwirlColor = 0;
  private potionSwirlAmbient = false;

  constructor(world: World) {
    super(world);
    this.health = this.getMaxHealth();
    this.preventEntitySpawning = true;
    this.lookHelper = new EntityLookHelper(this);
    this.moveHelper = new EntityMoveHelper(this);
    this.jumpHelper = new EntityJumpHelper(this);
    this.bodyHelper = new EntityBodyHelper(this);
    this.navigator = new PathNavigate(this, world, this.getPathSearchRange());
    this.senses = new EntitySenses(this);
    this.setPosition(this.posX, this.posY, this.posZ);
    this.rotationYaw = f(Math.random() * Math.PI * 2);
    this.rotationYawHead = this.rotationYaw;
    this.stepHeight = 0.5;
  }

  override get isLivingEntity(): boolean {
    return true;
  }

  abstract getMaxHealth(): number;

  protected entityInit(): void {}

  /** func_96121_ay: how far the navigator searches. */
  protected getPathSearchRange(): number {
    return 16;
  }

  // ------------------------------------------------------------------ AI accessors

  getLookHelper(): EntityLookHelper {
    return this.lookHelper;
  }
  getMoveHelper(): EntityMoveHelper {
    return this.moveHelper;
  }
  getJumpHelper(): EntityJumpHelper {
    return this.jumpHelper;
  }
  getNavigator(): PathNavigate {
    return this.navigator;
  }
  getEntitySenses(): EntitySenses {
    return this.senses;
  }
  getRNG() {
    return this.rand;
  }

  /** The entity that hurt this one, for revenge (100 ticks). */
  getAITarget(): EntityLiving | null {
    return this.entityLivingToAttack;
  }

  setRevengeTarget(e: EntityLiving | null): void {
    this.entityLivingToAttack = e;
    this.revengeTimer = e ? 100 : 0;
  }

  /** func_94060_bK: who gets the blame in death messages (the attacking player, else the revenge target). */
  getLastAttacker(): EntityLiving | null {
    return this.attackingPlayer ?? this.entityLivingToAttack ?? null;
  }

  getLastAttackingEntity(): EntityLiving | null {
    return this.lastAttackingEntity;
  }

  setLastAttackingEntity(e: Entity): void {
    if (e.isLivingEntity) this.lastAttackingEntity = e as EntityLiving;
  }

  getAge(): number {
    return this.entityAge;
  }

  getAIMoveSpeed(): number {
    return this.AIMoveSpeed;
  }

  setAIMoveSpeed(v: number): void {
    this.AIMoveSpeed = v;
    this.setMoveForward(v);
  }

  /** Melee hit by this mob (EntityMob overrides with damage). */
  attackEntityAsMob(e: Entity): boolean {
    this.setLastAttackingEntity(e);
    return false;
  }

  getAttackTarget(): EntityLiving | null {
    return this.attackTarget;
  }

  setAttackTarget(e: EntityLiving | null): void {
    this.attackTarget = e;
  }

  /** Whether this mob may target entities of that kind (not creepers or ghasts by default). */
  canAttackClass(name: string | null): boolean {
    return name !== 'Creeper' && name !== 'Ghast';
  }

  /** Sheep regrowing wool after eating grass. */
  eatGrassBonus(): void {}

  isWithinHomeDistanceCurrentPosition(): boolean {
    return this.isWithinHomeDistance(MathHelper.floor_double(this.posX), MathHelper.floor_double(this.posY), MathHelper.floor_double(this.posZ));
  }

  isWithinHomeDistance(x: number, y: number, z: number): boolean {
    return this.maximumHomeDistance === -1 || this.homePosition.getDistanceSquared(x, y, z) < this.maximumHomeDistance * this.maximumHomeDistance;
  }

  setHomeArea(x: number, y: number, z: number, radius: number): void {
    this.homePosition.set(x, y, z);
    this.maximumHomeDistance = radius;
  }

  getHomePosition(): ChunkCoordinates {
    return this.homePosition;
  }

  getMaximumHomeDistance(): number {
    return this.maximumHomeDistance;
  }

  detachHome(): void {
    this.maximumHomeDistance = -1;
  }

  hasHome(): boolean {
    return this.maximumHomeDistance !== -1;
  }

  // ------------------------------------------------------------------ health

  getHealth(): number {
    return this.health;
  }

  setEntityHealth(h: number): void {
    this.health = Math.min(h, this.getMaxHealth());
  }

  heal(n: number): void {
    if (this.health <= 0) return;
    this.setEntityHealth(this.health + n);
    this.hurtResistantTime = Math.trunc(this.maxHurtResistantTime / 2);
  }

  override isEntityAlive(): boolean {
    return !this.isDead && this.health > 0;
  }

  override getEyeHeight(): number {
    return f(this.height * f(0.85));
  }

  override canBeCollidedWith(): boolean {
    return !this.isDead;
  }

  override canBePushed(): boolean {
    return !this.isDead;
  }

  override getRotationYawHead(): number {
    return this.rotationYawHead;
  }

  override setRotationYawHead(v: number): void {
    this.rotationYawHead = v;
  }

  override getTexture(): string {
    return this.texture;
  }

  getTextureName(): string {
    return this.texture;
  }

  /** Whether a straight line from eye to eye is free of blocks. */
  canEntityBeSeen(e: Entity): boolean {
    const from = new Vec3(this.posX, this.posY + this.getEyeHeight(), this.posZ);
    const to = new Vec3(e.posX, e.posY + e.getEyeHeight(), e.posZ);
    return this.worldObj.rayTraceBlocks(from, to) === null;
  }

  // ------------------------------------------------------------------ sounds

  /** Ticks between ambient sounds, on average (getTalkInterval). */
  getTalkInterval(): number {
    return 80;
  }

  playLivingSound(): void {
    const s = this.getLivingSound();
    if (s !== null) this.playSound(s, this.getSoundVolume(), this.getSoundPitch());
  }

  protected getLivingSound(): string | null {
    return null;
  }

  protected getHurtSound(): string | null {
    return 'damage.hit';
  }

  protected getDeathSound(): string | null {
    return 'damage.hit';
  }

  protected getSoundVolume(): number {
    return 1;
  }

  /** Random pitch around 1 (1.5 for children). */
  protected getSoundPitch(): number {
    const r = f(f(this.rand.nextFloat() - this.rand.nextFloat()) * f(0.2));
    return this.isChild() ? f(r + f(1.5)) : f(r + 1);
  }

  override playSound(name: string | null, volume: number, pitch: number): void {
    if (name !== null) super.playSound(name, volume, pitch);
  }

  // ------------------------------------------------------------------ update

  protected override updateFallState(dy: number, onGround: boolean): void {
    if (!this.isInWater()) this.handleWaterMovement();
    if (onGround && this.fallDistance > 0) {
      const x = MathHelper.floor_double(this.posX);
      const y = MathHelper.floor_double(this.posY - f(0.2) - this.yOffset);
      const z = MathHelper.floor_double(this.posZ);
      let id = this.worldObj.getBlockId(x, y, z);
      if (id === 0) {
        const rt = this.worldObj.blockGetRenderType(x, y - 1, z);
        if (rt === 11 || rt === 32 || rt === 21) id = this.worldObj.getBlockId(x, y - 1, z);
      }
      if (id > 0) Block.blocksList[id]?.onFallenUpon(this.worldObj, x, y, z, this, this.fallDistance);
    }
    super.updateFallState(dy, onGround);
  }

  override onEntityUpdate(): void {
    this.prevSwingProgress = this.swingProgress;
    super.onEntityUpdate();
    if (this.isEntityAlive() && this.rand.nextInt(1000) < this.livingSoundTime++) {
      this.livingSoundTime = -this.getTalkInterval();
      this.playLivingSound();
    }
    if (this.isEntityAlive() && this.isEntityInsideOpaqueBlock()) this.attackEntityFrom(DamageSource.inWall, 1);
    if (this.isImmuneToFire()) this.extinguish();
    if (
      this.isEntityAlive() &&
      this.isInsideOfMaterial(Material.water) &&
      !this.canBreatheUnderwater() &&
      !this.activePotionsMap.has(PotionId.waterBreathing) &&
      !this.isDamageDisabled()
    ) {
      this.setAir(this.decreaseAirSupply(this.getAir()));
      if (this.getAir() === -20) {
        this.setAir(0);
        for (let i = 0; i < 8; i++) {
          const dx = this.rand.nextFloat() - this.rand.nextFloat();
          const dy = this.rand.nextFloat() - this.rand.nextFloat();
          const dz = this.rand.nextFloat() - this.rand.nextFloat();
          this.worldObj.spawnParticle('bubble', this.posX + dx, this.posY + dy, this.posZ + dz, this.motionX, this.motionY, this.motionZ);
        }
        this.attackEntityFrom(DamageSource.drown, 2);
      }
      this.extinguish();
    } else {
      this.setAir(300);
    }
    this.prevCameraPitch = this.cameraPitch;
    if (this.attackTime > 0) this.attackTime--;
    if (this.hurtTime > 0) this.hurtTime--;
    if (this.hurtResistantTime > 0) this.hurtResistantTime--;
    if (this.health <= 0) this.onDeathUpdate();
    if (this.recentlyHit > 0) this.recentlyHit--;
    else this.attackingPlayer = null;
    if (this.lastAttackingEntity && !this.lastAttackingEntity.isEntityAlive()) this.lastAttackingEntity = null;
    if (this.entityLivingToAttack) {
      if (!this.entityLivingToAttack.isEntityAlive()) this.setRevengeTarget(null);
      else if (this.revengeTimer > 0) this.revengeTimer--;
      else this.setRevengeTarget(null);
    }
    this.updatePotionEffects();
    this.prevMovedDistance = this.movedDistance;
    this.prevRenderYawOffset = this.renderYawOffset;
    this.prevRotationYawHead = this.rotationYawHead;
    this.prevRotationYaw = this.rotationYaw;
    this.prevRotationPitch = this.rotationPitch;
  }

  /** Players with disableDamage do not drown. */
  protected isDamageDisabled(): boolean {
    return false;
  }

  /** Death animation: after 20 ticks drop experience, vanish and puff 20 explosion particles. */
  protected onDeathUpdate(): void {
    this.deathTime++;
    if (this.deathTime !== 20) return;
    if ((this.recentlyHit > 0 || this.isPlayer()) && !this.isChild() && this.worldObj.worldInfo.gameRules.doMobLoot) {
      let xp = this.getExperiencePoints(this.attackingPlayer);
      while (xp > 0) {
        const split = getXPSplit(xp);
        xp -= split;
        const orb = EntityLiving.experienceOrbFactory?.(this.worldObj, this.posX, this.posY, this.posZ, split);
        if (orb) this.worldObj.spawnEntityInWorld(orb);
      }
    }
    this.setDead();
    for (let i = 0; i < 20; i++) {
      const vx = this.rand.nextGaussian() * 0.02;
      const vy = this.rand.nextGaussian() * 0.02;
      const vz = this.rand.nextGaussian() * 0.02;
      this.worldObj.spawnParticle(
        'explode',
        this.posX + f(this.rand.nextFloat() * this.width * 2) - this.width,
        this.posY + f(this.rand.nextFloat() * this.height),
        this.posZ + f(this.rand.nextFloat() * this.width * 2) - this.width,
        vx,
        vy,
        vz,
      );
    }
  }

  /** One less air per tick; respiration may skip the tick (1 - 1/(level+1) chance). */
  protected decreaseAirSupply(air: number): number {
    const respiration = EnchantmentHooks.respiration?.(this) ?? 0;
    return respiration > 0 && this.rand.nextInt(respiration + 1) > 0 ? air : air - 1;
  }

  protected getExperiencePoints(_player: EntityPlayer | null): number {
    if (this.experienceValue <= 0) return this.experienceValue;
    let xp = this.experienceValue;
    for (let i = 0; i < this.equipment.length; i++) if (this.equipment[i] && this.equipmentDropChances[i] <= 1) xp += 1 + this.rand.nextInt(3);
    return xp;
  }

  protected isPlayer(): boolean {
    return false;
  }

  /** The puff of a spawner or a spawn egg. */
  spawnExplosionParticle(): void {
    for (let i = 0; i < 20; i++) {
      const vx = this.rand.nextGaussian() * 0.02;
      const vy = this.rand.nextGaussian() * 0.02;
      const vz = this.rand.nextGaussian() * 0.02;
      const k = 10;
      this.worldObj.spawnParticle(
        'explode',
        this.posX + f(this.rand.nextFloat() * this.width * 2) - this.width - vx * k,
        this.posY + f(this.rand.nextFloat() * this.height) - vy * k,
        this.posZ + f(this.rand.nextFloat() * this.width * 2) - this.width - vz * k,
        vx,
        vy,
        vz,
      );
    }
  }

  canBreatheUnderwater(): boolean {
    return false;
  }

  override updateRidden(): void {
    super.updateRidden();
    this.prevOnGroundSpeedFactor = this.onGroundSpeedFactor;
    this.onGroundSpeedFactor = 0;
    this.fallDistance = 0;
  }

  override onUpdate(): void {
    super.onUpdate();
    const arrows = this.getArrowCountInEntity();
    if (arrows > 0) {
      if (this.arrowHitTimer <= 0) this.arrowHitTimer = 20 * (30 - arrows);
      this.arrowHitTimer--;
      if (this.arrowHitTimer <= 0) this.setArrowCountInEntity(arrows - 1);
    }
    this.onLivingUpdate();
    this.updateBodyRotation();
  }

  /**
   * The end of EntityLiving.onUpdate: the body turns towards the way it walks (or the body helper
   * of AI mobs follows the head), and the walked distance grows. A guest's copies run it too.
   */
  updateBodyRotation(): void {
    const dx = this.posX - this.prevPosX;
    const dz = this.posZ - this.prevPosZ;
    const distSq = f(dx * dx + dz * dz);
    let bodyYaw = this.renderYawOffset;
    let walk = 0;
    this.prevOnGroundSpeedFactor = this.onGroundSpeedFactor;
    let onGroundTarget = 0;
    if (!(distSq <= f(0.0025000002))) {
      onGroundTarget = 1;
      walk = f(f(Math.sqrt(distSq)) * 3);
      bodyYaw = f(f(f(Math.atan2(dz, dx)) * 180) / PI_F - 90);
    }
    if (this.swingProgress > 0) bodyYaw = this.rotationYaw;
    if (!this.onGround) onGroundTarget = 0;
    this.onGroundSpeedFactor = f(this.onGroundSpeedFactor + (onGroundTarget - this.onGroundSpeedFactor) * f(0.3));
    if (this.isAIEnabled()) {
      this.bodyHelper.updateRenderAngles();
    } else {
      const d1 = MathHelper.wrapAngleTo180_float(bodyYaw - this.renderYawOffset);
      this.renderYawOffset = f(this.renderYawOffset + d1 * f(0.3));
      let d2 = MathHelper.wrapAngleTo180_float(this.rotationYaw - this.renderYawOffset);
      const backwards = d2 < -90 || d2 >= 90;
      if (d2 < -75) d2 = -75;
      if (d2 >= 75) d2 = 75;
      this.renderYawOffset = f(this.rotationYaw - d2);
      if (d2 * d2 > 2500) this.renderYawOffset = f(this.renderYawOffset + d2 * f(0.2));
      if (backwards) walk *= -1;
    }
    while (this.rotationYaw - this.prevRotationYaw < -180) this.prevRotationYaw -= 360;
    while (this.rotationYaw - this.prevRotationYaw >= 180) this.prevRotationYaw += 360;
    while (this.renderYawOffset - this.prevRenderYawOffset < -180) this.prevRenderYawOffset -= 360;
    while (this.renderYawOffset - this.prevRenderYawOffset >= 180) this.prevRenderYawOffset += 360;
    while (this.rotationPitch - this.prevRotationPitch < -180) this.prevRotationPitch -= 360;
    while (this.rotationPitch - this.prevRotationPitch >= 180) this.prevRotationPitch += 360;
    while (this.rotationYawHead - this.prevRotationYawHead < -180) this.prevRotationYawHead -= 360;
    while (this.rotationYawHead - this.prevRotationYawHead >= 180) this.prevRotationYawHead += 360;
    this.movedDistance = f(this.movedDistance + walk);
  }

  // ------------------------------------------------------------------ damage

  /**
   * Damage with hurt-resistance frames (only the excess over the last hit counts while
   * resistant), revenge and player-kill bookkeeping, knockback away from the attacker, and the
   * hurt or death sound.
   */
  override attackEntityFrom(src: DamageSource, amount: number): boolean {
    if (this.isEntityInvulnerable()) return false;
    this.entityAge = 0;
    if (this.health <= 0) return false;
    if (src.isFireDamage() && this.isPotionActive(PotionId.fireResistance)) return false;
    const helmet = this.getCurrentItemOrArmor(4);
    if ((src === DamageSource.anvil || src === DamageSource.fallingBlock) && helmet) {
      helmet.damageItem(amount * 4 + this.rand.nextInt(amount * 2), this);
      amount = Math.trunc(f(amount * f(0.75)));
    }
    this.limbYaw = f(1.5);
    let fresh = true;
    if (f(this.hurtResistantTime) > f(this.maxHurtResistantTime / 2)) {
      if (amount <= this.lastDamage) return false;
      this.damageEntity(src, amount - this.lastDamage);
      this.lastDamage = amount;
      fresh = false;
    } else {
      this.lastDamage = amount;
      this.prevHealth = this.health;
      this.hurtResistantTime = this.maxHurtResistantTime;
      this.damageEntity(src, amount);
      this.hurtTime = this.maxHurtTime = 10;
    }
    this.attackedAtYaw = 0;
    const attacker = src.getEntity();
    if (attacker) {
      if (attacker.isLivingEntity) this.setRevengeTarget(attacker as EntityLiving);
      if (attacker.isPlayerEntity) {
        this.recentlyHit = 100;
        this.attackingPlayer = attacker as EntityPlayer;
      } else if (attacker.isTamedWolf()) {
        this.recentlyHit = 100;
        this.attackingPlayer = null;
      }
    }
    if (fresh) {
      this.worldObj.setEntityState(this, 2);
      if (src !== DamageSource.drown) this.setBeenAttacked();
      if (attacker) {
        let dx = attacker.posX - this.posX;
        let dz = attacker.posZ - this.posZ;
        while (dx * dx + dz * dz < 1.0e-4) {
          dx = (Math.random() - Math.random()) * 0.01;
          dz = (Math.random() - Math.random()) * 0.01;
        }
        this.attackedAtYaw = f(f((Math.atan2(dz, dx) * 180) / PI_F) - this.rotationYaw);
        this.knockBack(attacker, amount, dx, dz);
      } else {
        this.attackedAtYaw = Math.trunc(Math.random() * 2) * 180;
      }
    }
    if (this.health <= 0) {
      if (fresh) this.playSound(this.getDeathSound(), this.getSoundVolume(), this.getSoundPitch());
      this.onDeath(src);
    } else if (fresh) {
      this.playSound(this.getHurtSound(), this.getSoundVolume(), this.getSoundPitch());
    }
    return true;
  }

  override performHurtAnimation(): void {
    this.hurtTime = this.maxHurtTime = 10;
    this.attackedAtYaw = 0;
  }

  /**
   * The client's copy of the entity status packet (World.setEntityState): the hurt animation (2)
   * and the hurt (2) or death (3) sound. attackEntityFrom already played the sound for everyone
   * else, so only a guest's copy plays it, and there only a guest's own player is heard
   * (EntityPlayerSP plays its sounds itself; other copies' world sounds are silent, as on a 1.5.2
   * client, where the server leaves a player out of its own sounds).
   */
  override handleHealthUpdate(status: number): void {
    if (status === 2) {
      this.limbYaw = f(1.5);
      this.hurtResistantTime = this.maxHurtResistantTime;
      this.hurtTime = this.maxHurtTime = 10;
      this.attackedAtYaw = 0;
      if (this.worldObj.isRemote) this.playSound(this.getHurtSound(), this.getSoundVolume(), f(f(f(this.rand.nextFloat() - this.rand.nextFloat()) * f(0.2)) + 1));
    } else if (status === 3) {
      if (this.worldObj.isRemote) this.playSound(this.getDeathSound(), this.getSoundVolume(), f(f(f(this.rand.nextFloat() - this.rand.nextFloat()) * f(0.2)) + 1));
    } else {
      super.handleHealthUpdate(status);
    }
  }

  getTotalArmorValue(): number {
    let total = 0;
    for (const s of this.getLastActiveItems()) if (s) total += armorPoints(s.getItem()) ?? 0;
    return total;
  }

  protected damageArmor(_amount: number): void {}

  /** Armour absorbs 4% per point, carrying the remainder over (applyArmorCalculations). */
  protected applyArmorCalculations(src: DamageSource, amount: number): number {
    if (src.isUnblockableDamage()) return amount;
    const scaled = amount * (25 - this.getTotalArmorValue()) + this.carryoverDamage;
    this.damageArmor(amount);
    this.carryoverDamage = scaled % 25;
    return Math.trunc(scaled / 25);
  }

  /**
   * Resistance (5 armour-like points per level, with the carried-over remainder) and the
   * protection enchantments of the worn armour (getEnchantmentModifierDamage hook).
   */
  protected applyPotionDamageCalculations(src: DamageSource, amount: number): number {
    const res = this.getActivePotionEffect(PotionId.resistance);
    if (res) {
      const scaled = amount * (25 - (res.getAmplifier() + 1) * 5) + this.carryoverDamage;
      amount = Math.trunc(scaled / 25);
      this.carryoverDamage = scaled % 25;
    }
    if (amount <= 0) return 0;
    let prot = this.getEnchantmentModifierDamage(src);
    if (prot > 20) prot = 20;
    if (prot > 0) {
      const scaled = amount * (25 - prot) + this.carryoverDamage;
      amount = Math.trunc(scaled / 25);
      this.carryoverDamage = scaled % 25;
    }
    return amount;
  }

  /** EnchantmentHelper.getEnchantmentModifierDamage over the worn armour (EnchantmentHooks). */
  protected getEnchantmentModifierDamage(src: DamageSource): number {
    return EnchantmentHooks.modifierDamage?.(this, src) ?? 0;
  }

  protected damageEntity(src: DamageSource, amount: number): void {
    if (this.isEntityInvulnerable()) return;
    amount = this.applyArmorCalculations(src, amount);
    amount = this.applyPotionDamageCalculations(src, amount);
    this.health -= amount;
  }

  /** Pushes away from (dx, dz) by 0.4 and up by 0.4 (capped), halving the current motion. */
  knockBack(_attacker: Entity, _amount: number, dx: number, dz: number): void {
    this.isAirBorne = true;
    const d = MathHelper.sqrt_double(dx * dx + dz * dz);
    const k = f(0.4);
    this.motionX /= 2;
    this.motionY /= 2;
    this.motionZ /= 2;
    this.motionX -= (dx / d) * k;
    this.motionY += k;
    this.motionZ -= (dz / d) * k;
    if (this.motionY > k) this.motionY = k;
  }

  /** Drops loot (doMobLoot) and lets the killer know. */
  onDeath(src: DamageSource): void {
    const killer = src.getEntity();
    const credited = this.getLastAttacker();
    if (this.scoreValue >= 0 && credited) credited.addToPlayerScore(this, this.scoreValue);
    if (killer) killer.onKillEntity(this);
    this.dead = true;
    if (!this.isChild() && this.worldObj.worldInfo.gameRules.doMobLoot) {
      const looting = killer?.isPlayerEntity ? this.getLootingModifier(killer as EntityLiving) : 0;
      this.dropFewItems(this.recentlyHit > 0, looting);
      this.dropEquipment(this.recentlyHit > 0, looting);
      if (this.recentlyHit > 0) {
        const r = this.rand.nextInt(200) - looting;
        if (r < 5) this.dropRareDrop(r <= 0 ? 1 : 0);
      }
    }
    this.worldObj.setEntityState(this, 3);
  }

  /** EnchantmentHelper.getLootingModifier of the killer's weapon (EnchantmentHooks). */
  protected getLootingModifier(killer: EntityLiving): number {
    return EnchantmentHooks.looting?.(killer) ?? 0;
  }

  protected dropRareDrop(_kind: number): void {}

  /** 0-2 of getDropItemId() (plus looting). */
  protected dropFewItems(_recentlyHit: boolean, looting: number): void {
    const id = this.getDropItemId();
    if (id <= 0) return;
    let n = this.rand.nextInt(3);
    if (looting > 0) n += this.rand.nextInt(looting + 1);
    for (let i = 0; i < n; i++) this.dropItem(id, 1);
  }

  protected getDropItemId(): number {
    return 0;
  }

  /** Equipment drops: always when picked up (chance > 1), else by chance when hit by a player. */
  protected dropEquipment(recentlyHit: boolean, looting: number): void {
    for (let i = 0; i < this.equipment.length; i++) {
      const s = this.equipment[i];
      const guaranteed = this.equipmentDropChances[i] > 1;
      if (!s || (!recentlyHit && !guaranteed) || !(this.rand.nextFloat() - looting * f(0.01) < this.equipmentDropChances[i])) continue;
      if (!guaranteed && s.isItemStackDamageable()) {
        const max = Math.max(s.getMaxDamage() - 25, 1);
        let dmg = s.getMaxDamage() - this.rand.nextInt(this.rand.nextInt(max) + 1);
        if (dmg > max) dmg = max;
        if (dmg < 1) dmg = 1;
        s.setItemDamage(dmg);
      }
      this.entityDropItem(s, 0);
    }
  }

  protected override fall(dist: number): void {
    super.fall(dist);
    const dmg = MathHelper.ceiling_float_int(dist - 3);
    if (dmg > 0) {
      this.playSound(dmg > 4 ? 'damage.fallbig' : 'damage.fallsmall', 1, 1);
      this.attackEntityFrom(DamageSource.fall, dmg);
      const id = this.worldObj.getBlockId(
        MathHelper.floor_double(this.posX),
        MathHelper.floor_double(this.posY - f(0.2) - this.yOffset),
        MathHelper.floor_double(this.posZ),
      );
      const b = id > 0 ? Block.blocksList[id] : null;
      if (b) this.playSound(b.stepSound.getStepSound(), b.stepSound.getVolume() * 0.5, b.stepSound.getPitch() * 0.75);
    }
  }

  protected override kill(): void {
    this.attackEntityFrom(DamageSource.outOfWorld, 4);
  }

  // ------------------------------------------------------------------ movement

  /** Whether flying physics apply instead of water/lava drag (players only). */
  protected isFlyingPhysics(): boolean {
    return false;
  }

  private groundFriction(): number {
    let slip = f(0.91);
    if (this.onGround) {
      slip = f(0.54600006);
      const id = this.worldObj.getBlockId(MathHelper.floor_double(this.posX), MathHelper.floor_double(this.boundingBox.minY) - 1, MathHelper.floor_double(this.posZ));
      const b = id > 0 ? Block.blocksList[id] : null;
      if (b) slip = f(f(b.slipperiness) * f(0.91));
    }
    return slip;
  }

  /** Integrates input and gravity for one tick (ground, ladder, water, lava). */
  moveEntityWithHeading(strafe: number, forward: number): void {
    const flying = this.isFlyingPhysics();
    if (this.isInWater() && !flying) {
      const y0 = this.posY;
      this.moveFlying(strafe, forward, this.isAIEnabled() ? f(0.04) : f(0.02));
      this.moveEntity(this.motionX, this.motionY, this.motionZ);
      this.motionX *= f(0.8);
      this.motionY *= f(0.8);
      this.motionZ *= f(0.8);
      this.motionY -= 0.02;
      if (this.isCollidedHorizontally && this.isOffsetPositionInLiquid(this.motionX, this.motionY + f(0.6) - this.posY + y0, this.motionZ)) this.motionY = f(0.3);
    } else if (this.handleLavaMovement() && !flying) {
      const y0 = this.posY;
      this.moveFlying(strafe, forward, f(0.02));
      this.moveEntity(this.motionX, this.motionY, this.motionZ);
      this.motionX *= 0.5;
      this.motionY *= 0.5;
      this.motionZ *= 0.5;
      this.motionY -= 0.02;
      if (this.isCollidedHorizontally && this.isOffsetPositionInLiquid(this.motionX, this.motionY + f(0.6) - this.posY + y0, this.motionZ)) this.motionY = f(0.3);
    } else {
      let slip = this.groundFriction();
      const accelScale = f(f(0.16277136) / f(f(slip * slip) * slip));
      let speed: number;
      if (this.onGround) speed = f((this.isAIEnabled() ? this.getAIMoveSpeed() : this.landMovementFactor) * accelScale);
      else speed = this.jumpMovementFactor;
      this.moveFlying(strafe, forward, speed);
      slip = this.groundFriction();
      if (this.isOnLadder()) {
        const lim = f(0.15);
        if (this.motionX < -lim) this.motionX = -lim;
        if (this.motionX > lim) this.motionX = lim;
        if (this.motionZ < -lim) this.motionZ = -lim;
        if (this.motionZ > lim) this.motionZ = lim;
        this.fallDistance = 0;
        if (this.motionY < -0.15) this.motionY = -0.15;
        if (this.isSneaking() && this.isPlayerEntity && this.motionY < 0) this.motionY = 0;
      }
      this.moveEntity(this.motionX, this.motionY, this.motionZ);
      if (this.isCollidedHorizontally && this.isOnLadder()) this.motionY = 0.2;
      // Hover while the chunk below has not arrived yet (WorldClient behaviour).
      if (!this.worldObj.blockExists(Math.trunc(this.posX), 0, Math.trunc(this.posZ))) {
        this.motionY = this.posY > 0 ? -0.1 : 0;
      } else {
        this.motionY -= 0.08;
      }
      this.motionY *= f(0.98);
      this.motionX *= slip;
      this.motionZ *= slip;
    }
    this.updateLimbSwing();
  }

  /** The end of moveEntityWithHeading: the limbs swing with the distance moved this tick. */
  updateLimbSwing(): void {
    this.prevLimbYaw = this.limbYaw;
    const dx = this.posX - this.prevPosX;
    const dz = this.posZ - this.prevPosZ;
    let l = f(MathHelper.sqrt_double(dx * dx + dz * dz) * 4);
    if (l > 1) l = 1;
    this.limbYaw = f(this.limbYaw + (l - this.limbYaw) * f(0.4));
    this.limbSwing = f(this.limbSwing + this.limbYaw);
  }

  isOnLadder(): boolean {
    const id = this.worldObj.getBlockId(
      MathHelper.floor_double(this.posX),
      MathHelper.floor_double(this.boundingBox.minY),
      MathHelper.floor_double(this.posZ),
    );
    return id === BlockIds.ladder || id === BlockIds.vine;
  }

  setMoveForward(v: number): void {
    this.moveForward = v;
  }

  setJumping(v: boolean): void {
    this.isJumping = v;
  }

  /** Mobs using EntityAITasks return true (tasks, navigator, body helper). */
  protected isAIEnabled(): boolean {
    return false;
  }

  protected isClientWorld(): boolean {
    return true;
  }

  protected isMovementBlocked(): boolean {
    return this.health <= 0;
  }

  isBlocking(): boolean {
    return false;
  }

  onLivingUpdate(): void {
    if (this.jumpTicks > 0) this.jumpTicks--;
    if (this.newPosRotationIncrements <= 0 && !this.isClientWorld()) {
      this.motionX *= 0.98;
      this.motionY *= 0.98;
      this.motionZ *= 0.98;
    }
    if (Math.abs(this.motionX) < 0.005) this.motionX = 0;
    if (Math.abs(this.motionY) < 0.005) this.motionY = 0;
    if (Math.abs(this.motionZ) < 0.005) this.motionZ = 0;
    if (this.isMovementBlocked()) {
      this.isJumping = false;
      this.moveStrafing = 0;
      this.moveForward = 0;
      this.randomYawVelocity = 0;
    } else if (this.isClientWorld()) {
      if (this.isAIEnabled()) {
        this.updateAITasks();
      } else {
        this.updateEntityActionState();
        this.rotationYawHead = this.rotationYaw;
      }
    }
    if (this.isJumping) {
      if (this.isInWater() || this.handleLavaMovement()) this.motionY += f(0.04);
      else if (this.onGround && this.jumpTicks === 0) {
        this.jump();
        this.jumpTicks = 10;
      }
    } else {
      this.jumpTicks = 0;
    }
    this.moveStrafing = f(this.moveStrafing * f(0.98));
    this.moveForward = f(this.moveForward * f(0.98));
    this.randomYawVelocity = f(this.randomYawVelocity * f(0.9));
    const saved = this.landMovementFactor;
    this.landMovementFactor = f(this.landMovementFactor * this.getSpeedModifier());
    this.moveEntityWithHeading(this.moveStrafing, this.moveForward);
    this.landMovementFactor = saved;
    this.collideWithNearbyEntities();
    if (this.canPickUpLoot() && !this.dead && this.worldObj.worldInfo.gameRules.mobGriefing) this.pickUpNearbyLoot();
  }

  /** Mobs that may pick up loot take better weapons and armour lying within a block. */
  private pickUpNearbyLoot(): void {
    const items = this.worldObj.getEntitiesWithinAABBExcludingEntity(this, this.boundingBox.expand(1, 0, 1), (e) => EntityList.getEntityString(e) === 'Item');
    for (const e of items) {
      const entityItem = e as Entity & { getEntityItem(): ItemStack };
      if (e.isDead) continue;
      const found = entityItem.getEntityItem();
      const slot = EntityLiving.getArmorPosition(found);
      if (slot < 0) continue;
      const current = this.getCurrentItemOrArmor(slot);
      let take = true;
      if (current) {
        if (slot === 0) {
          const a = SWORD_MATERIAL_DAMAGE.get(found.itemID);
          const b = SWORD_MATERIAL_DAMAGE.get(current.itemID);
          if (a !== undefined && b === undefined) take = true;
          else if (a !== undefined && b !== undefined) take = a === b ? found.getItemDamage() > current.getItemDamage() || (found.hasTagCompound() && !current.hasTagCompound()) : a > b;
          else take = false;
        } else {
          const a = found.getItem().getArmorInfo() ? found.getItem().getArmorReduction() : -1;
          const b = current.getItem().getArmorInfo() ? current.getItem().getArmorReduction() : -1;
          if (a >= 0 && b < 0) take = true;
          else if (a >= 0 && b >= 0) take = a === b ? found.getItemDamage() > current.getItemDamage() || (found.hasTagCompound() && !current.hasTagCompound()) : a > b;
          else take = false;
        }
      }
      if (!take) continue;
      if (current && f(this.rand.nextFloat() - f(0.1)) < this.equipmentDropChances[slot]) this.entityDropItem(current, 0);
      this.setCurrentItemOrArmor(slot, found);
      this.equipmentDropChances[slot] = 2;
      this.persistenceRequired = true;
      this.onItemPickup(e, 1);
      e.setDead();
    }
  }

  /** Equipment slot an item goes into: 4 helmet (also pumpkins and skulls) .. 1 boots, 0 hand. */
  static getArmorPosition(stack: ItemStack): number {
    if (stack.itemID === BlockIds.pumpkin || stack.itemID === 397) return 4;
    const armor = stack.getItem().getArmorInfo();
    if (armor) {
      switch (armor.armorType) {
        case 0:
          return 4;
        case 1:
          return 3;
        case 2:
          return 2;
        case 3:
          return 1;
      }
    }
    return 0;
  }

  /** The armour item ID for a slot (1-4) and tier (0 leather, 1 gold, 2 chain, 3 iron, 4 diamond), or 0. */
  static getArmorItemForSlot(slot: number, tier: number): number {
    return ARMOR_BY_SLOT[slot]?.[tier] ?? 0;
  }

  /** Random armour for zombies and skeletons, by difficulty (addRandomArmor). */
  protected addRandomArmor(): void {
    const diff = this.worldObj.difficultySetting;
    if (!(this.rand.nextFloat() < ARMOR_PROBABILITY[diff])) return;
    let tier = this.rand.nextInt(2);
    const stop = diff === 3 ? f(0.1) : f(0.25);
    if (this.rand.nextFloat() < f(0.095)) tier++;
    if (this.rand.nextFloat() < f(0.095)) tier++;
    if (this.rand.nextFloat() < f(0.095)) tier++;
    for (let i = 3; i >= 0; i--) {
      const worn = this.getCurrentArmor(i);
      if (i < 3 && this.rand.nextFloat() < stop) break;
      if (!worn) {
        const id = EntityLiving.getArmorItemForSlot(i + 1, tier);
        if (id > 0) this.setCurrentItemOrArmor(i + 1, new ItemStack(id, 1, 0));
      }
    }
  }

  /** func_82162_bC: random enchantments on spawned equipment, by difficulty. */
  protected enchantEquipment(): void {
    const enchant = EnchantmentHooks.addRandomEnchantment;
    if (!enchant) return;
    const diff = this.worldObj.difficultySetting;
    const held = this.getHeldItem();
    if (held && this.rand.nextFloat() < ENCHANTMENT_PROBABILITY[diff]) enchant(this.rand, held, 5 + diff * this.rand.nextInt(6));
    for (let i = 0; i < 4; i++) {
      const s = this.getCurrentArmor(i);
      if (s && this.rand.nextFloat() < ARMOR_ENCHANTMENT_PROBABILITY[diff]) enchant(this.rand, s, 5 + diff * this.rand.nextInt(6));
    }
  }

  /** func_85033_bc: pushes and is pushed by nearby entities. */
  protected collideWithNearbyEntities(): void {
    const list = this.worldObj.getEntitiesWithinAABBExcludingEntity(this, this.boundingBox.expand(f(0.2), 0, f(0.2)));
    for (const e of list) if (e.canBePushed()) this.collideWithEntity(e);
  }

  protected collideWithEntity(e: Entity): void {
    e.applyEntityCollision(this);
  }

  protected jump(): void {
    this.motionY = f(0.42);
    const boost = this.getActivePotionEffect(PotionId.jump);
    if (boost) this.motionY += f((boost.getAmplifier() + 1) * f(0.1));
    if (this.isSprinting()) {
      const r = f(this.rotationYaw * DEG);
      this.motionX -= f(MathHelper.sin(r) * f(0.2));
      this.motionZ += f(MathHelper.cos(r) * f(0.2));
    }
    this.isAirBorne = true;
  }

  protected canDespawn(): boolean {
    return true;
  }

  /** Vanishes beyond 128 blocks from any player, or randomly beyond 32 after 30 s alone. */
  protected despawnEntity(): void {
    if (this.persistenceRequired) return;
    const p = this.worldObj.getClosestPlayerToEntity(this, -1);
    if (!p) return;
    const dx = p.posX - this.posX;
    const dy = p.posY - this.posY;
    const dz = p.posZ - this.posZ;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (this.canDespawn() && d2 > 16384) this.setDead();
    if (this.entityAge > 600 && this.rand.nextInt(800) === 0 && d2 > 1024 && this.canDespawn()) this.setDead();
    else if (d2 < 1024) this.entityAge = 0;
  }

  /** The AI-task tick (isAIEnabled): despawn, senses, target and goal tasks, navigation, helpers. */
  protected updateAITasks(): void {
    this.entityAge++;
    this.despawnEntity();
    this.senses.clearSensingCache();
    this.targetTasks.onUpdateTasks();
    this.tasks.onUpdateTasks();
    this.navigator.onUpdateNavigation();
    this.updateAITick();
    this.moveHelper.onUpdateMoveHelper();
    this.lookHelper.onUpdateLook();
    this.jumpHelper.doJump();
  }

  /** Per-tick hook of AI mobs after navigation (EntityLiving.updateAITick). */
  protected updateAITick(): void {}

  /** The old AI: look at players within 8 blocks now and then, otherwise turn randomly. */
  protected updateEntityActionState(): void {
    this.entityAge++;
    this.despawnEntity();
    this.moveStrafing = 0;
    this.moveForward = 0;
    const range = 8;
    if (this.rand.nextFloat() < f(0.02)) {
      const p = this.worldObj.getClosestPlayerToEntity(this, range);
      if (p) {
        this.currentTarget = p;
        this.numTicksToChaseTarget = 10 + this.rand.nextInt(20);
      } else {
        this.randomYawVelocity = f(f(this.rand.nextFloat() - f(0.5)) * 20);
      }
    }
    if (this.currentTarget) {
      this.faceEntity(this.currentTarget, 10, this.getVerticalFaceSpeed());
      if (this.numTicksToChaseTarget-- <= 0 || this.currentTarget.isDead || this.currentTarget.getDistanceSqToEntity(this) > range * range) this.currentTarget = null;
    } else {
      if (this.rand.nextFloat() < f(0.05)) this.randomYawVelocity = f(f(this.rand.nextFloat() - f(0.5)) * 20);
      this.rotationYaw = f(this.rotationYaw + this.randomYawVelocity);
      this.rotationPitch = this.defaultPitch;
    }
    if (this.isInWater() || this.handleLavaMovement()) this.isJumping = this.rand.nextFloat() < f(0.8);
  }

  updateArmSwingProgress(): void {
    const end = this.getArmSwingAnimationEnd();
    if (this.isSwingInProgress) {
      this.swingProgressInt++;
      if (this.swingProgressInt >= end) {
        this.swingProgressInt = 0;
        this.isSwingInProgress = false;
      }
    } else {
      this.swingProgressInt = 0;
    }
    this.swingProgress = f(this.swingProgressInt / end);
  }

  getVerticalFaceSpeed(): number {
    return 40;
  }

  /** Turns towards an entity's eyes (or box centre) by at most the given angles. */
  faceEntity(e: Entity, maxYaw: number, maxPitch: number): void {
    const dx = e.posX - this.posX;
    const dz = e.posZ - this.posZ;
    const dy = e.isLivingEntity ? e.posY + e.getEyeHeight() - (this.posY + this.getEyeHeight()) : (e.boundingBox.minY + e.boundingBox.maxY) / 2 - (this.posY + this.getEyeHeight());
    const horiz = MathHelper.sqrt_double(dx * dx + dz * dz);
    const yaw = f(f((Math.atan2(dz, dx) * 180) / PI_F) - 90);
    const pitch = f(-((Math.atan2(dy, horiz) * 180) / PI_F));
    this.rotationPitch = updateRotation(this.rotationPitch, pitch, maxPitch);
    this.rotationYaw = updateRotation(this.rotationYaw, yaw, maxYaw);
  }

  /** Spawn check of natural spawning: no entities, blocks or liquid in the box. */
  getCanSpawnHere(): boolean {
    return (
      this.worldObj.checkNoEntityCollision(this.boundingBox) &&
      this.worldObj.getCollidingBoundingBoxes(this, this.boundingBox).length === 0 &&
      !this.worldObj.isAnyLiquid(this.boundingBox)
    );
  }

  getMaxSpawnedInChunk(): number {
    return 4;
  }

  /** Spawn-time setup (equipment, variants); called by SpawnerAnimals and spawn eggs. */
  initCreature(): void {}

  /** 6 ticks, faster with Haste and slower with Mining Fatigue. */
  protected getArmSwingAnimationEnd(): number {
    const haste = this.getActivePotionEffect(PotionId.digSpeed);
    if (haste) return 6 - (1 + haste.getAmplifier());
    const fatigue = this.getActivePotionEffect(PotionId.digSlowdown);
    return fatigue ? 6 + (1 + fatigue.getAmplifier()) * 2 : 6;
  }

  swingItem(): void {
    if (!this.isSwingInProgress || this.swingProgressInt >= this.getArmSwingAnimationEnd() / 2 || this.swingProgressInt < 0) {
      this.swingProgressInt = -1;
      this.isSwingInProgress = true;
      // WorldServer: Packet18Animation 1 to everyone tracking this entity.
      this.worldObj.netEvents?.entityAnimation(this, 1);
    }
  }

  getSwingProgress(pt: number): number {
    let d = this.swingProgress - this.prevSwingProgress;
    if (d < 0) d++;
    return f(this.prevSwingProgress + d * pt);
  }

  /** Speed and Slowness scale the walking speed by 20% and 15% per level. */
  getSpeedModifier(): number {
    let k = 1;
    const speed = this.getActivePotionEffect(PotionId.moveSpeed);
    if (speed) k = f(k * f(1 + f(f(0.2) * (speed.getAmplifier() + 1))));
    const slow = this.getActivePotionEffect(PotionId.moveSlowdown);
    if (slow) k = f(k * f(1 - f(f(0.15) * (slow.getAmplifier() + 1))));
    return k < 0 ? 0 : k;
  }

  setPositionAndUpdate(x: number, y: number, z: number): void {
    this.setLocationAndAngles(x, y, z, this.rotationYaw, this.rotationPitch);
  }

  /** Eye-interpolated position (posY is already eye level for players). */
  getPosition(pt: number): Vec3 {
    if (pt === 1) return new Vec3(this.posX, this.posY, this.posZ);
    return new Vec3(
      this.prevPosX + (this.posX - this.prevPosX) * pt,
      this.prevPosY + (this.posY - this.prevPosY) * pt,
      this.prevPosZ + (this.posZ - this.prevPosZ) * pt,
    );
  }

  override getLookVec(): Vec3 {
    return this.getLook(1);
  }

  getLook(pt: number): Vec3 {
    let pitch = this.rotationPitch;
    let yaw = this.rotationYaw;
    if (pt !== 1) {
      pitch = f(this.prevRotationPitch + (this.rotationPitch - this.prevRotationPitch) * pt);
      yaw = f(this.prevRotationYaw + (this.rotationYaw - this.prevRotationYaw) * pt);
    }
    const c = MathHelper.cos(f(f(-yaw * DEG) - PI_F));
    const s = MathHelper.sin(f(f(-yaw * DEG) - PI_F));
    const cp = -MathHelper.cos(f(-pitch * DEG));
    const sp = MathHelper.sin(f(-pitch * DEG));
    return new Vec3(f(s * cp), sp, f(c * cp));
  }

  rayTrace(dist: number, pt: number): MovingObjectPosition | null {
    const pos = this.getPosition(pt);
    const look = this.getLook(pt);
    const end = pos.addVector(look.xCoord * dist, look.yCoord * dist, look.zCoord * dist);
    return this.worldObj.rayTraceBlocks(pos, end);
  }

  // ------------------------------------------------------------------ equipment

  override getHeldItem(): ItemStack | null {
    return this.equipment[0];
  }

  /** 0 = held item, 1 = boots, 2 = leggings, 3 = chestplate, 4 = helmet. */
  getCurrentItemOrArmor(slot: number): ItemStack | null {
    return this.equipment[slot];
  }

  getCurrentArmor(slot: number): ItemStack | null {
    return this.equipment[slot + 1];
  }

  override setCurrentItemOrArmor(slot: number, stack: ItemStack | null): void {
    this.equipment[slot] = stack;
  }

  override getLastActiveItems(): (ItemStack | null)[] {
    return this.equipment;
  }

  /** Sets the drop chance of an equipment slot (func_96120_a). */
  setEquipmentDropChance(slot: number, chance: number): void {
    this.equipmentDropChances[slot] = chance;
  }

  canPickUpLoot(): boolean {
    return this.canPickUpLootFlag;
  }

  setCanPickUpLoot(v: boolean): void {
    this.canPickUpLootFlag = v;
  }

  isNoDespawnRequired(): boolean {
    return this.persistenceRequired;
  }

  /** Picked up an item, arrow or orb: the client shows it flying in (Packet22Collect). */
  onItemPickup(e: Entity, _count: number): void {
    if (!e.isDead) {
      this.worldObj.netEvents?.itemCollected(e, this);
      EntityLiving.collectEffect?.(e, this);
    }
  }

  /** Breaking tool: sound plus item particles in front of the face. */
  renderBrokenItemStack(stack: ItemStack): void {
    this.playSound('random.break', f(0.8), f(f(0.8) + f(this.worldObj.rand.nextFloat() * f(0.4))));
    for (let i = 0; i < 5; i++) {
      const v = new Vec3((this.rand.nextFloat() - 0.5) * 0.1, Math.random() * 0.1 + 0.1, 0);
      v.rotateAroundX(f((-this.rotationPitch * PI_F) / 180));
      v.rotateAroundY(f((-this.rotationYaw * PI_F) / 180));
      let p = new Vec3((this.rand.nextFloat() - 0.5) * 0.3, -this.rand.nextFloat() * 0.6 - 0.3, 0.6);
      p.rotateAroundX(f((-this.rotationPitch * PI_F) / 180));
      p.rotateAroundY(f((-this.rotationYaw * PI_F) / 180));
      p = p.addVector(this.posX, this.posY + this.getEyeHeight(), this.posZ);
      this.worldObj.spawnParticle(`iconcrack_${stack.getItem().itemID}`, p.xCoord, p.yCoord, p.zCoord, v.xCoord, v.yCoord + 0.05, v.zCoord);
    }
  }

  // ------------------------------------------------------------------ potion effects

  /** Ticks the effects, refreshes the swirl colour, and spawns the swirl particles. */
  protected updatePotionEffects(): void {
    for (const [id, effect] of [...this.activePotionsMap]) {
      if (!effect.onUpdate(this)) {
        this.activePotionsMap.delete(id);
        this.onFinishedPotionEffect(effect);
      } else if (effect.getDuration() % 600 === 0) {
        this.onChangedPotionEffect(effect);
      }
    }
    if (this.potionsNeedUpdate) {
      if (this.activePotionsMap.size === 0) {
        this.potionSwirlAmbient = false;
        this.potionSwirlColor = 0;
        this.setInvisible(false);
      } else {
        const effects = [...this.activePotionsMap.values()];
        this.potionSwirlAmbient = areAllPotionsAmbient(effects);
        this.potionSwirlColor = calcPotionLiquidColor(effects);
        this.setInvisible(this.isPotionActive(PotionId.invisibility));
      }
      this.potionsNeedUpdate = false;
    }
    const color = this.potionSwirlColor;
    if (color > 0) {
      let show = !this.isInvisible() ? this.rand.nextBoolean() : this.rand.nextInt(15) === 0;
      if (this.potionSwirlAmbient) show = show && this.rand.nextInt(5) === 0;
      if (show) {
        this.worldObj.spawnParticle(
          this.potionSwirlAmbient ? 'mobSpellAmbient' : 'mobSpell',
          this.posX + (this.rand.nextDouble() - 0.5) * this.width,
          this.posY + this.rand.nextDouble() * this.height - this.yOffset,
          this.posZ + (this.rand.nextDouble() - 0.5) * this.width,
          ((color >> 16) & 255) / 255,
          ((color >> 8) & 255) / 255,
          (color & 255) / 255,
        );
      }
    }
  }

  clearActivePotions(): void {
    for (const [id, effect] of [...this.activePotionsMap]) {
      this.activePotionsMap.delete(id);
      this.onFinishedPotionEffect(effect);
    }
  }

  getActivePotionEffects(): PotionEffectLike[] {
    return [...this.activePotionsMap.values()];
  }

  isPotionActive(id: number): boolean {
    return this.activePotionsMap.has(id);
  }

  getActivePotionEffect(id: number): PotionEffectLike | null {
    return this.activePotionsMap.get(id) ?? null;
  }

  /** Adds an effect, or merges it into the running effect of the same potion. */
  addPotionEffect(effect: PotionEffectLike): void {
    if (!this.isPotionApplicable(effect)) return;
    const running = this.activePotionsMap.get(effect.getPotionID());
    if (running) {
      running.combine(effect);
      this.onChangedPotionEffect(running);
    } else {
      this.activePotionsMap.set(effect.getPotionID(), effect);
      this.onNewPotionEffect(effect);
    }
  }

  /** Undead ignore Regeneration and Poison. */
  isPotionApplicable(effect: PotionEffectLike): boolean {
    if (this.getCreatureAttribute() === EnumCreatureAttribute.UNDEAD) {
      const id = effect.getPotionID();
      if (id === PotionId.regeneration || id === PotionId.poison) return false;
    }
    return true;
  }

  removePotionEffectClient(id: number): void {
    this.activePotionsMap.delete(id);
  }

  removePotionEffect(id: number): void {
    const effect = this.activePotionsMap.get(id);
    if (!effect) return;
    this.activePotionsMap.delete(id);
    this.onFinishedPotionEffect(effect);
  }

  protected onNewPotionEffect(_e: PotionEffectLike): void {
    this.potionsNeedUpdate = true;
  }

  protected onChangedPotionEffect(_e: PotionEffectLike): void {
    this.potionsNeedUpdate = true;
  }

  protected onFinishedPotionEffect(_e: PotionEffectLike): void {
    this.potionsNeedUpdate = true;
  }

  // ------------------------------------------------------------------ misc

  isPlayerSleeping(): boolean {
    return false;
  }

  isChild(): boolean {
    return false;
  }

  getCreatureAttribute(): EnumCreatureAttribute {
    return EnumCreatureAttribute.UNDEFINED;
  }

  isEntityUndead(): boolean {
    return this.getCreatureAttribute() === EnumCreatureAttribute.UNDEAD;
  }

  getRenderSizeModifier(): number {
    return 1;
  }

  canBeSteered(): boolean {
    return false;
  }

  getArrowCountInEntity(): number {
    return this.arrowCount;
  }

  setArrowCountInEntity(n: number): void {
    this.arrowCount = n;
  }

  /** The entity credited with this one's death (func_94060_bK). */
  getKiller(): EntityLiving | null {
    return this.attackingPlayer ?? this.entityLivingToAttack;
  }

  override getEntityName(): string {
    return this.hasCustomName() ? this.customName : super.getEntityName();
  }

  /** func_94058_c */
  setCustomNameTag(name: string): void {
    this.customName = name;
  }

  /** func_94057_bL */
  getCustomNameTag(): string {
    return this.customName;
  }

  /** func_94056_bM */
  hasCustomName(): boolean {
    return this.customName.length > 0;
  }

  /** func_94061_f */
  setAlwaysRenderNameTag(v: boolean): void {
    this.alwaysRenderNameTag = v;
  }

  /** func_94062_bN / func_94059_bO */
  getAlwaysRenderNameTag(): boolean {
    return this.alwaysRenderNameTag;
  }

  // ------------------------------------------------------------------ saving (NBT)

  override writeEntityToNBT(tag: TagCompound): void {
    if (this.health < -32768) this.health = -32768;
    NBT.setShort(tag, 'Health', this.health);
    NBT.setShort(tag, 'HurtTime', this.hurtTime);
    NBT.setShort(tag, 'DeathTime', this.deathTime);
    NBT.setShort(tag, 'AttackTime', this.attackTime);
    NBT.setBoolean(tag, 'CanPickUpLoot', this.canPickUpLoot());
    NBT.setBoolean(tag, 'PersistenceRequired', this.persistenceRequired);
    const equipment: TagCompound[] = [];
    for (const s of this.equipment) equipment.push(s ? s.writeToNBT() : {});
    NBT.setList(tag, 'Equipment', NBTType.Compound, equipment);
    if (this.activePotionsMap.size > 0) {
      const effects: TagCompound[] = [];
      for (const e of this.activePotionsMap.values()) {
        const t: TagCompound = {};
        NBT.setByte(t, 'Id', e.getPotionID());
        NBT.setByte(t, 'Amplifier', e.getAmplifier());
        NBT.setInteger(t, 'Duration', e.getDuration());
        NBT.setBoolean(t, 'Ambient', e.getIsAmbient());
        effects.push(t);
      }
      NBT.setList(tag, 'ActiveEffects', NBTType.Compound, effects);
    }
    NBT.setList(tag, 'DropChances', NBTType.Float, NBT.floatList(...this.equipmentDropChances));
    NBT.setString(tag, 'CustomName', this.customName);
    NBT.setBoolean(tag, 'CustomNameVisible', this.alwaysRenderNameTag);
  }

  override readEntityFromNBT(tag: TagCompound): void {
    this.health = NBT.hasKey(tag, 'Health') ? NBT.getShort(tag, 'Health') : this.getMaxHealth();
    this.hurtTime = NBT.getShort(tag, 'HurtTime');
    this.deathTime = NBT.getShort(tag, 'DeathTime');
    this.attackTime = NBT.getShort(tag, 'AttackTime');
    this.setCanPickUpLoot(NBT.getBoolean(tag, 'CanPickUpLoot'));
    this.persistenceRequired = NBT.getBoolean(tag, 'PersistenceRequired');
    const name = NBT.getString(tag, 'CustomName');
    if (name.length > 0) this.setCustomNameTag(name);
    this.setAlwaysRenderNameTag(NBT.getBoolean(tag, 'CustomNameVisible'));
    if (NBT.hasKey(tag, 'Equipment')) {
      const list = NBT.getTagList<TagCompound>(tag, 'Equipment');
      for (let i = 0; i < this.equipment.length; i++) {
        const t = list[i];
        this.equipment[i] = t && typeof t === 'object' && NBT.hasKey(t, 'id') ? ItemStack.loadItemStackFromNBT(t) : null;
      }
    }
    for (const t of NBT.getCompoundList(tag, 'ActiveEffects')) {
      const e = new PotionEffect(NBT.getByte(t, 'Id'), NBT.getInteger(t, 'Duration'), NBT.getByte(t, 'Amplifier'), NBT.getBoolean(t, 'Ambient'));
      this.activePotionsMap.set(e.getPotionID(), e);
    }
    if (NBT.hasKey(tag, 'DropChances')) {
      const list = NBT.getTagList<number>(tag, 'DropChances');
      for (let i = 0; i < list.length && i < this.equipmentDropChances.length; i++) this.equipmentDropChances[i] = f(Number(list[i]) || 0);
    }
  }

  /** Mobs path-find further when they want to attack (func_82143_as). */
  override getMaxFallHeight(): number {
    if (!this.getAttackTarget()) return 3;
    let n = Math.trunc(f(this.health - f(this.getMaxHealth() * f(0.33))));
    n -= (3 - this.worldObj.difficultySetting) * 4;
    if (n < 0) n = 0;
    return n + 3;
  }
}

/** EntityXPOrb.getXPSplit: the largest orb value not above `xp`. */
export function getXPSplit(xp: number): number {
  const sizes = [2477, 1237, 617, 307, 149, 73, 37, 17, 7, 3];
  for (const s of sizes) if (xp >= s) return s;
  return 1;
}

function updateRotation(from: number, to: number, max: number): number {
  let d = MathHelper.wrapAngleTo180_float(to - from);
  if (d > max) d = max;
  if (d < -max) d = -max;
  return f(from + d);
}
