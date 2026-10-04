import { ItemIds } from '../block/BlockIds';
import { MathHelper } from '../core/MathHelper';
import type { World } from '../world/World';
import type { DamageSource } from './DamageSource';
import type { Entity } from './Entity';
import { EntityFlying } from './EntityFlying';
import { EntityLargeFireball } from './EntityLargeFireball';
import { tagNumber } from './HostileMobUtil';
import type { TagCompound } from '../item/ItemStack';
import { NBT } from '../world/storage/NBT';
import type { EntityPlayer } from './EntityPlayer';
import { AchievementIds } from '../stats/StatIds';

const f = Math.fround;

/**
 * A ghast (EntityGhast, IMob): drifts towards random waypoints within 16 blocks when the way is
 * clear, faces the closest vulnerable player within 100 blocks (Creative players are never
 * targeted) and, while it sees one within 64, charges for 10 ticks (open-mouthed texture),
 * shoots a large fireball at 20 and rests for 40. Its own fireball returned by a player kills it.
 */
export class EntityGhast extends EntityFlying {
  courseChangeCooldown = 0;
  waypointX = 0;
  waypointY = 0;
  waypointZ = 0;
  private targetedEntity: Entity | null = null;
  private aggroCooldown = 0;
  prevAttackCounter = 0;
  attackCounter = 0;
  private explosionStrength = 1;
  /** DataWatcher 16: 1 while about to shoot. */
  private charging = false;

  constructor(world: World) {
    super(world);
    this.texture = '/mob/ghast.png';
    this.setSize(4, 4);
    this.isImmuneToFire_ = true;
    this.experienceValue = 5;
  }

  override get isIMob(): boolean {
    return true;
  }

  override attackEntityFrom(src: DamageSource, amount: number): boolean {
    if (this.isEntityInvulnerable()) return false;
    if (src.getDamageType() === 'fireball' && src.getEntity()?.isPlayerEntity) {
      super.attackEntityFrom(src, 1000);
      (src.getEntity() as EntityPlayer).triggerAchievement(AchievementIds.ghast);
      return true;
    }
    return super.attackEntityFrom(src, amount);
  }

  getMaxHealth(): number {
    return 10;
  }

  override onUpdate(): void {
    super.onUpdate();
    this.texture = this.charging ? '/mob/ghast_fire.png' : '/mob/ghast.png';
  }

  protected override updateEntityActionState(): void {
    if (this.worldObj.difficultySetting === 0) this.setDead();
    this.despawnEntity();
    this.prevAttackCounter = this.attackCounter;
    const dx = this.waypointX - this.posX;
    const dy = this.waypointY - this.posY;
    const dz = this.waypointZ - this.posZ;
    let d = dx * dx + dy * dy + dz * dz;
    if (d < 1 || d > 3600) {
      this.waypointX = this.posX + f(f(f(this.rand.nextFloat() * 2) - 1) * 16);
      this.waypointY = this.posY + f(f(f(this.rand.nextFloat() * 2) - 1) * 16);
      this.waypointZ = this.posZ + f(f(f(this.rand.nextFloat() * 2) - 1) * 16);
    }
    if (this.courseChangeCooldown-- <= 0) {
      this.courseChangeCooldown += this.rand.nextInt(5) + 2;
      d = MathHelper.sqrt_double(d);
      if (this.isCourseTraversable(this.waypointX, this.waypointY, this.waypointZ, d)) {
        this.motionX += (dx / d) * 0.1;
        this.motionY += (dy / d) * 0.1;
        this.motionZ += (dz / d) * 0.1;
      } else {
        this.waypointX = this.posX;
        this.waypointY = this.posY;
        this.waypointZ = this.posZ;
      }
    }
    if (this.targetedEntity && (this.targetedEntity.isDead || this.targetedEntity.isCreativeInvulnerable())) this.targetedEntity = null;
    if (!this.targetedEntity || this.aggroCooldown-- <= 0) {
      this.targetedEntity = this.worldObj.getClosestVulnerablePlayerToEntity(this, 100);
      if (this.targetedEntity) this.aggroCooldown = 20;
    }
    const range = 64;
    const t = this.targetedEntity;
    if (t && t.getDistanceSqToEntity(this) < range * range) {
      const tx = t.posX - this.posX;
      const ty = t.boundingBox.minY + f(t.height / 2) - (this.posY + f(this.height / 2));
      const tz = t.posZ - this.posZ;
      this.renderYawOffset = this.rotationYaw = f(f(f(-f(Math.atan2(tx, tz))) * 180) / f(Math.PI));
      if (this.canEntityBeSeen(t)) {
        if (this.attackCounter === 10) this.worldObj.playAuxSFXAtEntity(null, 1007, Math.trunc(this.posX), Math.trunc(this.posY), Math.trunc(this.posZ), 0);
        this.attackCounter++;
        if (this.attackCounter === 20) {
          this.worldObj.playAuxSFXAtEntity(null, 1008, Math.trunc(this.posX), Math.trunc(this.posY), Math.trunc(this.posZ), 0);
          const ball = new EntityLargeFireball(this.worldObj, this, tx, ty, tz);
          ball.explosionPower = this.explosionStrength;
          const k = 4;
          const look = this.getLook(1);
          ball.posX = this.posX + look.xCoord * k;
          ball.posY = this.posY + f(this.height / 2) + 0.5;
          ball.posZ = this.posZ + look.zCoord * k;
          this.worldObj.spawnEntityInWorld(ball);
          this.attackCounter = -40;
        }
      } else if (this.attackCounter > 0) {
        this.attackCounter--;
      }
    } else {
      this.renderYawOffset = this.rotationYaw = f(f(f(-f(Math.atan2(this.motionX, this.motionZ))) * 180) / f(Math.PI));
      if (this.attackCounter > 0) this.attackCounter--;
    }
    this.charging = this.attackCounter > 10;
  }

  /** The box can slide to the waypoint one block at a time without hitting anything. */
  private isCourseTraversable(x: number, y: number, z: number, d: number): boolean {
    const sx = (x - this.posX) / d;
    const sy = (y - this.posY) / d;
    const sz = (z - this.posZ) / d;
    const box = this.boundingBox.copy();
    for (let i = 1; i < d; i++) {
      box.offset(sx, sy, sz);
      if (this.worldObj.getCollidingBoundingBoxes(this, box).length > 0) return false;
    }
    return true;
  }

  protected override getLivingSound(): string | null {
    return 'mob.ghast.moan';
  }

  protected override getHurtSound(): string | null {
    return 'mob.ghast.scream';
  }

  protected override getDeathSound(): string | null {
    return 'mob.ghast.death';
  }

  protected override getDropItemId(): number {
    return ItemIds.gunpowder;
  }

  /** 0-1 ghast tears and 0-2 gunpowder (more with looting). */
  protected override dropFewItems(_recentlyHit: boolean, looting: number): void {
    let n = this.rand.nextInt(2) + this.rand.nextInt(1 + looting);
    for (let i = 0; i < n; i++) this.dropItem(ItemIds.ghastTear, 1);
    n = this.rand.nextInt(3) + this.rand.nextInt(1 + looting);
    for (let i = 0; i < n; i++) this.dropItem(ItemIds.gunpowder, 1);
  }

  protected override getSoundVolume(): number {
    return 10;
  }

  override getCanSpawnHere(): boolean {
    return this.rand.nextInt(20) === 0 && super.getCanSpawnHere() && this.worldObj.difficultySetting > 0;
  }

  override getMaxSpawnedInChunk(): number {
    return 1;
  }


  override writeEntityToNBT(tag: TagCompound): void {
    super.writeEntityToNBT(tag);
    NBT.setInteger(tag, 'ExplosionPower', this.explosionStrength);
  }

  override readEntityFromNBT(tag: TagCompound): void {
    super.readEntityFromNBT(tag);
    if (NBT.hasKey(tag, 'ExplosionPower')) this.explosionStrength = NBT.getInteger(tag, 'ExplosionPower');
  }
}
