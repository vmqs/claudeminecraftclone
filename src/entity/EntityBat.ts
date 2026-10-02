import { MathHelper } from '../core/MathHelper';
import type { World } from '../world/World';
import type { DamageSource } from './DamageSource';
import type { Entity } from './Entity';
import { EntityAmbientCreature } from './EntityAmbientCreature';
import { ChunkCoordinates } from './EntityLiving';

const f = Math.fround;

/**
 * The bat (EntityBat): 6 health, hangs upside down under solid blocks and wakes when a player
 * comes within 4 blocks (or the block goes), flutters to random nearby spots, squeaks quietly,
 * cannot be pushed and never triggers pressure plates. Spawns below y 63 in darkness (light up
 * to 3, or up to 6 around Halloween), half as often outside it.
 */
export class EntityBat extends EntityAmbientCreature {
  private currentFlightTarget: ChunkCoordinates | null = null;
  /** DataWatcher 16 bit 1. */
  private hanging = false;

  constructor(world: World) {
    super(world);
    this.texture = '/mob/bat.png';
    this.setSize(f(0.5), f(0.9));
    this.setIsBatHanging(true);
  }

  protected override getSoundVolume(): number {
    return f(0.1);
  }

  protected override getSoundPitch(): number {
    return f(super.getSoundPitch() * f(0.95));
  }

  protected override getLivingSound(): string | null {
    return this.getIsBatHanging() && this.rand.nextInt(4) !== 0 ? null : 'mob.bat.idle';
  }

  protected override getHurtSound(): string | null {
    return 'mob.bat.hurt';
  }

  protected override getDeathSound(): string | null {
    return 'mob.bat.death';
  }

  override canBePushed(): boolean {
    return false;
  }

  protected override collideWithEntity(_e: Entity): void {}

  protected override collideWithNearbyEntities(): void {}

  getMaxHealth(): number {
    return 6;
  }

  getIsBatHanging(): boolean {
    return this.hanging;
  }

  setIsBatHanging(v: boolean): void {
    this.hanging = v;
  }

  protected override isAIEnabled(): boolean {
    return true;
  }

  override onUpdate(): void {
    super.onUpdate();
    if (this.getIsBatHanging()) {
      this.motionX = this.motionY = this.motionZ = 0;
      this.posY = MathHelper.floor_double(this.posY) + 1 - this.height;
    } else {
      this.motionY *= f(0.6);
    }
  }

  protected override updateAITasks(): void {
    super.updateAITasks();
    const w = this.worldObj;
    if (this.getIsBatHanging()) {
      if (!w.isBlockNormalCube(MathHelper.floor_double(this.posX), Math.trunc(this.posY) + 1, MathHelper.floor_double(this.posZ))) {
        this.setIsBatHanging(false);
        w.playAuxSFXAtEntity(null, 1015, Math.trunc(this.posX), Math.trunc(this.posY), Math.trunc(this.posZ), 0);
      } else {
        if (this.rand.nextInt(200) === 0) this.rotationYawHead = this.rand.nextInt(360);
        if (w.getClosestPlayerToEntity(this, 4) !== null) {
          this.setIsBatHanging(false);
          w.playAuxSFXAtEntity(null, 1015, Math.trunc(this.posX), Math.trunc(this.posY), Math.trunc(this.posZ), 0);
        }
      }
      return;
    }
    const t = this.currentFlightTarget;
    if (t && (!w.isAirBlock(t.posX, t.posY, t.posZ) || t.posY < 1)) this.currentFlightTarget = null;
    if (!this.currentFlightTarget || this.rand.nextInt(30) === 0 || this.currentFlightTarget.getDistanceSquared(Math.trunc(this.posX), Math.trunc(this.posY), Math.trunc(this.posZ)) < 4) {
      this.currentFlightTarget = new ChunkCoordinates(
        Math.trunc(this.posX) + this.rand.nextInt(7) - this.rand.nextInt(7),
        Math.trunc(this.posY) + this.rand.nextInt(6) - 2,
        Math.trunc(this.posZ) + this.rand.nextInt(7) - this.rand.nextInt(7),
      );
    }
    const target = this.currentFlightTarget;
    const dx = target.posX + 0.5 - this.posX;
    const dy = target.posY + 0.1 - this.posY;
    const dz = target.posZ + 0.5 - this.posZ;
    this.motionX += (Math.sign(dx) * 0.5 - this.motionX) * f(0.1);
    this.motionY += (Math.sign(dy) * f(0.7) - this.motionY) * f(0.1);
    this.motionZ += (Math.sign(dz) * 0.5 - this.motionZ) * f(0.1);
    const yaw = f(f((Math.atan2(this.motionZ, this.motionX) * 180) / f(Math.PI)) - 90);
    const turn = MathHelper.wrapAngleTo180_float(yaw - this.rotationYaw);
    this.moveForward = f(0.5);
    this.rotationYaw = f(this.rotationYaw + turn);
    if (this.rand.nextInt(100) === 0 && w.isBlockNormalCube(MathHelper.floor_double(this.posX), Math.trunc(this.posY) + 1, MathHelper.floor_double(this.posZ))) this.setIsBatHanging(true);
  }

  protected override canTriggerWalking(): boolean {
    return false;
  }

  protected override fall(_dist: number): void {}

  protected override updateFallState(_dy: number, _onGround: boolean): void {}

  doesEntityNotTriggerPressurePlate(): boolean {
    return true;
  }

  override attackEntityFrom(src: DamageSource, amount: number): boolean {
    if (this.isEntityInvulnerable()) return false;
    if (this.getIsBatHanging()) this.setIsBatHanging(false);
    return super.attackEntityFrom(src, amount);
  }

  readEntityFromNBT(tag: Record<string, unknown>): void {
    if (typeof tag.BatFlags === 'number') this.setIsBatHanging((tag.BatFlags & 1) !== 0);
  }

  override getCanSpawnHere(): boolean {
    const y = MathHelper.floor_double(this.boundingBox.minY);
    if (y >= 63) return false;
    const light = this.worldObj.getBlockLightValue(MathHelper.floor_double(this.posX), y, MathHelper.floor_double(this.posZ));
    let max = 4;
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    if ((month === 10 && day >= 20) || (month === 11 && day <= 3)) max = 7;
    else if (this.rand.nextBoolean()) return false;
    return light > this.rand.nextInt(max) ? false : super.getCanSpawnHere();
  }

  override initCreature(): void {}
}
