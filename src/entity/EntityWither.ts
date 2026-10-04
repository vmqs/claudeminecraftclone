import { BlockIds, ItemIds } from '../block/BlockIds';
import { MathHelper } from '../core/MathHelper';
import type { TagCompound } from '../item/ItemStack';
import type { World } from '../world/World';
import { NBT } from '../world/storage/NBT';
import { EntityAIArrowAttack } from './ai/EntityAIArrowAttack';
import { EntityAIHurtByTarget } from './ai/EntityAIHurtByTarget';
import { EntityAILookIdle } from './ai/EntityAILookIdle';
import { anyLiving, EntityAINearestAttackableTarget } from './ai/EntityAINearestAttackableTarget';
import { EntityAISwimming } from './ai/EntityAISwimming';
import { EntityAIWander } from './ai/EntityAIWander';
import { EntityAIWatchClosest } from './ai/EntityAIWatchClosest';
import type { IRangedAttackMob } from './ai/IRangedAttackMob';
import { DamageSource } from './DamageSource';
import type { Entity } from './Entity';
import { EntityArrow } from './EntityArrow';
import { EntityLiving, EnumCreatureAttribute } from './EntityLiving';
import { EntityMob } from './EntityMob';
import type { EntityPlayer } from './EntityPlayer';
import { EntityWitherSkull } from './EntityWitherSkull';
import type { PotionEffectLike } from './PotionEffects';

const f = Math.fround;
const PI_F = f(Math.PI);

/** EntityWitherAttackFilter: every living thing that is not undead. */
const attackEntitySelector = (e: Entity): boolean => e.isLivingEntity && (e as EntityLiving).getCreatureAttribute() !== EnumCreatureAttribute.UNDEAD;

/**
 * The Wither (EntityWither, a boss with 300 health): built from soul sand and three wither
 * skeleton skulls, it spends 220 ticks charging up invulnerable (blue, growing, healing 10 every
 * 10 ticks) and explodes (strength 7) when it wakes. Then it flies after its target, the middle
 * head shooting wither skulls through EntityAIArrowAttack, the side heads picking their own
 * living, non-undead targets within 20 blocks (and on Normal and Hard sometimes firing blue
 * skulls at random spots), breaking the blocks around itself a second after it is hurt and
 * healing 1 every second. Below half health it wears its armour and arrows bounce off. Drops a
 * nether star.
 *
 * DataWatcher 16-20 are fields here: the boss bar's health, the three heads' target ids and the
 * invulnerability time. A guest's copy only runs `updateClientState` (heads and particles).
 */
export class EntityWither extends EntityMob implements IRangedAttackMob {
  /** field_82220_d / field_82221_e: the side heads' pitch and yaw. */
  private readonly headPitch = [0, 0];
  private readonly headYaw = [0, 0];
  /** field_82217_f / field_82218_g: their values on the previous tick. */
  private readonly prevHeadPitch = [0, 0];
  private readonly prevHeadYaw = [0, 0];
  /** field_82223_h: when each side head looks for a target or shoots next. */
  private readonly nextHeadUpdate = [0, 0];
  /** field_82224_i: side-head updates without a shot (a blue skull after 15 on Normal and Hard). */
  private readonly idleHeadUpdates = [0, 0];
  /** field_82222_j: ticks until the blocks around it break (set when hurt). */
  private blockBreakCounter = 0;
  /** DataWatcher 16: the health the boss bar shows. */
  bossHealth = 100;
  /** DataWatcher 17-19: the entity ids the heads look at (0 none). */
  readonly watchedTargets = [0, 0, 0];
  /** DataWatcher 20: ticks of invulnerability left. */
  invulTime = 0;

  constructor(world: World) {
    super(world);
    this.setEntityHealth(this.getMaxHealth());
    this.bossHealth = this.getHealth();
    this.texture = '/mob/wither.png';
    this.setSize(f(0.9), 4);
    this.isImmuneToFire_ = true;
    this.moveSpeed = f(0.6);
    this.getNavigator().setCanSwim(true);
    this.tasks.addTask(0, new EntityAISwimming(this));
    this.tasks.addTask(2, new EntityAIArrowAttack(this, this.moveSpeed, 40, 20));
    this.tasks.addTask(5, new EntityAIWander(this, this.moveSpeed));
    this.tasks.addTask(6, new EntityAIWatchClosest(this, 'player', 8));
    this.tasks.addTask(7, new EntityAILookIdle(this));
    this.targetTasks.addTask(1, new EntityAIHurtByTarget(this, false));
    this.targetTasks.addTask(2, new EntityAINearestAttackableTarget(this, anyLiving, 30, 0, false, false, attackEntitySelector));
    this.experienceValue = 50;
  }

  getMaxHealth(): number {
    return 300;
  }

  /** IBossDisplayData.getBossHealth (DataWatcher 16). */
  getBossHealth(): number {
    return this.bossHealth;
  }

  override writeEntityToNBT(tag: TagCompound): void {
    super.writeEntityToNBT(tag);
    NBT.setInteger(tag, 'Invul', this.getInvulTime());
  }

  override readEntityFromNBT(tag: TagCompound): void {
    super.readEntityFromNBT(tag);
    this.setInvulTime(NBT.getInteger(tag, 'Invul'));
    this.bossHealth = this.getHealth();
  }

  override getShadowSize(): number {
    return f(this.height / 8);
  }

  protected override getLivingSound(): string | null {
    return 'mob.wither.idle';
  }

  protected override getHurtSound(): string | null {
    return 'mob.wither.hurt';
  }

  protected override getDeathSound(): string | null {
    return 'mob.wither.death';
  }

  /** Blue while invulnerable, blinking during its last 80 ticks. */
  override getTexture(): string {
    const t = this.getInvulTime();
    return t > 0 && (t > 80 || Math.trunc(t / 5) % 2 !== 1) ? '/mob/wither_invul.png' : '/mob/wither.png';
  }

  override onLivingUpdate(): void {
    const w = this.worldObj;
    if (!w.isRemote) this.bossHealth = this.getHealth();
    this.motionY *= f(0.6);
    if (!w.isRemote && this.getWatchedTargetId(0) > 0) {
      const t = this.entityById(this.getWatchedTargetId(0));
      if (t) {
        if (this.posY < t.posY || (!this.isArmored() && this.posY < t.posY + 5)) {
          if (this.motionY < 0) this.motionY = 0;
          this.motionY += (0.5 - this.motionY) * f(0.6);
        }
        const dx = t.posX - this.posX;
        const dz = t.posZ - this.posZ;
        const d2 = dx * dx + dz * dz;
        if (d2 > 9) {
          const d = MathHelper.sqrt_double(d2);
          this.motionX += ((dx / d) * 0.5 - this.motionX) * f(0.6);
          this.motionZ += ((dz / d) * 0.5 - this.motionZ) * f(0.6);
        }
      }
    }
    if (this.motionX * this.motionX + this.motionZ * this.motionZ > f(0.05)) {
      this.rotationYaw = f(f(f(Math.atan2(this.motionZ, this.motionX)) * f(180 / PI_F)) - 90);
    }
    super.onLivingUpdate();
    this.updateClientState();
  }

  /** The client half of onLivingUpdate: the side heads turn to their targets; smoke and spell particles. */
  updateClientState(): void {
    for (let i = 0; i < 2; i++) {
      this.prevHeadYaw[i] = this.headYaw[i];
      this.prevHeadPitch[i] = this.headPitch[i];
    }
    for (let i = 0; i < 2; i++) {
      const t = this.entityById(this.getWatchedTargetId(i + 1));
      if (t) {
        const hx = this.getHeadX(i + 1);
        const hy = this.getHeadY(i + 1);
        const hz = this.getHeadZ(i + 1);
        const dx = t.posX - hx;
        const dy = t.posY + t.getEyeHeight() - hy;
        const dz = t.posZ - hz;
        const horiz = MathHelper.sqrt_double(dx * dx + dz * dz);
        const yaw = f(f((Math.atan2(dz, dx) * 180) / PI_F) - 90);
        const pitch = f(-((Math.atan2(dy, horiz) * 180) / PI_F));
        this.headPitch[i] = this.rotlerp(this.headPitch[i], pitch, 40);
        this.headYaw[i] = this.rotlerp(this.headYaw[i], yaw, 10);
      } else {
        this.headYaw[i] = this.rotlerp(this.headYaw[i], this.renderYawOffset, 10);
      }
    }
    const armored = this.isArmored();
    const w = this.worldObj;
    const was = w.localEffectsOnly;
    w.localEffectsOnly = true;
    try {
      for (let i = 0; i < 3; i++) {
        const hx = this.getHeadX(i);
        const hy = this.getHeadY(i);
        const hz = this.getHeadZ(i);
        w.spawnParticle('smoke', hx + this.rand.nextGaussian() * f(0.3), hy + this.rand.nextGaussian() * f(0.3), hz + this.rand.nextGaussian() * f(0.3), 0, 0, 0);
        if (armored && w.rand.nextInt(4) === 0) {
          w.spawnParticle('mobSpell', hx + this.rand.nextGaussian() * f(0.3), hy + this.rand.nextGaussian() * f(0.3), hz + this.rand.nextGaussian() * f(0.3), f(0.7), f(0.7), 0.5);
        }
      }
      if (this.getInvulTime() > 0) {
        for (let i = 0; i < 3; i++) {
          w.spawnParticle('mobSpell', this.posX + this.rand.nextGaussian() * 1, this.posY + f(this.rand.nextFloat() * f(3.3)), this.posZ + this.rand.nextGaussian() * 1, f(0.7), f(0.7), f(0.9));
        }
      }
    } finally {
      w.localEffectsOnly = was;
    }
  }

  protected override updateAITasks(): void {
    const w = this.worldObj;
    if (this.getInvulTime() > 0) {
      const left = this.getInvulTime() - 1;
      if (left <= 0) {
        w.newExplosion(this, this.posX, this.posY + this.getEyeHeight(), this.posZ, 7, false, w.worldInfo.gameRules.mobGriefing);
        w.broadcastSound(1013, Math.trunc(this.posX), Math.trunc(this.posY), Math.trunc(this.posZ), 0);
      }
      this.setInvulTime(left);
      if (this.ticksExisted % 10 === 0) this.heal(10);
      return;
    }
    super.updateAITasks();
    for (let head = 1; head < 3; head++) {
      if (this.ticksExisted < this.nextHeadUpdate[head - 1]) continue;
      this.nextHeadUpdate[head - 1] = this.ticksExisted + 10 + this.rand.nextInt(10);
      if (w.difficultySetting >= 2 && this.idleHeadUpdates[head - 1]++ > 15) {
        const x = MathHelper.getRandomDoubleInRange(this.rand, this.posX - 10, this.posX + 10);
        const y = MathHelper.getRandomDoubleInRange(this.rand, this.posY - 5, this.posY + 5);
        const z = MathHelper.getRandomDoubleInRange(this.rand, this.posZ - 10, this.posZ + 10);
        this.launchWitherSkullToCoords(head + 1, x, y, z, true);
        this.idleHeadUpdates[head - 1] = 0;
      }
      const id = this.getWatchedTargetId(head);
      if (id > 0) {
        const t = this.entityById(id);
        if (t && t.isEntityAlive() && !t.isCreativeInvulnerable() && !(this.getDistanceSqToEntity(t) > 900) && this.canEntityBeSeen(t)) {
          this.launchWitherSkullToEntity(head + 1, t as EntityLiving);
          this.nextHeadUpdate[head - 1] = this.ticksExisted + 40 + this.rand.nextInt(20);
          this.idleHeadUpdates[head - 1] = 0;
        } else {
          this.setWatchedTargetId(head, 0);
        }
      } else {
        const list = w.getEntitiesWithinAABBExcludingEntity(null, this.boundingBox.expand(20, 8, 20), attackEntitySelector) as EntityLiving[];
        for (let tries = 0; tries < 10 && list.length > 0; tries++) {
          const e = list[this.rand.nextInt(list.length)];
          if (e !== this && e.isEntityAlive() && this.canEntityBeSeen(e)) {
            if (e.isPlayerEntity) {
              if (!(e as EntityPlayer).capabilities.disableDamage) this.setWatchedTargetId(head, e.entityId);
            } else {
              this.setWatchedTargetId(head, e.entityId);
            }
            break;
          }
          list.splice(list.indexOf(e), 1);
        }
      }
    }
    const target = this.getAttackTarget();
    this.setWatchedTargetId(0, target ? target.entityId : 0);
    if (this.blockBreakCounter > 0) {
      this.blockBreakCounter--;
      if (this.blockBreakCounter === 0 && w.worldInfo.gameRules.mobGriefing) {
        const y0 = MathHelper.floor_double(this.posY);
        const x0 = MathHelper.floor_double(this.posX);
        const z0 = MathHelper.floor_double(this.posZ);
        let broke = false;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            for (let dy = 0; dy <= 3; dy++) {
              const x = x0 + dx;
              const y = y0 + dy;
              const z = z0 + dz;
              const id = w.getBlockId(x, y, z);
              if (id > 0 && id !== BlockIds.bedrock && id !== BlockIds.endPortal && id !== BlockIds.endPortalFrame) broke = w.destroyBlock(x, y, z, true) || broke;
            }
          }
        }
        if (broke) w.playAuxSFXAtEntity(null, 1012, Math.trunc(this.posX), Math.trunc(this.posY), Math.trunc(this.posZ), 0);
      }
    }
    if (this.ticksExisted % 20 === 0) this.heal(1);
  }

  /** func_82206_m: freshly built, 220 ticks invulnerable at a third of its health. */
  func_82206_m(): void {
    this.setInvulTime(220);
    this.setEntityHealth(Math.trunc(this.getMaxHealth() / 3));
  }

  override setInWeb(): void {}

  override getTotalArmorValue(): number {
    return 4;
  }

  /** func_82214_u: head 0 is the middle one; heads 1 and 2 sit 1.3 to the sides. */
  private getHeadX(head: number): number {
    if (head <= 0) return this.posX;
    const a = f(f(f(this.renderYawOffset + 180 * (head - 1)) / 180) * PI_F);
    return this.posX + MathHelper.cos(a) * 1.3;
  }

  private getHeadY(head: number): number {
    return head <= 0 ? this.posY + 3 : this.posY + 2.2;
  }

  private getHeadZ(head: number): number {
    if (head <= 0) return this.posZ;
    const a = f(f(f(this.renderYawOffset + 180 * (head - 1)) / 180) * PI_F);
    return this.posZ + MathHelper.sin(a) * 1.3;
  }

  /** func_82204_b: turns `from` towards `to` by at most `max` degrees. */
  private rotlerp(from: number, to: number, max: number): number {
    let d = MathHelper.wrapAngleTo180_float(to - from);
    if (d > max) d = max;
    if (d < -max) d = -max;
    return f(from + d);
  }

  /** func_82216_a: a skull at the target's middle; head 0 has a 1 in 1000 chance of a blue one. */
  private launchWitherSkullToEntity(head: number, t: EntityLiving): void {
    this.launchWitherSkullToCoords(head, t.posX, t.posY + t.getEyeHeight() * 0.5, t.posZ, head === 0 && this.rand.nextFloat() < f(0.001));
  }

  /** func_82209_a */
  private launchWitherSkullToCoords(head: number, x: number, y: number, z: number, blue: boolean): void {
    const w = this.worldObj;
    w.playAuxSFXAtEntity(null, 1014, Math.trunc(this.posX), Math.trunc(this.posY), Math.trunc(this.posZ), 0);
    const hx = this.getHeadX(head);
    const hy = this.getHeadY(head);
    const hz = this.getHeadZ(head);
    const skull = new EntityWitherSkull(w, this, x - hx, y - hy, z - hz);
    if (blue) skull.setInvulnerable(true);
    skull.posY = hy;
    skull.posX = hx;
    skull.posZ = hz;
    w.spawnEntityInWorld(skull);
  }

  attackEntityWithRangedAttack(target: EntityLiving, _power: number): void {
    this.launchWitherSkullToEntity(0, target);
  }

  override attackEntityFrom(src: DamageSource, amount: number): boolean {
    if (this.isEntityInvulnerable()) return false;
    if (src === DamageSource.drown) return false;
    if (this.getInvulTime() > 0) return false;
    if (this.isArmored() && src.getSourceOfDamage() instanceof EntityArrow) return false;
    const by = src.getEntity();
    if (by !== null && !by.isPlayerEntity && by.isLivingEntity && (by as EntityLiving).getCreatureAttribute() === this.getCreatureAttribute()) return false;
    if (this.blockBreakCounter <= 0) this.blockBreakCounter = 20;
    for (let i = 0; i < this.idleHeadUpdates.length; i++) this.idleHeadUpdates[i] += 3;
    return super.attackEntityFrom(src, amount);
  }

  protected override dropFewItems(_recentlyHit: boolean, _looting: number): void {
    this.dropItem(ItemIds.netherStar, 1);
  }

  /** Never despawns. */
  protected override despawnEntity(): void {
    this.entityAge = 0;
  }

  /** Always drawn at full brightness. */
  override getBrightnessForRender(_pt: number): number {
    return 15728880;
  }

  override canBeCollidedWith(): boolean {
    return !this.isDead;
  }

  protected override fall(_dist: number): void {}

  /** Immune to potion effects. */
  override addPotionEffect(_effect: PotionEffectLike): void {}

  protected override isAIEnabled(): boolean {
    return true;
  }

  /** func_82207_a: a side head's yaw. */
  getHeadYRotation(i: number): number {
    return this.headYaw[i];
  }

  /** func_82210_r: a side head's pitch. */
  getHeadXRotation(i: number): number {
    return this.headPitch[i];
  }

  /** func_82212_n */
  getInvulTime(): number {
    return this.invulTime;
  }

  /** func_82215_s */
  setInvulTime(t: number): void {
    this.invulTime = t;
  }

  getWatchedTargetId(head: number): number {
    return this.watchedTargets[head];
  }

  /** func_82211_c */
  setWatchedTargetId(head: number, id: number): void {
    this.watchedTargets[head] = id;
  }

  /** Below half health: the armour shows and arrows bounce off. */
  isArmored(): boolean {
    return this.getBossHealth() <= Math.trunc(this.getMaxHealth() / 2);
  }

  override getCreatureAttribute(): EnumCreatureAttribute {
    return EnumCreatureAttribute.UNDEAD;
  }

  override mountEntity(_e: Entity | null): void {
    this.ridingEntity = null;
  }

  /** World.getEntityByID: a loaded entity by id (null when gone). */
  private entityById(id: number): Entity | null {
    if (id <= 0) return null;
    for (const e of this.worldObj.loadedEntityList) if (e.entityId === id && !e.isDead) return e;
    return null;
  }
}
