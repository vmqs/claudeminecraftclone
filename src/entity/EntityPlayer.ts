import type { Block } from '../block/Block';
import { Material } from '../block/Material';
import { Vec3 } from '../core/Vec3';
import { EnumAction } from '../item/Item';
import { getServer } from '../command/CommandServer';
import type { ICommandSender } from '../command/ICommandSender';
import { I18n } from '../core/I18n';
import { MathHelper } from '../core/MathHelper';
import type { Container } from '../gui/inventory/Container';
import { ContainerPlayer } from '../gui/inventory/ContainerPlayer';
import type { IInventory } from '../gui/inventory/IInventory';
import type { ItemStack } from '../item/ItemStack';
import type { TileEntity } from '../world/tileentity/TileEntity';
import type { World } from '../world/World';
import { type DamageSource, EntityDamageSource } from './DamageSource';
import type { Entity } from './Entity';
import { ChunkCoordinates, EntityLiving } from './EntityLiving';
import { EntityList } from './EntityList';
import { InventoryPlayer } from './InventoryPlayer';
import { PlayerCapabilities } from './PlayerCapabilities';
import { PotionId } from './PotionEffects';

const f = Math.fround;
const PI_F = f(Math.PI);

/** A player: inventory, capabilities (creative flying), camera bob and eye height. */
export abstract class EntityPlayer extends EntityLiving implements ICommandSender {
  inventory: InventoryPlayer;
  private score = 0;
  experienceLevel = 0;
  experienceTotal = 0;
  /** Progress towards the next level, 0..1. */
  experience = 0;
  /** The player's own inventory window; openContainer is it whenever no other window is open. */
  inventoryContainer: Container;
  openContainer: Container;
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
    this.inventoryContainer = new ContainerPlayer(this.inventory, !world.isRemote, this);
    this.openContainer = this.inventoryContainer;
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
      const held = this.inventory.getCurrentItem();
      if (held !== this.itemInUse) {
        this.clearItemInUse();
      } else {
        if (this.itemInUseCount <= 25 && this.itemInUseCount % 4 === 0) this.updateItemUse(held, 5);
        if (--this.itemInUseCount === 0) this.onItemUseFinish();
      }
    }
    super.onUpdate();
    if (!this.worldObj.isRemote && !this.openContainer.canInteractWith(this)) {
      this.closeScreen();
      this.openContainer = this.inventoryContainer;
    }
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

  /** Drinking sounds, or eating sounds and crumbs of the food's icon in front of the face. */
  protected updateItemUse(stack: ItemStack, crumbs: number): void {
    const action = stack.getItemUseAction();
    if (action === EnumAction.drink) this.playSound('random.drink', f(0.5), f(f(this.worldObj.rand.nextFloat() * f(0.1)) + f(0.9)));
    if (action !== EnumAction.eat) return;
    for (let i = 0; i < crumbs; i++) {
      const v = new Vec3((this.rand.nextFloat() - 0.5) * 0.1, Math.random() * 0.1 + 0.1, 0);
      v.rotateAroundX(f(f(-this.rotationPitch * PI_F) / 180));
      v.rotateAroundY(f(f(-this.rotationYaw * PI_F) / 180));
      let p = new Vec3((this.rand.nextFloat() - 0.5) * 0.3, -this.rand.nextFloat() * 0.6 - 0.3, 0.6);
      p.rotateAroundX(f(f(-this.rotationPitch * PI_F) / 180));
      p.rotateAroundY(f(f(-this.rotationYaw * PI_F) / 180));
      p = p.addVector(this.posX, this.posY + this.getEyeHeight(), this.posZ);
      this.worldObj.spawnParticle(`iconcrack_${stack.getItem().itemID}`, p.xCoord, p.yCoord, p.zCoord, v.xCoord, v.yCoord + 0.05, v.zCoord);
    }
    this.playSound('random.eat', f(f(0.5) + f(f(0.5) * this.rand.nextInt(2))), f(f(f(this.rand.nextFloat() - this.rand.nextFloat()) * f(0.2)) + 1));
  }

  /** Finished eating or drinking: the item's onEaten result replaces the held stack. */
  protected onItemUseFinish(): void {
    const using = this.itemInUse;
    if (!using) return;
    this.updateItemUse(using, 16);
    const size = using.stackSize;
    const result = using.getItem().onEaten(using, this.worldObj, this);
    if (result !== using || (result !== null && result.stackSize !== size)) {
      this.inventory.mainInventory[this.inventory.currentItem] = result;
      if (result && result.stackSize === 0) this.inventory.mainInventory[this.inventory.currentItem] = null;
    }
    this.clearItemInUse();
  }

  /**
   * The local player's own hurt and death sounds are already played locally by EntityPlayerSP
   * (the server's copies skip the player), so the status echo only replays the hurt animation.
   */
  override handleHealthUpdate(status: number): void {
    if (status === 2) {
      this.limbYaw = f(1.5);
      this.hurtResistantTime = this.maxHurtResistantTime;
      this.hurtTime = this.maxHurtTime = 10;
      this.attackedAtYaw = 0;
    } else if (status !== 3 && status !== 9) {
      super.handleHealthUpdate(status);
    }
  }

  /** Creative players are never targeted by hostile mobs (EntityAITarget.isSuitableTarget). */
  override isCreativeInvulnerable(): boolean {
    return this.capabilities.disableDamage;
  }

  protected override isDamageDisabled(): boolean {
    return this.capabilities.disableDamage;
  }

  protected override isMovementBlocked(): boolean {
    return this.getHealth() <= 0 || this.isPlayerSleeping();
  }

  override updateRidden(): void {
    const yaw = this.rotationYaw;
    const pitch = this.rotationPitch;
    super.updateRidden();
    this.prevCameraYaw = this.cameraYaw;
    this.cameraYaw = 0;
    const mount = this.ridingEntity as Entity | null;
    if (mount && EntityList.getEntityString(mount) === 'Pig') {
      // A pig steered with a carrot keeps the rider's own view.
      this.rotationPitch = pitch;
      this.rotationYaw = yaw;
      this.renderYawOffset = (mount as EntityLiving).renderYawOffset;
    }
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
    const strength = this.getActivePotionEffect(PotionId.damageBoost);
    if (strength) damage += 3 << strength.getAmplifier();
    const weakness = this.getActivePotionEffect(PotionId.weakness);
    if (weakness) damage -= 2 << weakness.getAmplifier();
    let knockback = 0;
    let enchantDamage = 0;
    const hooks = EntityPlayer.enchantmentHooks;
    if (target.isLivingEntity && hooks) {
      enchantDamage = hooks.getEnchantmentModifierLiving(this, target as EntityLiving);
      knockback += hooks.getKnockbackModifier(this, target as EntityLiving);
    }
    if (this.isSprinting()) knockback++;
    if (damage <= 0 && enchantDamage <= 0) return;
    const critical =
      this.fallDistance > 0 &&
      !this.onGround &&
      !this.isOnLadder() &&
      !this.isInWater() &&
      !this.isPotionActive(PotionId.blindness) &&
      this.ridingEntity === null &&
      target.isLivingEntity;
    if (critical && damage > 0) damage += this.rand.nextInt(Math.trunc(damage / 2) + 2);
    damage += enchantDamage;
    const fireAspect = hooks ? hooks.getFireAspectModifier(this) : 0;
    let litByAspect = false;
    if (target.isLivingEntity && fireAspect > 0 && !target.isBurning()) {
      litByAspect = true;
      target.setFire(1);
    }
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
    const victim = target.getMultiPartOwner() ?? target;
    if (held && victim.isLivingEntity) {
      held.hitEntity(victim as EntityLiving, this);
      if (held.stackSize <= 0) this.destroyCurrentEquippedItem();
    }
    if (target.isLivingEntity) {
      if (fireAspect > 0 && hit) target.setFire(fireAspect * 4);
      else if (litByAspect) target.extinguish();
    }
  }

  /** Weapon enchantments (EnchantmentHelper), installed by the enchantment code; null = none. */
  static enchantmentHooks: {
    getEnchantmentModifierLiving(attacker: EntityLiving, target: EntityLiving): number;
    getKnockbackModifier(attacker: EntityLiving, target: EntityLiving): number;
    getFireAspectModifier(attacker: EntityLiving): number;
  } | null = null;

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

  /** Closes any container window (EntityPlayerSP also closes the screen). */
  closeScreen(): void {
    this.openContainer = this.inventoryContainer;
  }

  /** The death message goes to chat; the inventory drops unless keepInventory; the body falls over. */
  override onDeath(src: DamageSource): void {
    getServer()?.sendChatMsg(src.getDeathMessage(this));
    super.onDeath(src);
    this.setSize(f(0.2), f(0.2));
    this.setPosition(this.posX, this.posY, this.posZ);
    this.motionY = f(0.1);
    if (!this.worldObj.worldInfo.gameRules.keepInventory) this.inventory.dropAllItems();
    const a = f((f(this.attackedAtYaw + this.rotationYaw) * PI_F) / 180);
    this.motionX = f(-MathHelper.cos(a) * f(0.1));
    this.motionZ = f(-MathHelper.sin(a) * f(0.1));
    this.yOffset = f(0.1);
  }

  override addToPlayerScore(_e: Entity, n: number): void {
    this.score += n;
  }

  getScore(): number {
    return this.score;
  }

  /** The Respawn button (EntityClientPlayerMP sent Packet205ClientCommand). */
  respawnPlayer(): void {}

  override setDead(): void {
    super.setDead();
    this.inventoryContainer.onCraftGuiClosed(this);
    this.openContainer.onCraftGuiClosed(this);
  }

  // Block and entity GUIs. Blocks call these; EntityPlayerSP opens the screens that exist.
  displayGUIChest(_inv: IInventory): void {}
  displayGUIHopper(_hopper: IInventory): void {}
  displayGUIHopperMinecart(_cart: IInventory): void {}
  displayGUIEnchantment(_x: number, _y: number, _z: number, _customName: string | null): void {}
  displayGUIAnvil(_x: number, _y: number, _z: number): void {}
  displayGUIWorkbench(_x: number, _y: number, _z: number): void {}
  displayGUIFurnace(_furnace: IInventory): void {}
  displayGUIDispenser(_dispenser: IInventory): void {}
  displayGUIEditSign(_te: TileEntity): void {}
  displayGUIBrewingStand(_stand: IInventory): void {}
  displayGUIBeacon(_beacon: IInventory): void {}
  displayGUIMerchant(_merchant: object, _customName: string | null): void {}
  displayGUIBook(_stack: ItemStack): void {}

  /** Shows a translated message (a lang key) in this player's chat. */
  addChatMessage(_key: string): void {}

  getCommandSenderName(): string {
    return this.username;
  }

  sendChatToPlayer(_msg: string): void {}

  /** Worlds are always created with "Allow Cheats" on, so every command is allowed. */
  canCommandSenderUseCommand(_level: number, _command: string): boolean {
    return true;
  }

  translateString(key: string, ...args: unknown[]): string {
    return I18n.translateToLocalFormatted(key, ...args);
  }

  /** EntityPlayerMP.getPlayerCoordinates: the block at the feet, rounded up from half a block. */
  getPlayerCoordinates(): ChunkCoordinates {
    return new ChunkCoordinates(MathHelper.floor_double(this.posX), MathHelper.floor_double(this.boundingBox.minY + 0.5), MathHelper.floor_double(this.posZ));
  }

  /** 0 full chat, 1 commands only, 2 hidden (the client's chat setting). */
  getChatVisibility(): number {
    return 0;
  }

  /** NetServerHandler.setPlayerLocation: moves the feet to (x, y, z) and stops the player. */
  setPlayerLocation(x: number, y: number, z: number, yaw: number, pitch: number): void {
    this.motionX = this.motionY = this.motionZ = 0;
    this.ySize = 0;
    this.setLocationAndAngles(x, y, z, yaw, pitch);
    this.prevRotationYaw = this.rotationYaw;
    this.prevRotationPitch = this.rotationPitch;
  }

  override setPositionAndUpdate(x: number, y: number, z: number): void {
    this.setPlayerLocation(x, y, z, this.rotationYaw, this.rotationPitch);
  }

  /**
   * Right click on an entity: the entity's own interaction (mounting, milking, taming...), or the
   * held item's (shears, saddles, dyes, name tags); a Creative player uses a copy of the stack.
   */
  interactWith(e: Entity): boolean {
    if (e.interact(this)) return true;
    let held = this.getCurrentEquippedItem();
    if (held && e.isLivingEntity) {
      if (this.capabilities.isCreativeMode) held = held.copy();
      if (held.getItem().itemInteractionForEntity(held, e as EntityLiving)) {
        if (held.stackSize <= 0 && !this.capabilities.isCreativeMode) this.destroyCurrentEquippedItem();
        return true;
      }
    }
    return false;
  }

  /** Right-clicking the entity being ridden gets off it (unmountEntity), anything else mounts. */
  override mountEntity(e: Entity | null): void {
    if (this.ridingEntity === e && e !== null) {
      this.unmountEntity(e);
      if (this.ridingEntity) this.ridingEntity.riddenByEntity = null;
      this.ridingEntity = null;
    } else {
      super.mountEntity(e);
    }
  }
}
