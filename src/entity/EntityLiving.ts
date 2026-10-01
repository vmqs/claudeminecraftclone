import { Block } from '../block/Block';
import { BlockIds } from '../block/BlockIds';
import { Material } from '../block/Material';
import { MathHelper } from '../core/MathHelper';
import type { MovingObjectPosition } from '../core/MovingObjectPosition';
import { Vec3 } from '../core/Vec3';
import type { ItemStack } from '../item/ItemStack';
import type { World } from '../world/World';
import { DamageSource } from './DamageSource';
import { Entity } from './Entity';

const f = Math.fround;
const DEG = f(Math.PI / 180);
const PI_F = f(Math.PI);

/**
 * Living entity skeleton: health, hurt timers, limb swing, head/body yaw and the
 * ground/air/water/lava movement integration of EntityLiving. Mob AI is not here.
 */
export abstract class EntityLiving extends Entity {
  maxHurtResistantTime = 20;
  renderYawOffset = 0;
  prevRenderYawOffset = 0;
  rotationYawHead = 0;
  prevRotationYawHead = 0;
  /** field_70768_au / field_70766_av: smoothed on-ground walking factor (for models). */
  field_70768_au = 0;
  field_70766_av = 0;
  /** field_70764_aw / field_70763_ax: accumulated body movement (for models). */
  field_70764_aw = 0;
  field_70763_ax = 0;
  protected texture = '/mob/char.png';
  landMovementFactor = f(0.1);
  jumpMovementFactor = f(0.02);
  prevSwingProgress = 0;
  swingProgress = 0;
  protected health: number;
  prevHealth = 0;
  hurtTime = 0;
  maxHurtTime = 0;
  attackedAtYaw = 0;
  deathTime = 0;
  attackTime = 0;
  prevCameraPitch = 0;
  cameraPitch = 0;
  prevLimbYaw = 0;
  limbYaw = 0;
  limbSwing = 0;
  isSwingInProgress = false;
  swingProgressInt = 0;
  protected moveStrafing = 0;
  protected moveForward = 0;
  protected randomYawVelocity = 0;
  protected isJumping = false;
  protected entityAge = 0;
  protected lastDamage = 0;
  private jumpTicks = 0;
  protected newPosRotationIncrements = 0;

  constructor(world: World) {
    super(world);
    this.health = this.getMaxHealth();
    this.preventEntitySpawning = true;
    this.setPosition(this.posX, this.posY, this.posZ);
    this.rotationYaw = f(Math.random() * Math.PI * 2);
    this.rotationYawHead = this.rotationYaw;
    this.stepHeight = 0.5;
  }

  abstract getMaxHealth(): number;

  protected entityInit(): void {}

  getHealth(): number {
    return this.health;
  }

  setEntityHealth(h: number): void {
    this.health = Math.min(h, this.getMaxHealth());
  }

  heal(n: number): void {
    if (this.health > 0) this.setEntityHealth(this.health + n);
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
    if (this.isEntityAlive() && this.isEntityInsideOpaqueBlock()) this.attackEntityFrom(DamageSource.inWall, 1);
    if (this.isImmuneToFire()) this.extinguish();
    const invulnerable = this.isDamageDisabled();
    if (this.isEntityAlive() && this.isInsideOfMaterial(Material.water) && !this.canBreatheUnderwater() && !invulnerable) {
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
    this.field_70763_ax = this.field_70764_aw;
    this.prevRenderYawOffset = this.renderYawOffset;
    this.prevRotationYawHead = this.rotationYawHead;
    this.prevRotationYaw = this.rotationYaw;
    this.prevRotationPitch = this.rotationPitch;
  }

  /** Players with disableDamage do not drown. */
  protected isDamageDisabled(): boolean {
    return false;
  }

  protected onDeathUpdate(): void {
    this.deathTime++;
    if (this.deathTime === 20) this.setDead();
  }

  protected decreaseAirSupply(air: number): number {
    return air - 1;
  }

  canBreatheUnderwater(): boolean {
    return false;
  }

  override updateRidden(): void {
    super.updateRidden();
    this.field_70768_au = this.field_70766_av;
    this.field_70766_av = 0;
    this.fallDistance = 0;
  }

  override onUpdate(): void {
    super.onUpdate();
    this.onLivingUpdate();
    const dx = this.posX - this.prevPosX;
    const dz = this.posZ - this.prevPosZ;
    const distSq = f(dx * dx + dz * dz);
    let bodyYaw = this.renderYawOffset;
    let walk = 0;
    this.field_70768_au = this.field_70766_av;
    let onGroundTarget = 0;
    if (!(distSq <= f(0.0025000002))) {
      onGroundTarget = 1;
      walk = f(f(Math.sqrt(distSq)) * 3);
      bodyYaw = f(f(f(Math.atan2(dz, dx)) * 180) / PI_F - 90);
    }
    if (this.swingProgress > 0) bodyYaw = this.rotationYaw;
    if (!this.onGround) onGroundTarget = 0;
    this.field_70766_av = f(this.field_70766_av + (onGroundTarget - this.field_70766_av) * f(0.3));

    const d1 = MathHelper.wrapAngleTo180_float(bodyYaw - this.renderYawOffset);
    this.renderYawOffset = f(this.renderYawOffset + d1 * f(0.3));
    let d2 = MathHelper.wrapAngleTo180_float(this.rotationYaw - this.renderYawOffset);
    const backwards = d2 < -90 || d2 >= 90;
    if (d2 < -75) d2 = -75;
    if (d2 >= 75) d2 = 75;
    this.renderYawOffset = f(this.rotationYaw - d2);
    if (d2 * d2 > 2500) this.renderYawOffset = f(this.renderYawOffset + d2 * f(0.2));
    if (backwards) walk *= -1;

    while (this.rotationYaw - this.prevRotationYaw < -180) this.prevRotationYaw -= 360;
    while (this.rotationYaw - this.prevRotationYaw >= 180) this.prevRotationYaw += 360;
    while (this.renderYawOffset - this.prevRenderYawOffset < -180) this.prevRenderYawOffset -= 360;
    while (this.renderYawOffset - this.prevRenderYawOffset >= 180) this.prevRenderYawOffset += 360;
    while (this.rotationPitch - this.prevRotationPitch < -180) this.prevRotationPitch -= 360;
    while (this.rotationPitch - this.prevRotationPitch >= 180) this.prevRotationPitch += 360;
    while (this.rotationYawHead - this.prevRotationYawHead < -180) this.prevRotationYawHead -= 360;
    while (this.rotationYawHead - this.prevRotationYawHead >= 180) this.prevRotationYawHead += 360;
    this.field_70764_aw = f(this.field_70764_aw + walk);
  }

  override attackEntityFrom(src: DamageSource, amount: number): boolean {
    if (this.isEntityInvulnerable()) return false;
    this.entityAge = 0;
    if (this.health <= 0) return false;
    if (src.isFireDamage() && this.isImmuneToFire()) return false;
    if (this.hurtResistantTime > this.maxHurtResistantTime / 2) {
      if (amount <= this.lastDamage) return false;
      this.health -= amount - this.lastDamage;
      this.lastDamage = amount;
    } else {
      this.lastDamage = amount;
      this.prevHealth = this.health;
      this.hurtResistantTime = this.maxHurtResistantTime;
      this.health -= amount;
      this.hurtTime = this.maxHurtTime = 10;
    }
    this.attackedAtYaw = 0;
    if (this.health <= 0) this.onDeath(src);
    return true;
  }

  onDeath(_src: DamageSource): void {}

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
      // The client player hovers while its chunk has not arrived yet.
      if (!this.worldObj.blockExists(Math.trunc(this.posX), 0, Math.trunc(this.posZ))) {
        this.motionY = this.posY > 0 ? -0.1 : 0;
      } else {
        this.motionY -= 0.08;
      }
      this.motionY *= f(0.98);
      this.motionX *= slip;
      this.motionZ *= slip;
    }
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

  protected isAIEnabled(): boolean {
    return false;
  }

  getAIMoveSpeed(): number {
    return this.landMovementFactor;
  }

  protected isClientWorld(): boolean {
    return true;
  }

  protected isMovementBlocked(): boolean {
    return this.health <= 0;
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
      this.updateEntityActionState();
      this.rotationYawHead = this.rotationYaw;
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
  }

  protected collideWithNearbyEntities(): void {
    const list = this.worldObj.getEntitiesWithinAABBExcludingEntity(this, this.boundingBox.expand(f(0.2), 0, f(0.2)));
    for (const e of list) if (e.canBePushed()) e.applyEntityCollision(this);
  }

  protected updateEntityActionState(): void {}

  protected jump(): void {
    this.motionY = f(0.42);
    if (this.isSprinting()) {
      const r = f(this.rotationYaw * DEG);
      this.motionX -= f(MathHelper.sin(r) * f(0.2));
      this.motionZ += f(MathHelper.cos(r) * f(0.2));
    }
    this.isAirBorne = true;
  }

  protected updateArmSwingProgress(): void {
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

  protected getArmSwingAnimationEnd(): number {
    return 6;
  }

  swingItem(): void {
    if (!this.isSwingInProgress || this.swingProgressInt >= this.getArmSwingAnimationEnd() / 2 || this.swingProgressInt < 0) {
      this.swingProgressInt = -1;
      this.isSwingInProgress = true;
    }
  }

  getSwingProgress(pt: number): number {
    let d = this.swingProgress - this.prevSwingProgress;
    if (d < 0) d++;
    return f(this.prevSwingProgress + d * pt);
  }

  getSpeedModifier(): number {
    return 1;
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

  override getHeldItem(): ItemStack | null {
    return null;
  }

  getCurrentItemOrArmor(_slot: number): ItemStack | null {
    return null;
  }

  isPlayerSleeping(): boolean {
    return false;
  }

  isChild(): boolean {
    return false;
  }

  getRenderSizeModifier(): number {
    return 1;
  }

  getTextureName(): string {
    return this.texture;
  }
}
