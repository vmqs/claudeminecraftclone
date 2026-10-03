import type { World } from '../world/World';
import { Entity } from './Entity';
import type { EntityLiving } from './EntityLiving';
import type { TagCompound } from '../item/ItemStack';
import { NBT } from '../world/storage/NBT';

const f = Math.fround;

/**
 * Lit TNT (EntityTNTPrimed): hops up with a small random sideways push, bounces, smokes, and
 * after its fuse (80 ticks when lit) explodes with strength 4.
 */
export class EntityTNTPrimed extends Entity {
  /**
   * Ticks left. The original's bare constructor (savegame loading) started at 0; without
   * savegames a TNT created by name (EntityList 'PrimedTnt') starts with the lit fuse instead.
   */
  fuse = 80;
  private tntPlacedBy: EntityLiving | null = null;

  constructor(world: World, x?: number, y?: number, z?: number, igniter: EntityLiving | null = null) {
    super(world);
    this.preventEntitySpawning = true;
    this.setSize(0.98, 0.98);
    this.yOffset = f(this.height / 2);
    if (x === undefined || y === undefined || z === undefined) return;
    this.setPosition(x, y, z);
    const a = f(Math.random() * f(Math.PI) * 2);
    this.motionX = f(-f(Math.sin(a)) * f(0.02));
    this.motionY = f(0.2);
    this.motionZ = f(-f(Math.cos(a)) * f(0.02));
    this.fuse = 80;
    this.prevPosX = x;
    this.prevPosY = y;
    this.prevPosZ = z;
    this.tntPlacedBy = igniter;
  }

  protected entityInit(): void {}

  protected override canTriggerWalking(): boolean {
    return false;
  }

  override canBeCollidedWith(): boolean {
    return !this.isDead;
  }

  override onUpdate(): void {
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    this.motionY -= f(0.04);
    this.moveEntity(this.motionX, this.motionY, this.motionZ);
    this.motionX *= f(0.98);
    this.motionY *= f(0.98);
    this.motionZ *= f(0.98);
    if (this.onGround) {
      this.motionX *= f(0.7);
      this.motionZ *= f(0.7);
      this.motionY *= -0.5;
    }
    if (this.fuse-- <= 0) {
      this.setDead();
      this.explode();
    } else {
      this.worldObj.spawnParticle('smoke', this.posX, this.posY + 0.5, this.posZ, 0, 0, 0);
    }
  }

  private explode(): void {
    this.worldObj.createExplosion(this, this.posX, this.posY, this.posZ, 4, true);
  }

  override getShadowSize(): number {
    return 0;
  }

  /** Who lit it (blamed for the explosion damage). */
  getTntPlacedBy(): EntityLiving | null {
    return this.tntPlacedBy;
  }

  setTntPlacedBy(e: EntityLiving | null): void {
    this.tntPlacedBy = e;
  }

  override writeEntityToNBT(tag: TagCompound): void {
    NBT.setByte(tag, 'Fuse', this.fuse);
  }

  override readEntityFromNBT(tag: TagCompound): void {
    this.fuse = NBT.getByte(tag, 'Fuse');
  }
}
