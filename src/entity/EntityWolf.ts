import { ItemIds } from '../block/BlockIds';
import { MathHelper } from '../core/MathHelper';
import { getBlockFromDye } from '../item/ItemDye';
import { Item } from '../item/Item';
import { ItemFood } from '../item/ItemFood';
import type { ItemStack } from '../item/ItemStack';
import type { World } from '../world/World';
import { EntityAIAttackOnCollide } from './ai/EntityAIAttackOnCollide';
import { EntityAIBeg } from './ai/EntityAIBeg';
import { EntityAIFollowOwner } from './ai/EntityAIFollowOwner';
import { EntityAIHurtByTarget } from './ai/EntityAIHurtByTarget';
import { EntityAILeapAtTarget } from './ai/EntityAILeapAtTarget';
import { EntityAILookIdle } from './ai/EntityAILookIdle';
import { EntityAIMate } from './ai/EntityAIMate';
import { EntityAIOwnerHurtByTarget } from './ai/EntityAIOwnerHurtByTarget';
import { EntityAIOwnerHurtTarget } from './ai/EntityAIOwnerHurtTarget';
import { EntityAISwimming } from './ai/EntityAISwimming';
import { EntityAITargetNonTamed } from './ai/EntityAITargetNonTamed';
import { EntityAIWander } from './ai/EntityAIWander';
import { EntityAIWatchClosest } from './ai/EntityAIWatchClosest';
import { DamageSource } from './DamageSource';
import type { Entity } from './Entity';
import type { EntityAgeable } from './EntityAgeable';
import type { EntityAnimal } from './EntityAnimal';
import type { EntityLiving } from './EntityLiving';
import { EntityList } from './EntityList';
import type { EntityPlayer } from './EntityPlayer';
import { EntityTameable } from './EntityTameable';
import type { TagCompound } from '../item/ItemStack';
import { NBT } from '../world/storage/NBT';

const f = Math.fround;
const PI_F = f(Math.PI);

const isSheep = (e: Entity): e is EntityLiving => EntityList.getEntityString(e) === 'Sheep';

/**
 * The wolf (EntityWolf): 8 health wild, 20 tamed. Tamed with bones (1 in 3), told to sit, healed
 * with meat, collar dyed; follows its owner (teleporting when far), fights what hurts or is hit by
 * its owner, hunts sheep while wild, turns angry (red eyes) when a player attacks it, begs with a
 * head tilt, and shakes itself dry after leaving water.
 */
export class EntityWolf extends EntityTameable {
  /** field_70926_e / field_70924_f: the begging head tilt (0..1) and its previous value. */
  private headRotationCourse = 0;
  private headRotationCourseOld = 0;
  /** isShaking: wet; field_70928_h: the shake animation is running. */
  private isShaking = false;
  private isShakingAnim = false;
  private timeWolfIsShaking = 0;
  private prevTimeWolfIsShaking = 0;
  /** DataWatcher 16 bit 2 (angry), 18 (health copy for the tail), 19 (begging), 20 (collar colour). */
  private angry = false;
  private dataHealth: number;
  private begging = false;
  private collarColor = getBlockFromDye(1);

  constructor(world: World) {
    super(world);
    this.texture = '/mob/wolf.png';
    this.setSize(f(0.6), f(0.8));
    this.moveSpeed = f(0.3);
    this.dataHealth = this.getHealth();
    this.getNavigator().setAvoidsWater(true);
    this.tasks.addTask(1, new EntityAISwimming(this));
    this.tasks.addTask(2, this.aiSit);
    this.tasks.addTask(3, new EntityAILeapAtTarget(this, f(0.4)));
    this.tasks.addTask(4, new EntityAIAttackOnCollide(this, this.moveSpeed, true));
    this.tasks.addTask(5, new EntityAIFollowOwner(this, this.moveSpeed, 10, 2));
    this.tasks.addTask(6, new EntityAIMate(this, this.moveSpeed));
    this.tasks.addTask(7, new EntityAIWander(this, this.moveSpeed));
    this.tasks.addTask(8, new EntityAIBeg(this, 8));
    this.tasks.addTask(9, new EntityAIWatchClosest(this, 'player', 8));
    this.tasks.addTask(9, new EntityAILookIdle(this));
    this.targetTasks.addTask(1, new EntityAIOwnerHurtByTarget(this));
    this.targetTasks.addTask(2, new EntityAIOwnerHurtTarget(this));
    this.targetTasks.addTask(3, new EntityAIHurtByTarget(this, true));
    this.targetTasks.addTask(4, new EntityAITargetNonTamed(this, isSheep, 16, 200, false));
  }

  protected override isAIEnabled(): boolean {
    return true;
  }

  /** Targeting a player makes the wolf angry. */
  override setAttackTarget(e: EntityLiving | null): void {
    super.setAttackTarget(e);
    if (e && e.isPlayerEntity) this.setAngry(true);
  }

  protected override updateAITick(): void {
    this.dataHealth = this.getHealth();
  }

  getMaxHealth(): number {
    return this.isTamed() ? 20 : 8;
  }

  protected override playStepSound(_x: number, _y: number, _z: number, _id: number): void {
    this.playSound('mob.wolf.step', f(0.15), 1);
  }

  override getTexture(): string {
    if (this.isTamed()) return '/mob/wolf_tame.png';
    return this.isAngry() ? '/mob/wolf_angry.png' : super.getTexture();
  }

  protected override canDespawn(): boolean {
    return this.isAngry() && !this.isTamed();
  }

  protected override getLivingSound(): string | null {
    if (this.isAngry()) return 'mob.wolf.growl';
    if (this.rand.nextInt(3) === 0) return this.isTamed() && this.dataHealth < 10 ? 'mob.wolf.whine' : 'mob.wolf.panting';
    return 'mob.wolf.bark';
  }

  protected override getHurtSound(): string | null {
    return 'mob.wolf.hurt';
  }

  protected override getDeathSound(): string | null {
    return 'mob.wolf.death';
  }

  protected override getSoundVolume(): number {
    return f(0.4);
  }

  protected override getDropItemId(): number {
    return -1;
  }

  override onLivingUpdate(): void {
    super.onLivingUpdate();
    if (this.isShaking && !this.isShakingAnim && !this.hasPath() && this.onGround) {
      this.isShakingAnim = true;
      this.timeWolfIsShaking = 0;
      this.prevTimeWolfIsShaking = 0;
      this.worldObj.setEntityState(this, 8);
    }
  }

  override onUpdate(): void {
    super.onUpdate();
    this.headRotationCourseOld = this.headRotationCourse;
    if (this.isBegging()) this.headRotationCourse = f(this.headRotationCourse + f(f(1 - this.headRotationCourse) * f(0.4)));
    else this.headRotationCourse = f(this.headRotationCourse + f(f(0 - this.headRotationCourse) * f(0.4)));
    if (this.isBegging()) this.numTicksToChaseTarget = 10;
    if (this.isWet()) {
      this.isShaking = true;
      this.isShakingAnim = false;
      this.timeWolfIsShaking = 0;
      this.prevTimeWolfIsShaking = 0;
    } else if ((this.isShaking || this.isShakingAnim) && this.isShakingAnim) {
      if (this.timeWolfIsShaking === 0) {
        // The server's wolf and the client's both ran this; only the server's sound was heard.
        this.playSound('mob.wolf.shake', this.getSoundVolume(), f(f(f(this.rand.nextFloat() - this.rand.nextFloat()) * f(0.2)) + 1));
      }
      this.prevTimeWolfIsShaking = this.timeWolfIsShaking;
      this.timeWolfIsShaking = f(this.timeWolfIsShaking + f(0.05));
      if (this.prevTimeWolfIsShaking >= 2) {
        this.isShaking = false;
        this.isShakingAnim = false;
        this.prevTimeWolfIsShaking = 0;
        this.timeWolfIsShaking = 0;
      }
      if (this.timeWolfIsShaking > f(0.4)) {
        const y = f(this.boundingBox.minY);
        const n = Math.trunc(f(MathHelper.sin(f(f(this.timeWolfIsShaking - f(0.4)) * PI_F)) * 7));
        for (let i = 0; i < n; i++) {
          const dx = f(f(f(this.rand.nextFloat() * 2) - 1) * this.width * f(0.5));
          const dz = f(f(f(this.rand.nextFloat() * 2) - 1) * this.width * f(0.5));
          this.worldObj.spawnParticle('splash', this.posX + dx, f(y + f(0.8)), this.posZ + dz, this.motionX, this.motionY, this.motionZ);
        }
      }
    }
  }

  getWolfShaking(): boolean {
    return this.isShaking;
  }

  /** Darkening of the wet fur while shaking (0.75 .. 1). */
  getShadingWhileShaking(pt: number): number {
    return f(f(0.75) + f(f(f(this.prevTimeWolfIsShaking + f(f(this.timeWolfIsShaking - this.prevTimeWolfIsShaking) * pt)) / 2) * f(0.25)));
  }

  getShakeAngle(pt: number, offset: number): number {
    let k = f(f(f(this.prevTimeWolfIsShaking + f(f(this.timeWolfIsShaking - this.prevTimeWolfIsShaking) * pt)) + offset) / f(1.8));
    if (k < 0) k = 0;
    else if (k > 1) k = 1;
    return f(f(f(MathHelper.sin(f(k * PI_F)) * MathHelper.sin(f(f(k * PI_F) * 11))) * f(0.15)) * PI_F);
  }

  /** The begging head tilt angle. */
  getInterestedAngle(pt: number): number {
    return f(f(f(this.headRotationCourseOld + f(f(this.headRotationCourse - this.headRotationCourseOld) * pt)) * f(0.15)) * PI_F);
  }

  override getEyeHeight(): number {
    return f(this.height * f(0.8));
  }

  override getVerticalFaceSpeed(): number {
    return this.isSitting() ? 20 : super.getVerticalFaceSpeed();
  }

  /** Damage from anything but players and arrows is halved (rounded up); being hit stands it up. */
  override attackEntityFrom(src: DamageSource, amount: number): boolean {
    if (this.isEntityInvulnerable()) return false;
    const attacker = src.getEntity();
    this.aiSit.setSitting(false);
    if (attacker && !attacker.isPlayerEntity && EntityList.getEntityString(attacker) !== 'Arrow') amount = (amount + 1) >> 1;
    return super.attackEntityFrom(src, amount);
  }

  /** Bites for 2 (4 when tamed). */
  override attackEntityAsMob(e: Entity): boolean {
    return e.attackEntityFrom(DamageSource.causeMobDamage(this), this.isTamed() ? 4 : 2);
  }

  override interact(player: EntityPlayer): boolean {
    const held = player.inventory.getCurrentItem();
    if (this.isTamed()) {
      if (held) {
        const item = Item.itemsList[held.itemID];
        if (item instanceof ItemFood) {
          if (item.isWolfsFavoriteMeat() && this.dataHealth < 20) {
            if (!player.capabilities.isCreativeMode) held.stackSize--;
            this.heal(item.getHealAmount());
            if (held.stackSize <= 0) player.inventory.setInventorySlotContents(player.inventory.currentItem, null);
            return true;
          }
        } else if (held.itemID === ItemIds.dyePowder) {
          const color = getBlockFromDye(held.getItemDamage());
          if (color !== this.getCollarColor()) {
            this.setCollarColor(color);
            if (!player.capabilities.isCreativeMode && --held.stackSize <= 0) player.inventory.setInventorySlotContents(player.inventory.currentItem, null);
            return true;
          }
        }
      }
      if (player.username.toLowerCase() === this.getOwnerName().toLowerCase() && !(held && this.isBreedingItem(held))) {
        this.aiSit.setSitting(!this.isSitting());
        this.isJumping = false;
        this.setPathToEntity(null);
      }
    } else if (held && held.itemID === ItemIds.bone && !this.isAngry()) {
      if (!player.capabilities.isCreativeMode) held.stackSize--;
      if (held.stackSize <= 0) player.inventory.setInventorySlotContents(player.inventory.currentItem, null);
      if (this.rand.nextInt(3) === 0) {
        this.setTamed(true);
        this.setPathToEntity(null);
        this.setAttackTarget(null);
        this.aiSit.setSitting(true);
        this.setEntityHealth(20);
        this.setOwner(player.username);
        // The server's playTameEffect is never seen; the status echo below shows the hearts.
        this.worldObj.setEntityState(this, 7);
      } else {
        this.worldObj.setEntityState(this, 6);
      }
      return true;
    }
    return super.interact(player);
  }

  /** Status 8: start the shake animation. */
  override handleHealthUpdate(status: number): void {
    if (status === 8) {
      this.isShakingAnim = true;
      this.timeWolfIsShaking = 0;
      this.prevTimeWolfIsShaking = 0;
    } else {
      super.handleHealthUpdate(status);
    }
  }

  /** The tail: raised when angry, by health when tamed, low when wild. */
  getTailRotation(): number {
    if (this.isAngry()) return f(1.5393804);
    return this.isTamed() ? f(f(f(0.55) - f((20 - this.dataHealth) * f(0.02))) * PI_F) : f(PI_F / 5);
  }

  /** Any meat a wolf likes (raw/cooked pork, beef, chicken, rotten flesh). */
  override isBreedingItem(stack: ItemStack): boolean {
    if (!stack) return false;
    const item = Item.itemsList[stack.itemID];
    return item instanceof ItemFood && item.isWolfsFavoriteMeat();
  }

  override getMaxSpawnedInChunk(): number {
    return 8;
  }

  override isTamedWolf(): boolean {
    return this.isTamed();
  }

  isAngry(): boolean {
    return this.angry;
  }

  setAngry(v: boolean): void {
    this.angry = v;
  }

  getCollarColor(): number {
    return this.collarColor & 15;
  }

  setCollarColor(c: number): void {
    this.collarColor = c & 15;
  }

  createChild(_mate: EntityAgeable): EntityAgeable {
    const pup = new EntityWolf(this.worldObj);
    const owner = this.getOwnerName();
    if (owner && owner.trim().length > 0) {
      pup.setOwner(owner);
      pup.setTamed(true);
    }
    return pup;
  }

  /** func_70918_i */
  setBegging(v: boolean): void {
    this.begging = v;
  }

  /** func_70922_bv */
  isBegging(): boolean {
    return this.begging;
  }

  /** Only two tamed, standing wolves in love mate. */
  override canMateWith(other: EntityAnimal): boolean {
    if (other === this || !this.isTamed() || !(other instanceof EntityWolf)) return false;
    if (!other.isTamed() || other.isSitting()) return false;
    return this.isInLove() && other.isInLove();
  }

  override writeEntityToNBT(tag: TagCompound): void {
    super.writeEntityToNBT(tag);
    NBT.setBoolean(tag, 'Angry', this.isAngry());
    NBT.setByte(tag, 'CollarColor', this.getCollarColor());
  }

  override readEntityFromNBT(tag: TagCompound): void {
    super.readEntityFromNBT(tag);
    this.setAngry(NBT.getBoolean(tag, 'Angry'));
    if (NBT.hasKey(tag, 'CollarColor')) this.setCollarColor(NBT.getByte(tag, 'CollarColor'));
  }
}
