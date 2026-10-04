import { MathHelper } from '../core/MathHelper';
import { ItemStack, type TagCompound } from '../item/ItemStack';
import type { World } from '../world/World';
import { Entity } from './Entity';
import { headingPitch, headingYaw, smoothRotation } from './EntityArrow';
import { NBT } from '../world/storage/NBT';

/** World.makeFireworks (func_92088_a), when the effect code provides it. */
type FireworksWorld = World & {
  makeFireworks?(x: number, y: number, z: number, mx: number, my: number, mz: number, fireworks: TagCompound | null): void;
};

/**
 * A firework rocket (EntityFireworkRocket, "FireworksRocketEntity"): accelerates upwards with a
 * spark trail for 10 x (1 + flight duration) + 0-11 ticks, then bursts into the explosions of
 * its "Fireworks" tag (status 17, the EntityFireworkStarterFX of the effect code).
 */
export class EntityFireworkRocket extends Entity {
  private fireworkAge = 0;
  private lifetime = 0;
  /** DataWatcher 8: the firework item, whose "Fireworks" tag describes the burst. */
  private fireworkItem: ItemStack | null = null;
  /** The burst when the World has no makeFireworks (installed by the effect code). */
  static explosionEffect: ((w: World, x: number, y: number, z: number, mx: number, my: number, mz: number, fireworks: TagCompound | null) => void) | null = null;

  constructor(world: World, x?: number, y?: number, z?: number, stack?: ItemStack | null) {
    super(world);
    this.setSize(0.25, 0.25);
    if (x === undefined || y === undefined || z === undefined) return;
    this.fireworkAge = 0;
    this.setPosition(x, y, z);
    this.yOffset = 0;
    let flight = 1;
    if (stack && stack.hasTagCompound()) {
      this.fireworkItem = stack;
      const fw = stack.getTagCompound()?.['Fireworks'] as TagCompound | undefined;
      if (fw) flight += Number(fw['Flight'] ?? 0) | 0;
    }
    this.motionX = this.rand.nextGaussian() * 0.001;
    this.motionZ = this.rand.nextGaussian() * 0.001;
    this.motionY = 0.05;
    this.lifetime = 10 * flight + this.rand.nextInt(6) + this.rand.nextInt(7);
  }

  protected entityInit(): void {}

  override isInRangeToRenderDist(distSq: number): boolean {
    return distSq < 4096;
  }

  override setVelocity(x: number, y: number, z: number): void {
    this.motionX = x;
    this.motionY = y;
    this.motionZ = z;
    if (this.prevRotationPitch === 0 && this.prevRotationYaw === 0) {
      const horiz = MathHelper.sqrt_double(x * x + z * z);
      this.prevRotationYaw = this.rotationYaw = headingYaw(x, z);
      this.prevRotationPitch = this.rotationPitch = headingPitch(y, horiz);
    }
  }

  override onUpdate(): void {
    this.lastTickPosX = this.posX;
    this.lastTickPosY = this.posY;
    this.lastTickPosZ = this.posZ;
    super.onUpdate();
    this.motionX *= 1.15;
    this.motionZ *= 1.15;
    this.motionY += 0.04;
    this.moveEntity(this.motionX, this.motionY, this.motionZ);
    const horiz = MathHelper.sqrt_double(this.motionX * this.motionX + this.motionZ * this.motionZ);
    this.rotationYaw = headingYaw(this.motionX, this.motionZ);
    this.rotationPitch = headingPitch(this.motionY, horiz);
    smoothRotation(this);
    if (this.fireworkAge === 0) this.playSound('fireworks.launch', 3, 1);
    this.fireworkAge++;
    this.worldObj.spawnParticle('fireworksSpark', this.posX, this.posY - 0.3, this.posZ, this.rand.nextGaussian() * 0.05, -this.motionY * 0.5, this.rand.nextGaussian() * 0.05);
    if (this.fireworkAge > this.lifetime) {
      this.worldObj.setEntityState(this, 17);
      this.setDead();
    }
  }

  /** Status 17: the burst, described by the item's "Fireworks" tag. */
  override handleHealthUpdate(status: number): void {
    if (status === 17) {
      const fw = (this.fireworkItem?.getTagCompound()?.['Fireworks'] as TagCompound | undefined) ?? null;
      const w = this.worldObj as FireworksWorld;
      if (w.makeFireworks) w.makeFireworks(this.posX, this.posY, this.posZ, this.motionX, this.motionY, this.motionZ, fw);
      else EntityFireworkRocket.explosionEffect?.(w, this.posX, this.posY, this.posZ, this.motionX, this.motionY, this.motionZ, fw);
    }
    super.handleHealthUpdate(status);
  }

  /** The firework item (renderer: the rocket sprite). */
  getFireworkItem(): ItemStack | null {
    return this.fireworkItem;
  }

  override getShadowSize(): number {
    return 0;
  }

  override canAttackWithItem(): boolean {
    return false;
  }

  override writeEntityToNBT(tag: TagCompound): void {
    NBT.setInteger(tag, 'Life', this.fireworkAge);
    NBT.setInteger(tag, 'LifeTime', this.lifetime);
    if (this.fireworkItem) NBT.setCompoundTag(tag, 'FireworksItem', this.fireworkItem.writeToNBT());
  }

  override readEntityFromNBT(tag: TagCompound): void {
    this.fireworkAge = NBT.getInteger(tag, 'Life');
    this.lifetime = NBT.getInteger(tag, 'LifeTime');
    const item = ItemStack.loadItemStackFromNBT(NBT.getCompoundTag(tag, 'FireworksItem'));
    if (item) this.fireworkItem = item;
  }
}
