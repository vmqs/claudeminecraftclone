import { ItemIds } from '../block/BlockIds';
import { MathHelper } from '../core/MathHelper';
import { ItemStack } from '../item/ItemStack';
import type { World } from '../world/World';
import { Entity } from './Entity';
import { headingPitch, headingYaw, smoothRotation } from './EntityArrow';
import { EntityItem } from './EntityItem';

const f = Math.fround;

/**
 * A thrown eye of ender (EntityEnderEye, "EyeOfEnderSignal"): flies up to 12 blocks towards
 * the target (the nearest stronghold, set by the item through moveTowards) trailing portal
 * particles, then after 80 ticks drops as an item (4 in 5) or shatters (2003 effect).
 */
export class EntityEnderEye extends Entity {
  private targetX = 0;
  private targetY = 0;
  private targetZ = 0;
  private despawnTimer = 0;
  private shatterOrDrop = false;

  constructor(world: World, x?: number, y?: number, z?: number) {
    super(world);
    this.setSize(0.25, 0.25);
    if (x === undefined || y === undefined || z === undefined) return;
    this.despawnTimer = 0;
    this.setPosition(x, y, z);
    this.yOffset = 0;
  }

  protected entityInit(): void {}

  override isInRangeToRenderDist(distSq: number): boolean {
    const d = this.boundingBox.getAverageEdgeLength() * 4 * 64;
    return distSq < d * d;
  }

  /** Heads for (x, y, z), or 12 blocks along that way and 8 up when it is further. */
  moveTowards(x: number, y: number, z: number): void {
    const dx = x - this.posX;
    const dz = z - this.posZ;
    const d = MathHelper.sqrt_double(dx * dx + dz * dz);
    if (d > 12) {
      this.targetX = this.posX + (dx / d) * 12;
      this.targetZ = this.posZ + (dz / d) * 12;
      this.targetY = this.posY + 8;
    } else {
      this.targetX = x;
      this.targetY = y;
      this.targetZ = z;
    }
    this.despawnTimer = 0;
    this.shatterOrDrop = this.rand.nextInt(5) > 0;
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
    this.posX += this.motionX;
    this.posY += this.motionY;
    this.posZ += this.motionZ;
    const horiz = MathHelper.sqrt_double(this.motionX * this.motionX + this.motionZ * this.motionZ);
    this.rotationYaw = headingYaw(this.motionX, this.motionZ);
    this.rotationPitch = headingPitch(this.motionY, horiz);
    smoothRotation(this);
    const dx = this.targetX - this.posX;
    const dz = this.targetZ - this.posZ;
    const dist = f(Math.sqrt(dx * dx + dz * dz));
    const angle = f(Math.atan2(dz, dx));
    let speed = horiz + (dist - horiz) * 0.0025;
    if (dist < 1) {
      speed *= 0.8;
      this.motionY *= 0.8;
    }
    this.motionX = Math.cos(angle) * speed;
    this.motionZ = Math.sin(angle) * speed;
    if (this.posY < this.targetY) this.motionY += (1 - this.motionY) * f(0.015);
    else this.motionY += (-1 - this.motionY) * f(0.015);
    const k = f(0.25);
    const w = this.worldObj;
    if (this.isInWater()) {
      for (let i = 0; i < 4; i++) w.spawnParticle('bubble', this.posX - this.motionX * k, this.posY - this.motionY * k, this.posZ - this.motionZ * k, this.motionX, this.motionY, this.motionZ);
    } else {
      w.spawnParticle(
        'portal',
        this.posX - this.motionX * k + this.rand.nextDouble() * 0.6 - 0.3,
        this.posY - this.motionY * k - 0.5,
        this.posZ - this.motionZ * k + this.rand.nextDouble() * 0.6 - 0.3,
        this.motionX,
        this.motionY,
        this.motionZ,
      );
    }
    this.setPosition(this.posX, this.posY, this.posZ);
    this.despawnTimer++;
    if (this.despawnTimer > 80) {
      this.setDead();
      if (this.shatterOrDrop) w.spawnEntityInWorld(new EntityItem(w, this.posX, this.posY, this.posZ, new ItemStack(ItemIds.eyeOfEnder, 1, 0)));
      else w.playAuxSFX(2003, Math.round(this.posX), Math.round(this.posY), Math.round(this.posZ), 0);
    }
  }

  override getShadowSize(): number {
    return 0;
  }

  override getBrightness(_pt: number): number {
    return 1;
  }

  override getBrightnessForRender(_pt: number): number {
    return 15728880;
  }

  override canAttackWithItem(): boolean {
    return false;
  }
}
