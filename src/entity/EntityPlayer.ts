import { Block } from '../block/Block';
import { type BedSleepStatus, BlockBed } from '../block/BlockBed';
import { BlockDirectional } from '../block/BlockDirectional';
import { BlockIds } from '../block/BlockIds';
import { Material } from '../block/Material';
import { AxisAlignedBB } from '../core/AxisAlignedBB';
import { Vec3 } from '../core/Vec3';
import { EnumAction } from '../item/Item';
import { getServer } from '../command/CommandServer';
import { getScoreboard, ScoreObjectiveCriteria } from '../command/scoreboard/Scoreboard';
import type { ICommandSender } from '../command/ICommandSender';
import { I18n } from '../core/I18n';
import { MathHelper } from '../core/MathHelper';
import type { Container } from '../gui/inventory/Container';
import { ContainerPlayer } from '../gui/inventory/ContainerPlayer';
import type { IInventory } from '../gui/inventory/IInventory';
import type { ItemStack } from '../item/ItemStack';
import type { TileEntity } from '../world/tileentity/TileEntity';
import type { World } from '../world/World';
import { DamageSource, EntityDamageSource } from './DamageSource';
import type { Entity } from './Entity';
import { applyThorns, EnchantmentHooks } from './EnchantmentHooks';
import { ChunkCoordinates, EntityLiving } from './EntityLiving';
import { EntityList } from './EntityList';
import { CombatTracker } from './CombatTracker';
import { FoodStats } from './FoodStats';
import { EnumGameType } from '../world/EnumGameType';
import { EntityMob } from './EntityMob';
import { InventoryPlayer } from './InventoryPlayer';
import { PlayerCapabilities } from './PlayerCapabilities';
import { PotionId } from './PotionEffects';

const f = Math.fround;

/** The parts of a tame wolf (EntityWolf / EntityTameable) that alertWolves uses. */
interface WolfLike {
  isTamed(): boolean;
  getOwnerName(): string;
  isSitting(): boolean;
  setSitting(sitting: boolean): void;
  getEntityToAttack(): Entity | null;
  setTarget(e: Entity | null): void;
}
const PI_F = f(Math.PI);

/** A player: inventory, capabilities (creative flying), camera bob and eye height. */
export abstract class EntityPlayer extends EntityLiving implements ICommandSender {
  inventory: InventoryPlayer;
  private score = 0;
  experienceLevel = 0;
  experienceTotal = 0;
  /** Progress towards the next level, 0..1. */
  experience = 0;
  /** The bobber of this player's cast fishing rod (EntityFishHook), if any. */
  fishEntity: Entity | null = null;
  /** Ticks until the next experience orb can be collected. */
  xpCooldown = 0;
  /** ticksExisted of the last level-up sound (field_82249_h). */
  private lastLevelUpTick = 0;
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
  /** Hunger, saturation and exhaustion (FoodStats). */
  protected foodStats = new FoodStats();
  /** Recent damage, for the death message (CombatTracker). */
  readonly combatTracker: CombatTracker = new CombatTracker(this);
  /** The game mode the server keeps for this player (ItemInWorldManager.gameType). */
  gameType: EnumGameType = EnumGameType.NOT_SET;
  /** Ticks of spawn protection left (EntityPlayerMP.initialInvulnerability): only the void hurts. */
  initialInvulnerability = 60;
  /** onGround and posY when the last tick ended: the server's view, used for jump exhaustion. */
  private serverOnGround = false;
  private serverPosY = 0;

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
  /** Starts using an item; the eating flag is what other players' clients see of it. */
  setItemInUse(stack: ItemStack | null, count: number): void {
    if (stack !== this.itemInUse) {
      this.itemInUse = stack;
      this.itemInUseCount = count;
      if (!this.isClientSide()) this.setEating(true);
    }
  }
  clearItemInUse(): void {
    this.itemInUse = null;
    this.itemInUseCount = 0;
    if (!this.isClientSide()) this.setEating(false);
  }
  stopUsingItem(): void {
    if (this.itemInUse) this.itemInUse.onPlayerStoppedUsing(this.worldObj, this, this.itemInUseCount);
    this.clearItemInUse();
  }

  /**
   * This copy of the player is a client's (a guest's world, or another player shown from the
   * network): server rules (hunger, item use finishing, spawn protection, container checks,
   * waking up by day) are left to the side that owns the player.
   */
  isClientSide(): boolean {
    return this.worldObj.isRemote;
  }

  override onUpdate(): void {
    if (!this.isClientSide()) this.initialInvulnerability--;
    if (this.itemInUse) {
      const held = this.inventory.getCurrentItem();
      if (held !== this.itemInUse) {
        this.clearItemInUse();
      } else {
        if (this.itemInUseCount <= 25 && this.itemInUseCount % 4 === 0) this.updateItemUse(held, 5);
        if (--this.itemInUseCount === 0 && !this.isClientSide()) this.onItemUseFinish();
      }
    }
    if (this.xpCooldown > 0) this.xpCooldown--;
    this.updateSleepTimer();
    super.onUpdate();
    if (!this.isClientSide() && !this.openContainer.canInteractWith(this)) {
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
    if (!this.isClientSide()) {
      // NetServerHandler.handleFlying: leaving the ground upwards costs 0.2 (also for sprint jumps).
      if (this.serverOnGround && !this.onGround && this.posY - this.serverPosY > 0) this.addExhaustion(f(0.2));
      this.serverOnGround = this.onGround;
      this.serverPosY = this.posY;
      this.foodStats.onUpdate(this);
    }
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
    // Peaceful regeneration; the original's `ticksExisted % 20 * 12 == 0` means every 20 ticks.
    if (this.worldObj.difficultySetting === 0 && this.getHealth() < this.getMaxHealth() && this.ticksExisted % 20 === 0) this.heal(1);
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
    // Picking things up is the server's (EntityItem and friends check isRemote in 1.5.2).
    if (this.getHealth() > 0 && !this.worldObj.isRemote) {
      const list = this.worldObj.getEntitiesWithinAABBExcludingEntity(this, this.boundingBox.expand(1, 0.5, 1));
      for (const e of list) if (!e.isDead) e.onCollideWithPlayer(this);
    }
  }

  /**
   * Digging speed against `b`: the held tool, efficiency (only for a tool that already helps),
   * haste / mining fatigue (20% per level), and a fifth under water (without aqua affinity) or
   * in the air.
   */
  getCurrentPlayerStrVsBlock(b: Block, _canHarvest: boolean): number {
    let s = this.inventory.getStrVsBlock(b);
    if (s > 1) {
      const eff = EnchantmentHooks.efficiency?.(this) ?? 0;
      const held = this.inventory.getCurrentItem();
      if (eff > 0 && held) {
        const bonus = f(eff * eff + 1);
        if (!held.canHarvestBlock(b) && !(s > 1)) s = f(s + f(bonus * f(0.08)));
        else s = f(s + bonus);
      }
    }
    const haste = this.getActivePotionEffect(PotionId.digSpeed);
    if (haste) s = f(s * f(1 + f((haste.getAmplifier() + 1) * f(0.2))));
    const fatigue = this.getActivePotionEffect(PotionId.digSlowdown);
    if (fatigue) s = f(s * f(1 - f((fatigue.getAmplifier() + 1) * f(0.2))));
    if (this.isInsideOfMaterial(Material.water) && !(EnchantmentHooks.aquaAffinity?.(this) ?? false)) s = f(s / 5);
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

  /**
   * Creative players only take void and /kill damage. Mob-caused damage is scaled by
   * difficulty (none on Peaceful, half+1 on Easy, x1.5 on Hard), and whoever hurt the player
   * (an arrow's shooter) is set upon by the player's tame wolves.
   */
  override attackEntityFrom(src: DamageSource, amount: number): boolean {
    if (this.isEntityInvulnerable()) return false;
    if (this.initialInvulnerability > 0 && src !== DamageSource.outOfWorld && !this.isClientSide()) return false;
    if (this.capabilities.disableDamage && !src.canHarmInCreative()) return false;
    this.entityAge = 0;
    if (this.getHealth() <= 0) return false;
    if (this.isPlayerSleeping() && !this.isClientSide()) this.wakeUpPlayer(true, true, false);
    if (src.isDifficultyScaled()) {
      const diff = this.worldObj.difficultySetting;
      if (diff === 0) amount = 0;
      if (diff === 1) amount = Math.trunc(amount / 2) + 1;
      if (diff === 3) amount = Math.trunc((amount * 3) / 2);
    }
    if (amount === 0) return false;
    let attacker = src.getEntity();
    const shooter = attacker ? (attacker as Entity & { shootingEntity?: Entity | null }).shootingEntity : null;
    if (attacker && EntityList.getEntityString(attacker) === 'Arrow' && shooter) attacker = shooter;
    if (attacker && attacker.isLivingEntity) this.alertWolves(attacker as EntityLiving, false);
    return super.attackEntityFrom(src, amount);
  }

  // ------------------------------------------------------------------ sleeping in beds

  /** Lying in a bed. */
  protected sleeping = false;
  /** The head block of the bed slept in (playerLocation). */
  playerLocation: ChunkCoordinates | null = null;
  /** Ticks asleep (up to 100); after waking it runs on from 100 to 110 while the dark fades. */
  protected sleepTimer = 0;
  /** Offset of the lying body from the bed (field_71079_bU, field_71082_cx, field_71089_bV). */
  sleepOffsetX = 0;
  sleepOffsetY = 0;
  sleepOffsetZ = 0;
  /** The respawn point set by a bed or /spawnpoint, and whether it needs no bed (spawnForced). */
  protected spawnChunk: ChunkCoordinates | null = null;
  protected spawnForced = false;

  /** The sleep part of onUpdate: count the sleep, and get up when the bed is gone or it is day. */
  private updateSleepTimer(): void {
    if (this.isPlayerSleeping()) {
      this.sleepTimer++;
      if (this.sleepTimer > 100) this.sleepTimer = 100;
      if (!this.isClientSide()) {
        if (!this.isInBed()) this.wakeUpPlayer(true, true, false);
        else if (this.worldObj.isDaytime()) this.wakeUpPlayer(false, true, true);
      }
    } else if (this.sleepTimer > 0) {
      this.sleepTimer++;
      if (this.sleepTimer >= 110) this.sleepTimer = 0;
    }
  }

  /**
   * Lies down in the bed whose head is at (x, y, z). Refused while asleep or dead, outside a
   * surface world, by day ("You can only sleep at night"), more than 3 blocks away (2 up/down,
   * measured from the feet like the server's player) and with any EntityMob within 8 blocks
   * (5 up/down): "You may not rest now, there are monsters nearby" holds in Creative too.
   */
  sleepInBedAt(x: number, y: number, z: number): BedSleepStatus {
    const w = this.worldObj;
    if (!w.isRemote) {
      if (this.isPlayerSleeping() || !this.isEntityAlive()) return 'OTHER_PROBLEM';
      if (!w.provider.isSurfaceWorld()) return 'NOT_POSSIBLE_HERE';
      if (w.isDaytime()) return 'NOT_POSSIBLE_NOW';
      if (Math.abs(this.posX - x) > 3 || Math.abs(this.boundingBox.minY - y) > 2 || Math.abs(this.posZ - z) > 3) return 'TOO_FAR_AWAY';
      const box = AxisAlignedBB.getBoundingBox(x - 8, y - 5, z - 8, x + 8, y + 5, z + 8);
      if (w.getEntitiesWithinAABB((e): e is EntityMob => e instanceof EntityMob, box).length > 0) return 'NOT_SAFE';
    }
    this.lieDownInBed(x, y, z);
    if (!w.isRemote) {
      w.updateAllPlayersSleepingFlag();
      w.netEvents?.playerSleep(this, x, y, z);
    }
    return 'OK';
  }

  /** The unchecked part of sleepInBedAt (what a client does on Packet17Sleep): lie down in the bed at (x, y, z). */
  protected lieDownInBed(x: number, y: number, z: number): void {
    const w = this.worldObj;
    this.setSize(f(0.2), f(0.2));
    this.yOffset = f(0.2);
    if (w.blockExists(x, y, z)) {
      const dir = BlockDirectional.getDirection(w.getBlockMetadata(x, y, z));
      let ox = f(0.5);
      let oz = f(0.5);
      if (dir === 0) oz = f(0.9);
      else if (dir === 1) ox = f(0.1);
      else if (dir === 2) oz = f(0.1);
      else if (dir === 3) ox = f(0.9);
      this.setSleepOffset(dir);
      this.setPosition(f(x + ox), f(y + f(0.9375)), f(z + oz));
    } else {
      this.setPosition(f(x + f(0.5)), f(y + f(0.9375)), f(z + f(0.5)));
    }
    this.sleeping = true;
    this.sleepTimer = 0;
    this.playerLocation = new ChunkCoordinates(x, y, z);
    this.motionX = this.motionZ = this.motionY = 0;
  }

  /** func_71013_b: the body lies 1.8 blocks towards the foot of a bed facing `dir`. */
  private setSleepOffset(dir: number): void {
    this.sleepOffsetX = 0;
    this.sleepOffsetZ = 0;
    if (dir === 0) this.sleepOffsetZ = f(-1.8);
    else if (dir === 1) this.sleepOffsetX = f(1.8);
    else if (dir === 2) this.sleepOffsetZ = f(1.8);
    else if (dir === 3) this.sleepOffsetX = f(-1.8);
  }

  /**
   * Gets up: full size again, standing on a free spot next to the bed (or on top of it), the bed
   * marked free. `immediately` skips the fade of the dark overlay, `updateWorld` refreshes the
   * world's everyone-asleep flag, `setSpawn` makes the bed this player's spawn point.
   */
  wakeUpPlayer(immediately: boolean, updateWorld: boolean, setSpawn: boolean): void {
    if (this.sleeping && !this.worldObj.isRemote) this.worldObj.netEvents?.playerWake(this);
    this.setSize(f(0.6), f(1.8));
    this.resetHeight();
    const bed = this.playerLocation;
    const w = this.worldObj;
    if (bed && w.getBlockId(bed.posX, bed.posY, bed.posZ) === BlockIds.bed) {
      BlockBed.setBedOccupied(w, bed.posX, bed.posY, bed.posZ, false);
      const spot = BlockBed.getNearestEmptyChunkCoordinates(w, bed.posX, bed.posY, bed.posZ, 0) ?? { posX: bed.posX, posY: bed.posY + 1, posZ: bed.posZ };
      this.setPosition(f(spot.posX + f(0.5)), f(f(spot.posY + this.yOffset) + f(0.1)), f(spot.posZ + f(0.5)));
    }
    this.sleeping = false;
    if (!w.isRemote && updateWorld) w.updateAllPlayersSleepingFlag();
    this.sleepTimer = immediately ? 0 : 100;
    if (setSpawn) this.setSpawnChunk(this.playerLocation, false);
  }

  /** The bed slept in is still there. */
  private isInBed(): boolean {
    const bed = this.playerLocation;
    return !!bed && this.worldObj.getBlockId(bed.posX, bed.posY, bed.posZ) === BlockIds.bed;
  }

  /**
   * Where a player with spawn point `c` respawns: next to the bed if it still stands there, or
   * on `c` itself for a forced (/spawnpoint) spawn with room for the player; null when the bed
   * is gone ("Your home bed was missing or obstructed").
   */
  static verifyRespawnCoordinates(w: World, c: ChunkCoordinates, forced: boolean): ChunkCoordinates | null {
    if (w.getBlockId(c.posX, c.posY, c.posZ) === BlockIds.bed) {
      const spot = BlockBed.getNearestEmptyChunkCoordinates(w, c.posX, c.posY, c.posZ, 0);
      return spot ? new ChunkCoordinates(spot.posX, spot.posY, spot.posZ) : null;
    }
    const feet = w.getBlockMaterial(c.posX, c.posY, c.posZ);
    const head = w.getBlockMaterial(c.posX, c.posY + 1, c.posZ);
    const feetFree = !feet.isSolid() && !feet.isLiquid();
    const headFree = !head.isSolid() && !head.isLiquid();
    return forced && feetFree && headFree ? c : null;
  }

  /** The yaw the lying body faces, from the bed's direction. */
  getBedOrientationInDegrees(): number {
    const bed = this.playerLocation;
    if (bed) {
      const dir = BlockDirectional.getDirection(this.worldObj.getBlockMetadata(bed.posX, bed.posY, bed.posZ));
      if (dir === 0) return 90;
      if (dir === 1) return 0;
      if (dir === 2) return 270;
      if (dir === 3) return 180;
    }
    return 0;
  }

  override isPlayerSleeping(): boolean {
    return this.sleeping;
  }

  /** Slept the full 100 ticks (the night is skipped once every player has). */
  isPlayerFullyAsleep(): boolean {
    return this.sleeping && this.sleepTimer >= 100;
  }

  getSleepTimer(): number {
    return this.sleepTimer;
  }

  /** A sleeping player's small box is inside the bed, which does not suffocate. */
  override isEntityInsideOpaqueBlock(): boolean {
    return !this.sleeping && super.isEntityInsideOpaqueBlock();
  }

  /** The spawn point from a bed or /spawnpoint (getBedLocation), or null for the world spawn. */
  getBedLocation(): ChunkCoordinates | null {
    return this.spawnChunk;
  }

  isSpawnForced(): boolean {
    return this.spawnForced;
  }

  setSpawnChunk(c: ChunkCoordinates | null, forced: boolean): void {
    if (c) {
      this.spawnChunk = new ChunkCoordinates(c.posX, c.posY, c.posZ);
      this.spawnForced = forced;
    } else {
      this.spawnChunk = null;
      this.spawnForced = false;
    }
  }

  /**
   * Sends this player's tame wolves within 16 blocks (4 up/down) after `target`, unless it is
   * a creeper, a ghast or one of the player's own wolves. When the player is the attacker
   * (`playerAttacked`) sitting wolves stay put. Wolves are matched by EntityList name and
   * duck-typed, so this works whichever class registers 'Wolf'.
   */
  protected alertWolves(target: EntityLiving, playerAttacked: boolean): void {
    const kind = EntityList.getEntityString(target);
    if (kind === 'Creeper' || kind === 'Ghast') return;
    if (kind === 'Wolf') {
      const w = target as EntityLiving & Partial<WolfLike>;
      if (w.isTamed?.() && this.username === w.getOwnerName?.()) return;
    }
    // Teams (func_96122_a) do not exist here, so other players always count.
    const box = AxisAlignedBB.getBoundingBox(this.posX, this.posY, this.posZ, this.posX + 1, this.posY + 1, this.posZ + 1).expand(16, 4, 16);
    const isWolf = (e: Entity): e is EntityLiving & WolfLike => EntityList.getEntityString(e) === 'Wolf' && typeof (e as Partial<WolfLike>).isTamed === 'function';
    for (const wolf of this.worldObj.getEntitiesWithinAABB(isWolf, box)) {
      if (wolf.isTamed() && wolf.getEntityToAttack() === null && this.username === wolf.getOwnerName() && (!playerAttacked || !wolf.isSitting())) {
        wolf.setSitting(false);
        wolf.setTarget(target);
      }
    }
  }

  /** Worn armour loses a quarter of the damage taken (at least 1) as durability. */
  protected override damageArmor(amount: number): void {
    this.inventory.damageArmor(amount);
  }

  override isBlocking(): boolean {
    return this.isUsingItem() && this.itemInUse!.getItemUseAction() === EnumAction.block;
  }

  /**
   * Blocking with a sword halves blockable damage (rounding up), then armour, resistance and
   * protection apply; every hit costs the source's hunger exhaustion.
   */
  protected override damageEntity(src: DamageSource, amount: number): void {
    if (this.isEntityInvulnerable()) return;
    if (!src.isUnblockableDamage() && this.isBlocking()) amount = (1 + amount) >> 1;
    amount = this.applyArmorCalculations(src, amount);
    amount = this.applyPotionDamageCalculations(src, amount);
    this.addExhaustion(src.getHungerDamage());
    const before = this.getHealth();
    this.setEntityHealth(this.getHealth() - amount);
    this.combatTracker.trackDamage(src, before, amount);
  }

  /** Food exhaustion from actions (FoodStats.addExhaustion); nothing while damage is disabled. */
  addExhaustion(amount: number): void {
    if (this.capabilities.disableDamage || this.isClientSide()) return;
    this.foodStats.addExhaustion(amount);
  }

  getFoodStats(): FoodStats {
    return this.foodStats;
  }

  /** Hungry (or the food is always edible) and able to take damage: Creative players never eat. */
  canEat(alwaysEdible: boolean): boolean {
    return (alwaysEdible || this.foodStats.needFood()) && !this.capabilities.disableDamage;
  }

  /** Alive and below full health (natural regeneration). */
  shouldHeal(): boolean {
    return this.getHealth() > 0 && this.getHealth() < this.getMaxHealth();
  }

  /**
   * Exhaustion for the distance covered in one tick (addMovementStat): 0.015 per metre diving or
   * swimming, 0.01 walking and 0.1 sprinting on the ground; climbing and flying are free.
   */
  addMovementStat(dx: number, dy: number, dz: number): void {
    if (this.ridingEntity !== null) return;
    const cm = (d: number) => Math.floor(f(f(f(MathHelper.sqrt_double(d)) * 100) + 0.5));
    if (this.isInsideOfMaterial(Material.water)) {
      const n = cm(dx * dx + dy * dy + dz * dz);
      if (n > 0) this.addExhaustion(f(f(f(0.015) * n) * f(0.01)));
    } else if (this.isInWater()) {
      const n = cm(dx * dx + dz * dz);
      if (n > 0) this.addExhaustion(f(f(f(0.015) * n) * f(0.01)));
    } else if (this.isOnLadder()) {
      // distanceClimbed only.
    } else if (this.onGround) {
      const n = cm(dx * dx + dz * dz);
      if (n > 0) this.addExhaustion(f(f((this.isSprinting() ? f(0.099999994) : f(0.01)) * n) * f(0.01)));
    }
  }

  /**
   * EntityPlayerMP.setGameType: the mode's capabilities, the abilities packet, and the client's
   * Packet70GameEvent 3 ("Your game mode has been updated"), which the PlayerController follows.
   */
  setGameType(type: EnumGameType): void {
    this.gameType = type;
    type.configurePlayerCapabilities(this.capabilities);
    this.sendPlayerAbilities();
    EntityPlayer.gameTypeListener?.(this, type);
    this.addChatMessage('gameMode.changed');
  }

  /** The client's half of a game-mode change (PlayerControllerMP.setGameType via Packet70). */
  static gameTypeListener: ((player: EntityPlayer, type: EnumGameType) => void) | null = null;

  /**
   * The respawned player takes over from the dead one (clonePlayer): everything when coming
   * back from the End, otherwise only the inventory and experience under keepInventory. (The
   * ender chest contents always carry over; PlayerSpawning.respawn copies them.)
   */
  clonePlayer(old: EntityPlayer, wholeState: boolean): void {
    const keep = (): void => {
      for (let i = 0; i < old.inventory.mainInventory.length; i++) this.inventory.mainInventory[i] = old.inventory.mainInventory[i];
      for (let i = 0; i < old.inventory.armorInventory.length; i++) this.inventory.armorInventory[i] = old.inventory.armorInventory[i];
      this.inventory.currentItem = old.inventory.currentItem;
      this.experienceLevel = old.experienceLevel;
      this.experienceTotal = old.experienceTotal;
      this.experience = old.experience;
      this.addScore(old.getScore() - this.getScore());
    };
    if (wholeState) {
      keep();
      this.setEntityHealth(old.getHealth());
      this.foodStats = old.foodStats;
    } else if (this.worldObj.worldInfo.gameRules.keepInventory) {
      keep();
    }
  }

  /** A dead player drops 7 experience per level (at most 100), none with keepInventory. */
  protected override getExperiencePoints(_player: EntityPlayer | null): number {
    if (this.worldObj.worldInfo.gameRules.keepInventory) return 0;
    const xp = this.experienceLevel * 7;
    return xp > 100 ? 100 : xp;
  }

  protected override isPlayer(): boolean {
    return true;
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
    if (target.isLivingEntity) {
      enchantDamage = EnchantmentHooks.modifierLiving?.(this, target as EntityLiving) ?? 0;
      knockback += EnchantmentHooks.knockback?.(this, target as EntityLiving) ?? 0;
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
    const fireAspect = EnchantmentHooks.fireAspect?.(this) ?? 0;
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
      if (target.isLivingEntity) applyThorns(this, target as EntityLiving, this.rand);
    }
    const held = this.getCurrentEquippedItem();
    const victim = target.getMultiPartOwner() ?? target;
    if (held && victim.isLivingEntity) {
      held.hitEntity(victim as EntityLiving, this);
      if (held.stackSize <= 0) this.destroyCurrentEquippedItem();
    }
    if (target.isLivingEntity) {
      if (target.isEntityAlive()) this.alertWolves(target as EntityLiving, true);
      if (fireAspect > 0 && hit) target.setFire(fireAspect * 4);
      else if (litByAspect) target.extinguish();
    }
    this.addExhaustion(f(0.3));
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
    const x = this.posX;
    const y = this.posY;
    const z = this.posZ;
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
    this.addMovementStat(this.posX - x, this.posY - y, this.posZ - z);
  }

  protected override fall(dist: number): void {
    if (!this.capabilities.allowFlying) super.fall(dist);
  }

  /** Adventure mode: only blocks that are always harvestable or that the held tool works on. */
  canCurrentToolHarvestBlock(x: number, y: number, z: number): boolean {
    if (this.capabilities.allowEdit) return true;
    const id = this.worldObj.getBlockId(x, y, z);
    const block = id > 0 ? Block.blocksList[id] : null;
    if (!block) return false;
    if (block.blockMaterial.isAlwaysHarvested()) return true;
    const held = this.getCurrentEquippedItem();
    return !!held && (held.canHarvestBlock(block) || held.getStrVsBlock(block) > 1);
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

  /** Other players' names always float above them (func_94059_bO). */
  override getAlwaysRenderNameTag(): boolean {
    return true;
  }

  sendPlayerAbilities(): void {}

  /** triggerAchievement: one more of an achievement (an `AchievementIds` id). */
  triggerAchievement(id: number): void {
    this.addStat(id, 1);
  }

  /**
   * Counts a statistic (a `StatIds` / `AchievementIds` id, see src/stats/StatIds.ts). Nothing
   * here: the local player (EntityPlayerSP) keeps its statistics, and a guest's player on the
   * host (EntityPlayerMP) sends them to the guest.
   */
  addStat(_id: number, _amount: number): void {}

  /** Closes any container window (EntityPlayerSP also closes the screen). */
  closeScreen(): void {
    this.openContainer = this.inventoryContainer;
  }

  /** The death message goes to chat; the inventory drops unless keepInventory; the body falls over. */
  override onDeath(src: DamageSource): void {
    getServer()?.sendChatMsg(this.combatTracker.getDeathMessage());
    getScoreboard(this.worldObj).increaseScores(ScoreObjectiveCriteria.deathCount, this.getEntityName());
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

  /** Also counts the kill for the totalKillCount (and, for a player, playerKillCount) objectives. */
  override addToPlayerScore(e: Entity, n: number): void {
    this.addScore(n);
    const board = getScoreboard(this.worldObj);
    const name = this.getEntityName();
    board.increaseScores(ScoreObjectiveCriteria.totalKillCount, name);
    if (e instanceof EntityPlayer) board.increaseScores(ScoreObjectiveCriteria.playerKillCount, name);
  }

  addScore(n: number): void {
    this.score += n;
  }

  /** Experience points from orbs (and /xp): fills the bar, levelling up as often as it overflows. */
  addExperience(points: number): void {
    this.addScore(points);
    const room = 2147483647 - this.experienceTotal;
    if (points > room) points = room;
    this.experience = f(this.experience + f(points / this.xpBarCap()));
    this.experienceTotal += points;
    while (this.experience >= 1) {
      this.experience = f(f(this.experience - 1) * this.xpBarCap());
      this.addExperienceLevel(1);
      this.experience = f(this.experience / this.xpBarCap());
    }
  }

  /** Adds (or removes) whole levels; every fifth level plays the level-up sound. */
  addExperienceLevel(levels: number): void {
    this.experienceLevel += levels;
    if (this.experienceLevel < 0) {
      this.experienceLevel = 0;
      this.experience = 0;
      this.experienceTotal = 0;
    }
    if (levels > 0 && this.experienceLevel % 5 === 0 && f(this.lastLevelUpTick) < f(this.ticksExisted - 100)) {
      const v = this.experienceLevel > 30 ? 1 : f(this.experienceLevel / 30);
      this.worldObj.playSoundAtEntity(this, 'random.levelup', f(v * f(0.75)), 1);
      this.lastLevelUpTick = this.ticksExisted;
    }
  }

  /** Points needed for the next level. */
  xpBarCap(): number {
    if (this.experienceLevel >= 30) return 62 + (this.experienceLevel - 30) * 7;
    return this.experienceLevel >= 15 ? 17 + (this.experienceLevel - 15) * 3 : 17;
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
