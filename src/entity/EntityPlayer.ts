import type { Block } from '../block/Block';
import { Material } from '../block/Material';
import { MathHelper } from '../core/MathHelper';
import type { ItemStack } from '../item/ItemStack';
import type { World } from '../world/World';
import type { DamageSource } from './DamageSource';
import type { Entity } from './Entity';
import { EntityLiving } from './EntityLiving';
import { InventoryPlayer } from './InventoryPlayer';
import { PlayerCapabilities } from './PlayerCapabilities';

const f = Math.fround;

/** A player: inventory, capabilities (creative flying), camera bob and eye height. */
export abstract class EntityPlayer extends EntityLiving {
  override readonly isPlayerEntity: boolean = true;
  inventory: InventoryPlayer;
  protected flyToggleTimer = 0;
  prevCameraYaw = 0;
  cameraYaw = 0;
  username = 'Player';
  /** Cape physics position (field_71091_bM...). */
  field_71091_bM = 0;
  field_71096_bN = 0;
  field_71097_bO = 0;
  field_71094_bP = 0;
  field_71095_bQ = 0;
  field_71085_bR = 0;
  capabilities = new PlayerCapabilities();
  protected speedOnGround = f(0.1);
  protected speedInAir = f(0.02);
  private itemInUse: ItemStack | null = null;
  private itemInUseCount = 0;

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

    this.field_71091_bM = this.field_71094_bP;
    this.field_71096_bN = this.field_71095_bQ;
    this.field_71097_bO = this.field_71085_bR;
    const dx = this.posX - this.field_71094_bP;
    const dy = this.posY - this.field_71095_bQ;
    const dz = this.posZ - this.field_71085_bR;
    const lim = 10;
    if (dx > lim || dx < -lim) this.field_71091_bM = this.field_71094_bP = this.posX;
    if (dz > lim || dz < -lim) this.field_71097_bO = this.field_71085_bR = this.posZ;
    if (dy > lim || dy < -lim) this.field_71096_bN = this.field_71095_bQ = this.posY;
    this.field_71094_bP += dx * 0.25;
    this.field_71085_bR += dz * 0.25;
    this.field_71095_bQ += dy * 0.25;
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
