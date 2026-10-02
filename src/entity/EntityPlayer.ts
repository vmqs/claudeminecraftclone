import type { Block } from '../block/Block';
import { Material } from '../block/Material';
import { MathHelper } from '../core/MathHelper';
import type { ItemStack } from '../item/ItemStack';
import type { World } from '../world/World';
import { type DamageSource, EntityDamageSource } from './DamageSource';
import type { Entity } from './Entity';
import { EntityLiving } from './EntityLiving';
import { InventoryPlayer } from './InventoryPlayer';
import { PlayerCapabilities } from './PlayerCapabilities';

const f = Math.fround;

/** A player: inventory, capabilities (creative flying), camera bob and eye height. */
export abstract class EntityPlayer extends EntityLiving {
  inventory: InventoryPlayer;
  protected flyToggleTimer = 0;
  prevCameraYaw = 0;
  cameraYaw = 0;
  username = 'Player';
  /** Cape physics: a point chasing the player (field_71091_bM ... field_71085_bR). */
  prevChasingPosX = 0;
  prevChasingPosY = 0;
  prevChasingPosZ = 0;
  chasingPosX = 0;
  chasingPosY = 0;
  chasingPosZ = 0;
  capabilities = new PlayerCapabilities();
  protected speedOnGround = f(0.1);
  protected speedInAir = f(0.02);
  private itemInUse: ItemStack | null = null;
  private itemInUseCount = 0;

  override get isPlayerEntity(): boolean {
    return true;
  }

  constructor(world: World) {
    super(world);
    this.inventory = new InventoryPlayer(this);
    this.yOffset = f(1.62);
    const sp = world.getSpawnPoint();
    this.setLocationAndAngles(sp.x + 0.5, sp.y + 1, sp.z + 0.5, 0, 0);
    this.fireResistance = 20;
    this.texture = '/mob/char.png';
  }

  getMaxHealth(): number {
    return 20;
  }

  getItemInUse(): ItemStack | null {
    return this.itemInUse;
  }
  getItemInUseCount(): number {
    return this.itemInUseCount;
  }
  isUsingItem(): boolean {
    return this.itemInUse !== null;
  }
  getItemInUseDuration(): number {
    return this.isUsingItem() ? this.itemInUse!.getMaxItemUseDuration() - this.itemInUseCount : 0;
  }
  setItemInUse(stack: ItemStack | null, count: number): void {
    if (stack !== this.itemInUse) {
      this.itemInUse = stack;
      this.itemInUseCount = count;
    }
  }
  clearItemInUse(): void {
    this.itemInUse = null;
    this.itemInUseCount = 0;
  }
  stopUsingItem(): void {
    if (this.itemInUse) this.itemInUse.onPlayerStoppedUsing(this.worldObj, this, this.itemInUseCount);
    this.clearItemInUse();
  }

  override onUpdate(): void {
    if (this.itemInUse) {
      if (this.inventory.getCurrentItem() !== this.itemInUse) this.clearItemInUse();
      else if (--this.itemInUseCount === 0) this.clearItemInUse();
    }
    super.onUpdate();
    if (this.isBurning() && this.capabilities.disableDamage) this.extinguish();

    this.prevChasingPosX = this.chasingPosX;
    this.prevChasingPosY = this.chasingPosY;
    this.prevChasingPosZ = this.chasingPosZ;
    const dx = this.posX - this.chasingPosX;
    const dy = this.posY - this.chasingPosY;
    const dz = this.posZ - this.chasingPosZ;
    const lim = 10;
    if (dx > lim || dx < -lim) this.prevChasingPosX = this.chasingPosX = this.posX;
    if (dz > lim || dz < -lim) this.prevChasingPosZ = this.chasingPosZ = this.posZ;
    if (dy > lim || dy < -lim) this.prevChasingPosY = this.chasingPosY = this.posY;
    this.chasingPosX += dx * 0.25;
    this.chasingPosZ += dz * 0.25;
    this.chasingPosY += dy * 0.25;
  }

  protected override isDamageDisabled(): boolean {
    return this.capabilities.disableDamage;
  }

  protected override isMovementBlocked(): boolean {
    return this.getHealth() <= 0 || this.isPlayerSleeping();
  }

  override updateRidden(): void {
    super.updateRidden();
    this.prevCameraYaw = this.cameraYaw;
    this.cameraYaw = 0;
  }

  override preparePlayerToSpawn(): void {
    this.yOffset = f(1.62);
    this.setSize(0.6, 1.8);
    super.preparePlayerToSpawn();
    this.setEntityHealth(this.getMaxHealth());
    this.deathTime = 0;
  }

  protected override updateEntityActionState(): void {
    this.updateArmSwingProgress();
  }

  override onLivingUpdate(): void {
    if (this.flyToggleTimer > 0) this.flyToggleTimer--;
    this.inventory.decrementAnimations();
    this.prevCameraYaw = this.cameraYaw;
    super.onLivingUpdate();
    this.landMovementFactor = this.capabilities.getWalkSpeed();
    this.jumpMovementFactor = this.speedInAir;
    if (this.isSprinting()) {
      this.landMovementFactor = f(this.landMovementFactor + this.capabilities.getWalkSpeed() * 0.3);
      this.jumpMovementFactor = f(this.jumpMovementFactor + this.speedInAir * 0.3);
    }
    let bob = f(MathHelper.sqrt_double(this.motionX * this.motionX + this.motionZ * this.motionZ));
    let tilt = f(f(Math.atan(-this.motionY * f(0.2))) * 15);
    if (bob > f(0.1)) bob = f(0.1);
    if (!this.onGround || this.getHealth() <= 0) bob = 0;
    if (this.onGround || this.getHealth() <= 0) tilt = 0;
    this.cameraYaw = f(this.cameraYaw + (bob - this.cameraYaw) * f(0.4));
    this.cameraPitch = f(this.cameraPitch + (tilt - this.cameraPitch) * f(0.8));
    if (this.getHealth() > 0) {
      const list = this.worldObj.getEntitiesWithinAABBExcludingEntity(this, this.boundingBox.expand(1, 0.5, 1));
      for (const e of list) if (!e.isDead) e.onCollideWithPlayer(this);
    }
  }

  getCurrentPlayerStrVsBlock(b: Block, _canHarvest: boolean): number {
    let s = this.inventory.getStrVsBlock(b);
    if (this.isInsideOfMaterial(Material.water)) s = f(s / 5);
    if (!this.onGround) s = f(s / 5);
    return s;
  }

  canHarvestBlock(b: Block): boolean {
    return this.inventory.canHarvestBlock(b);
  }

  override getEyeHeight(): number {
    return f(0.12);
  }

  protected resetHeight(): void {
    this.yOffset = f(1.62);
  }

  override attackEntityFrom(src: DamageSource, amount: number): boolean {
    if (this.isEntityInvulnerable()) return false;
    if (this.capabilities.disableDamage && !src.canHarmInCreative()) return false;
    this.entityAge = 0;
    if (this.getHealth() <= 0) return false;
    if (amount === 0) return false;
    return super.attackEntityFrom(src, amount);
  }

  /** func_82243_bO: the fraction of armour slots in use (how visible an invisible player is). */
  getArmorVisibility(): number {
    let n = 0;
    for (const s of this.inventory.armorInventory) if (s) n++;
    return Math.fround(n / this.inventory.armorInventory.length);
  }

  override getTotalArmorValue(): number {
    return this.inventory.getTotalArmorValue();
  }

  override getLastActiveItems(): (ItemStack | null)[] {
    return this.inventory.armorInventory;
  }

  /** Like 1.5.2 this indexes the armour inventory directly. */
  override setCurrentItemOrArmor(slot: number, stack: ItemStack | null): void {
    this.inventory.armorInventory[slot] = stack;
  }

  /**
   * Melee hit with the held item (attackTargetEntityWithCurrentItem): item damage, +50% random
   * critical damage while falling, sprint knockback, item wear (none in Creative) and the crit
   * particles.
   */
  attackTargetEntityWithCurrentItem(target: Entity): void {
    if (!target.canAttackWithItem() || target.hitByEntity(this)) return;
    let damage = this.inventory.getDamageVsEntity(target);
    let knockback = 0;
    const enchantDamage = 0;
    if (this.isSprinting()) knockback++;
    if (damage <= 0 && enchantDamage <= 0) return;
    const critical = this.fallDistance > 0 && !this.onGround && !this.isOnLadder() && !this.isInWater() && this.ridingEntity === null && target.isLivingEntity;
    if (critical && damage > 0) damage += this.rand.nextInt(Math.trunc(damage / 2) + 2);
    damage += enchantDamage;
    const hit = target.attackEntityFrom(EntityDamageSource.causePlayerDamage(this), damage);
    if (hit) {
      if (knockback > 0) {
        const r = f((this.rotationYaw * f(Math.PI)) / 180);
        target.addVelocity(f(f(-MathHelper.sin(r) * knockback) * f(0.5)), 0.1, f(f(MathHelper.cos(r) * knockback) * f(0.5)));
        this.motionX *= 0.6;
        this.motionZ *= 0.6;
        this.setSprinting(false);
      }
      if (critical) this.onCriticalHit(target);
      if (enchantDamage > 0) this.onEnchantmentCritical(target);
      this.setLastAttackingEntity(target);
    }
    const held = this.getCurrentEquippedItem();
    if (held && target.isLivingEntity) {
      held.hitEntity(target as EntityLiving, this);
      if (held.stackSize <= 0) this.destroyCurrentEquippedItem();
    }
  }

  /** Critical hit particles (EntityPlayerSP adds EntityCrit2FX). */
  onCriticalHit(_target: Entity): void {}

  onEnchantmentCritical(_target: Entity): void {}

  /** Q: throws one item (or the whole stack) of the held slot. */
  dropOneItem(wholeStack: boolean): Entity | null {
    const cur = this.inventory.getCurrentItem();
    return this.dropPlayerItemWithRandomChoice(this.inventory.decrStackSize(this.inventory.currentItem, wholeStack && cur ? cur.stackSize : 1), false);
  }

  dropPlayerItem(stack: ItemStack | null): Entity | null {
    return this.dropPlayerItemWithRandomChoice(stack, false);
  }

  /** Throws a stack forward from the eyes (pickup delay 40), or in a random direction. */
  dropPlayerItemWithRandomChoice(stack: ItemStack | null, randomDirection: boolean): Entity | null {
    if (!stack) return null;
    const item = this.worldObj.createItemEntity(this.posX, this.posY - f(0.3) + this.getEyeHeight(), this.posZ, stack);
    if (!item) return null;
    item.delayBeforeCanPickup = 40;
    if (randomDirection) {
      const speed = f(this.rand.nextFloat() * f(0.5));
      const a = f(f(this.rand.nextFloat() * f(Math.PI)) * 2);
      item.motionX = f(-MathHelper.sin(a) * speed);
      item.motionZ = f(MathHelper.cos(a) * speed);
      item.motionY = f(0.2);
    } else {
      const yaw = f(f(this.rotationYaw / 180) * f(Math.PI));
      const pitch = f(f(this.rotationPitch / 180) * f(Math.PI));
      const k = f(0.3);
      item.motionX = f(f(-MathHelper.sin(yaw) * MathHelper.cos(pitch)) * k);
      item.motionZ = f(f(MathHelper.cos(yaw) * MathHelper.cos(pitch)) * k);
      item.motionY = f(f(-MathHelper.sin(pitch) * k) + f(0.1));
      const a = f(f(this.rand.nextFloat() * f(Math.PI)) * 2);
      const spread = f(f(0.02) * this.rand.nextFloat());
      item.motionX += Math.cos(a) * spread;
      item.motionY += f(f(this.rand.nextFloat() - this.rand.nextFloat()) * f(0.1));
      item.motionZ += Math.sin(a) * spread;
    }
    this.joinEntityItemWithWorld(item);
    return item;
  }

  protected joinEntityItemWithWorld(item: Entity): void {
    this.worldObj.spawnEntityInWorld(item);
  }

  getCurrentEquippedItem(): ItemStack | null {
    return this.inventory.getCurrentItem();
  }

  destroyCurrentEquippedItem(): void {
    this.inventory.setInventorySlotContents(this.inventory.currentItem, null);
  }

  override getYOffset(): number {
    return this.yOffset - 0.5;
  }

  override getHeldItem(): ItemStack | null {
    return this.inventory.getCurrentItem();
  }

  override getCurrentItemOrArmor(slot: number): ItemStack | null {
    return slot === 0 ? this.inventory.getCurrentItem() : this.inventory.armorInventory[slot - 1];
  }

  protected override isFlyingPhysics(): boolean {
    return this.capabilities.isFlying;
  }

  override moveEntityWithHeading(strafe: number, forward: number): void {
    if (this.capabilities.isFlying && this.ridingEntity === null) {
      const my = this.motionY;
      const saved = this.jumpMovementFactor;
      this.jumpMovementFactor = this.capabilities.getFlySpeed();
      super.moveEntityWithHeading(strafe, forward);
      this.motionY = my * 0.6;
      this.jumpMovementFactor = saved;
    } else {
      super.moveEntityWithHeading(strafe, forward);
    }
  }

  protected override fall(dist: number): void {
    if (!this.capabilities.allowFlying) super.fall(dist);
  }

  canCurrentToolHarvestBlock(x: number, y: number, z: number): boolean {
    if (this.capabilities.allowEdit) return true;
    const id = this.worldObj.getBlockId(x, y, z);
    void id;
    return false;
  }

  canPlayerEdit(_x: number, _y: number, _z: number, _side: number, _stack: ItemStack | null): boolean {
    return this.capabilities.allowEdit;
  }

  protected override canTriggerWalking(): boolean {
    return !this.capabilities.isFlying;
  }

  override getEntityName(): string {
    return this.username;
  }

  sendPlayerAbilities(): void {}

  addChatMessage(_msg: string): void {}

  /** Entities this player collided with (Entity.onCollideWithPlayer) are handled by them. */
  interactWith(e: Entity): boolean {
    return e.interact(this);
  }
}
