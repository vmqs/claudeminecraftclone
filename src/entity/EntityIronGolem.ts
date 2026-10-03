import { BlockIds, ItemIds } from '../block/BlockIds';
import { MathHelper } from '../core/MathHelper';
import type { Village } from '../world/village/Village';
import type { World } from '../world/World';
import { EntityAIAttackOnCollide } from './ai/EntityAIAttackOnCollide';
import { EntityAIDefendVillage } from './ai/EntityAIDefendVillage';
import { EntityAIHurtByTarget } from './ai/EntityAIHurtByTarget';
import { EntityAILookAtVillager } from './ai/EntityAILookAtVillager';
import { EntityAILookIdle } from './ai/EntityAILookIdle';
import { EntityAIMoveThroughVillage } from './ai/EntityAIMoveThroughVillage';
import { EntityAIMoveTowardsTarget } from './ai/EntityAIMoveTowardsTarget';
import { EntityAIMoveTwardsRestriction } from './ai/EntityAIMoveTwardsRestriction';
import { anyLiving, EntityAINearestAttackableTarget } from './ai/EntityAINearestAttackableTarget';
import { EntityAIWander } from './ai/EntityAIWander';
import { EntityAIWatchClosest } from './ai/EntityAIWatchClosest';
import { DamageSource } from './DamageSource';
import type { Entity } from './Entity';
import { EntityGolem } from './EntityGolem';
import type { EntityLiving } from './EntityLiving';
import { mobSelector } from './IMob';
import type { TagCompound } from '../item/ItemStack';
import { NBT } from '../world/storage/NBT';

const f = Math.fround;

/**
 * The iron golem (EntityIronGolem): 100 health, guards the nearest village (home area 60% of its
 * radius), patrols it at night, attacks monsters and village aggressors, throwing what it hits
 * into the air for 7-21 damage, offers poppies to villagers, never attacks players when built by
 * one. Drops 0-2 poppies and 3-5 iron ingots.
 */
export class EntityIronGolem extends EntityGolem {
  private homeCheckTimer = 0;
  private villageObj: Village | null = null;
  private attackTimer = 0;
  private holdRoseTick = 0;
  /** The client's copy of the rose timer (entity status 11), which is what is drawn. */
  private clientHoldRoseTick = 0;
  /** DataWatcher 16 bit 1. */
  private playerCreated = false;

  constructor(world: World) {
    super(world);
    this.texture = '/mob/villager_golem.png';
    this.setSize(f(1.4), f(2.9));
    this.getNavigator().setAvoidsWater(true);
    this.tasks.addTask(1, new EntityAIAttackOnCollide(this, f(0.25), true));
    this.tasks.addTask(2, new EntityAIMoveTowardsTarget(this, f(0.22), 32));
    this.tasks.addTask(3, new EntityAIMoveThroughVillage(this, f(0.16), true));
    this.tasks.addTask(4, new EntityAIMoveTwardsRestriction(this, f(0.16)));
    this.tasks.addTask(5, new EntityAILookAtVillager(this));
    this.tasks.addTask(6, new EntityAIWander(this, f(0.16)));
    this.tasks.addTask(7, new EntityAIWatchClosest(this, 'player', 6));
    this.tasks.addTask(8, new EntityAILookIdle(this));
    this.targetTasks.addTask(1, new EntityAIDefendVillage(this));
    this.targetTasks.addTask(2, new EntityAIHurtByTarget(this, false));
    this.targetTasks.addTask(3, new EntityAINearestAttackableTarget(this, anyLiving, 16, 0, false, true, mobSelector));
  }

  protected override isAIEnabled(): boolean {
    return true;
  }

  protected override updateAITick(): void {
    if (--this.homeCheckTimer <= 0) {
      this.homeCheckTimer = 70 + this.rand.nextInt(50);
      this.villageObj = this.worldObj.villageCollectionObj.findNearestVillage(MathHelper.floor_double(this.posX), MathHelper.floor_double(this.posY), MathHelper.floor_double(this.posZ), 32);
      if (!this.villageObj) {
        this.detachHome();
      } else {
        const c = this.villageObj.getCenter();
        this.setHomeArea(c.posX, c.posY, c.posZ, Math.trunc(f(this.villageObj.getVillageRadius() * f(0.6))));
      }
    }
    super.updateAITick();
  }

  getMaxHealth(): number {
    return 100;
  }

  /** Iron golems do not drown. */
  protected override decreaseAirSupply(air: number): number {
    return air;
  }

  /** Bumping into a monster makes it the target now and then. */
  protected override collideWithEntity(e: Entity): void {
    if (e.isIMob && this.getRNG().nextInt(20) === 0) this.setAttackTarget(e as EntityLiving);
    super.collideWithEntity(e);
  }

  override onLivingUpdate(): void {
    super.onLivingUpdate();
    if (this.attackTimer > 0) this.attackTimer--;
    if (this.holdRoseTick > 0) this.holdRoseTick--;
    if (this.clientHoldRoseTick > 0) this.clientHoldRoseTick--;
    if (this.motionX * this.motionX + this.motionZ * this.motionZ > f(2.5000003e-7) && this.rand.nextInt(5) === 0) {
      const x = MathHelper.floor_double(this.posX);
      const y = MathHelper.floor_double(this.posY - f(0.2) - this.yOffset);
      const z = MathHelper.floor_double(this.posZ);
      const id = this.worldObj.getBlockId(x, y, z);
      if (id > 0) {
        this.worldObj.spawnParticle(
          'tilecrack_' + id + '_' + this.worldObj.getBlockMetadata(x, y, z),
          this.posX + (this.rand.nextFloat() - 0.5) * this.width,
          this.boundingBox.minY + 0.1,
          this.posZ + (this.rand.nextFloat() - 0.5) * this.width,
          4 * (this.rand.nextFloat() - 0.5),
          0.5,
          (this.rand.nextFloat() - 0.5) * 4,
        );
      }
    }
  }

  /** A golem built by a player never targets players. */
  override canAttackClass(name: string | null): boolean {
    return this.isPlayerCreated() && name === 'Player' ? false : super.canAttackClass(name);
  }

  /** Swings its arms (status 4), hits for 7-21 and throws the target upwards. */
  override attackEntityAsMob(e: Entity): boolean {
    this.attackTimer = 10;
    this.worldObj.setEntityState(this, 4);
    const hit = e.attackEntityFrom(DamageSource.causeMobDamage(this), 7 + this.rand.nextInt(15));
    if (hit) e.motionY += f(0.4);
    this.playSound('mob.irongolem.throw', 1, 1);
    return hit;
  }

  override handleHealthUpdate(status: number): void {
    if (status === 4) {
      this.attackTimer = 10;
      this.playSound('mob.irongolem.throw', 1, 1);
    } else if (status === 11) {
      this.clientHoldRoseTick = 400;
    } else {
      super.handleHealthUpdate(status);
    }
  }

  getVillage(): Village | null {
    return this.villageObj;
  }

  getAttackTimer(): number {
    return this.attackTimer;
  }

  /** Holds a poppy out for 400 ticks (or takes it back); the client always starts 400 ticks. */
  setHoldingRose(v: boolean): void {
    this.holdRoseTick = v ? 400 : 0;
    this.worldObj.setEntityState(this, 11);
  }

  protected override getLivingSound(): string | null {
    return 'none';
  }

  protected override getHurtSound(): string | null {
    return 'mob.irongolem.hit';
  }

  protected override getDeathSound(): string | null {
    return 'mob.irongolem.death';
  }

  protected override playStepSound(_x: number, _y: number, _z: number, _id: number): void {
    this.playSound('mob.irongolem.walk', 1, 1);
  }

  protected override dropFewItems(_recentlyHit: boolean, _looting: number): void {
    const roses = this.rand.nextInt(3);
    for (let i = 0; i < roses; i++) this.dropItem(BlockIds.plantRed, 1);
    const iron = 3 + this.rand.nextInt(3);
    for (let i = 0; i < iron; i++) this.dropItem(ItemIds.ingotIron, 1);
  }

  /** The server's rose timer (the AI's view). */
  getHoldRoseTick(): number {
    return this.holdRoseTick;
  }

  /** What the renderer shows: the client's rose timer. */
  getClientHoldRoseTick(): number {
    return this.clientHoldRoseTick;
  }

  isPlayerCreated(): boolean {
    return this.playerCreated;
  }

  setPlayerCreated(v: boolean): void {
    this.playerCreated = v;
  }

  /** Killing a village's own golem costs the player 5 reputation there. */
  override onDeath(src: DamageSource): void {
    if (!this.isPlayerCreated() && this.attackingPlayer && this.villageObj) this.villageObj.setReputationForPlayer(this.attackingPlayer.getCommandSenderName(), -5);
    super.onDeath(src);
  }

  override writeEntityToNBT(tag: TagCompound): void {
    super.writeEntityToNBT(tag);
    NBT.setBoolean(tag, 'PlayerCreated', this.isPlayerCreated());
  }

  override readEntityFromNBT(tag: TagCompound): void {
    super.readEntityFromNBT(tag);
    this.setPlayerCreated(NBT.getBoolean(tag, 'PlayerCreated'));
  }
}
