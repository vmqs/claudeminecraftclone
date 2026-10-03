import { ItemIds } from '../block/BlockIds';
import type { World } from '../world/World';
import { EntityAIAttackOnCollide } from './ai/EntityAIAttackOnCollide';
import { EntityAIAvoidEntity } from './ai/EntityAIAvoidEntity';
import { EntityAICreeperSwell } from './ai/EntityAICreeperSwell';
import { EntityAIHurtByTarget } from './ai/EntityAIHurtByTarget';
import { EntityAILookIdle } from './ai/EntityAILookIdle';
import { EntityAINearestAttackableTarget } from './ai/EntityAINearestAttackableTarget';
import { EntityAISwimming } from './ai/EntityAISwimming';
import { EntityAIWander } from './ai/EntityAIWander';
import { EntityAIWatchClosest } from './ai/EntityAIWatchClosest';
import type { DamageSource } from './DamageSource';
import type { Entity } from './Entity';
import { EntityMob } from './EntityMob';
import { EntitySkeleton } from './EntitySkeleton';
import { isEntityNamed, tagBool, tagNumber } from './HostileMobUtil';
import type { TagCompound } from '../item/ItemStack';
import { NBT } from '../world/storage/NBT';

const f = Math.fround;

/**
 * A creeper (EntityCreeper): walks up to the player it may target (never a Creative one unless
 * provoked, as in 1.5.2), lights a 30-tick fuse within 3 blocks (hissing), swells and flashes
 * white, and explodes with power 3 (6 when charged by lightning); the fuse winds back when the
 * target leaves 7 blocks or sight. Runs from ocelots; drops a music disc when a skeleton kills it.
 */
export class EntityCreeper extends EntityMob {
  private lastActiveTime = 0;
  private timeSinceIgnited = 0;
  private fuseTime = 30;
  private explosionRadius = 3;
  /** DataWatcher 16 (state: -1 idle, 1 swelling) and 17 (powered). */
  private creeperState = -1;
  private powered = false;

  constructor(world: World) {
    super(world);
    this.texture = '/mob/creeper.png';
    this.tasks.addTask(1, new EntityAISwimming(this));
    this.tasks.addTask(2, new EntityAICreeperSwell(this));
    this.tasks.addTask(3, new EntityAIAvoidEntity(this, (e) => isEntityNamed(e, 'Ozelot'), 6, f(0.25), f(0.3)));
    this.tasks.addTask(4, new EntityAIAttackOnCollide(this, f(0.25), false));
    this.tasks.addTask(5, new EntityAIWander(this, f(0.2)));
    this.tasks.addTask(6, new EntityAIWatchClosest(this, 'player', 8));
    this.tasks.addTask(6, new EntityAILookIdle(this));
    this.targetTasks.addTask(1, new EntityAINearestAttackableTarget(this, 'player', 16, 0, true));
    this.targetTasks.addTask(2, new EntityAIHurtByTarget(this, false));
  }

  protected override isAIEnabled(): boolean {
    return true;
  }

  /** func_82143_as: with a target it will drop as far as its health allows. */
  override getMaxFallHeight(): number {
    return this.getAttackTarget() === null ? 3 : 3 + (this.health - 1);
  }

  /** Falling winds the fuse on (1.5 ticks per block), up to 5 ticks short of exploding. */
  protected override fall(dist: number): void {
    super.fall(dist);
    this.timeSinceIgnited = Math.trunc(f(this.timeSinceIgnited + f(dist * f(1.5))));
    if (this.timeSinceIgnited > this.fuseTime - 5) this.timeSinceIgnited = this.fuseTime - 5;
  }

  getMaxHealth(): number {
    return 20;
  }

  override onUpdate(): void {
    if (this.isEntityAlive()) {
      this.lastActiveTime = this.timeSinceIgnited;
      const state = this.getCreeperState();
      if (state > 0 && this.timeSinceIgnited === 0) this.playSound('random.fuse', 1, f(0.5));
      this.timeSinceIgnited += state;
      if (this.timeSinceIgnited < 0) this.timeSinceIgnited = 0;
      if (this.timeSinceIgnited >= this.fuseTime) {
        this.timeSinceIgnited = this.fuseTime;
        const griefing = this.worldObj.worldInfo.gameRules.mobGriefing;
        const power = this.getPowered() ? this.explosionRadius * 2 : this.explosionRadius;
        this.worldObj.createExplosion(this, this.posX, this.posY, this.posZ, power, griefing);
        this.setDead();
      }
    }
    super.onUpdate();
  }

  protected override getHurtSound(): string | null {
    return 'mob.creeper.say';
  }

  protected override getDeathSound(): string | null {
    return 'mob.creeper.death';
  }

  /** Killed by a skeleton's arrow: one of the twelve music discs. */
  override onDeath(src: DamageSource): void {
    super.onDeath(src);
    if (src.getEntity() instanceof EntitySkeleton) this.dropItem(ItemIds.record13 + this.rand.nextInt(ItemIds.recordWait - ItemIds.record13 + 1), 1);
  }

  /** The melee task only brings it close; the swell task does the damage. */
  override attackEntityAsMob(_target: Entity): boolean {
    return true;
  }

  getPowered(): boolean {
    return this.powered;
  }

  /** How far the fuse has burnt, interpolated (> 1 shortly before the blast). */
  getCreeperFlashIntensity(pt: number): number {
    return f(f(this.lastActiveTime + f((this.timeSinceIgnited - this.lastActiveTime) * pt)) / (this.fuseTime - 2));
  }

  protected override getDropItemId(): number {
    return ItemIds.gunpowder;
  }

  getCreeperState(): number {
    return this.creeperState;
  }

  setCreeperState(state: number): void {
    this.creeperState = state;
  }

  override onStruckByLightning(bolt: Entity): void {
    super.onStruckByLightning(bolt);
    this.powered = true;
  }

  override writeEntityToNBT(tag: TagCompound): void {
    super.writeEntityToNBT(tag);
    if (this.powered) NBT.setBoolean(tag, 'powered', true);
    NBT.setShort(tag, 'Fuse', this.fuseTime);
    NBT.setByte(tag, 'ExplosionRadius', this.explosionRadius);
  }

  override readEntityFromNBT(tag: TagCompound): void {
    super.readEntityFromNBT(tag);
    this.powered = NBT.getBoolean(tag, 'powered');
    if (NBT.hasKey(tag, 'Fuse')) this.fuseTime = NBT.getShort(tag, 'Fuse');
    if (NBT.hasKey(tag, 'ExplosionRadius')) this.explosionRadius = NBT.getByte(tag, 'ExplosionRadius');
  }
}
