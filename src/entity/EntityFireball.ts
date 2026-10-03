import { MathHelper } from '../core/MathHelper';
import { MovingObjectPosition } from '../core/MovingObjectPosition';
import { Vec3 } from '../core/Vec3';
import type { World } from '../world/World';
import type { DamageSource } from './DamageSource';
import { Entity } from './Entity';
import { smoothRotation } from './EntityArrow';
import type { EntityLiving } from './EntityLiving';
import type { TagCompound } from '../item/ItemStack';

import { NBT, NBTType } from '../world/storage/NBT';

const f = Math.fround;
const PI_F = f(Math.PI);

/**
 * Base of fireballs and wither skulls (EntityFireball): no gravity, a constant acceleration
 * of 0.1 along their heading with 0.95 drag, a smoke trail, and they can be knocked back by
 * hitting them (the attacker's look direction becomes the new heading).
 */
export abstract class EntityFireball extends Entity {
  private xTile = -1;
  private yTile = -1;
  private zTile = -1;
  private inTile = 0;
  private inGround = false;
  shootingEntity: EntityLiving | null = null;
  private ticksAlive = 0;
  private ticksInAir = 0;
  accelerationX = 0;
  accelerationY = 0;
  accelerationZ = 0;

  constructor(world: World);
  /** Launched from a point towards a direction (dispensers). */
  constructor(world: World, x: number, y: number, z: number, ax: number, ay: number, az: number);
  /** Shot by a mob towards a direction, with Gaussian spread 0.4. */
  constructor(world: World, shooter: EntityLiving, ax: number, ay: number, az: number);
  constructor(world: World, a?: number | EntityLiving, b?: number, c?: number, d?: number, e?: number, g?: number) {
    super(world);
    this.setSize(1, 1);
    if (a === undefined) return;
    if (typeof a === 'number') {
      this.setLocationAndAngles(a, b!, c!, this.rotationYaw, this.rotationPitch);
      this.setPosition(a, b!, c!);
      const len = MathHelper.sqrt_double(d! * d! + e! * e! + g! * g!);
      this.accelerationX = (d! / len) * 0.1;
      this.accelerationY = (e! / len) * 0.1;
      this.accelerationZ = (g! / len) * 0.1;
      return;
    }
    this.shootingEntity = a;
    this.setLocationAndAngles(a.posX, a.posY, a.posZ, a.rotationYaw, a.rotationPitch);
    this.setPosition(this.posX, this.posY, this.posZ);
    this.yOffset = 0;
    this.motionX = this.motionY = this.motionZ = 0;
    let ax = b! + this.rand.nextGaussian() * 0.4;
    let ay = c! + this.rand.nextGaussian() * 0.4;
    let az = d! + this.rand.nextGaussian() * 0.4;
    const len = MathHelper.sqrt_double(ax * ax + ay * ay + az * az);
    ax /= len;
    ay /= len;
    az /= len;
    this.accelerationX = ax * 0.1;
    this.accelerationY = ay * 0.1;
    this.accelerationZ = az * 0.1;
  }

  protected entityInit(): void {}

  override isInRangeToRenderDist(distSq: number): boolean {
    const d = this.boundingBox.getAverageEdgeLength() * 4 * 64;
    return distSq < d * d;
  }

  override onUpdate(): void {
    const w = this.worldObj;
    if ((this.shootingEntity && this.shootingEntity.isDead) || !w.blockExists(Math.trunc(this.posX), Math.trunc(this.posY), Math.trunc(this.posZ))) {
      this.setDead();
      return;
    }
    super.onUpdate();
    this.setFire(1);
    if (this.inGround) {
      if (w.getBlockId(this.xTile, this.yTile, this.zTile) === this.inTile) {
        this.ticksAlive++;
        if (this.ticksAlive === 600) this.setDead();
        return;
      }
      this.inGround = false;
      this.motionX *= f(this.rand.nextFloat() * f(0.2));
      this.motionY *= f(this.rand.nextFloat() * f(0.2));
      this.motionZ *= f(this.rand.nextFloat() * f(0.2));
      this.ticksAlive = 0;
      this.ticksInAir = 0;
    } else {
      this.ticksInAir++;
    }
    let from = new Vec3(this.posX, this.posY, this.posZ);
    let to = new Vec3(this.posX + this.motionX, this.posY + this.motionY, this.posZ + this.motionZ);
    let hit = w.rayTraceBlocks(from, to);
    from = new Vec3(this.posX, this.posY, this.posZ);
    to = new Vec3(this.posX + this.motionX, this.posY + this.motionY, this.posZ + this.motionZ);
    if (hit) to = new Vec3(hit.hitVec.xCoord, hit.hitVec.yCoord, hit.hitVec.zCoord);
    let victim: Entity | null = null;
    let best = 0;
    for (const e of w.getEntitiesWithinAABBExcludingEntity(this, this.boundingBox.addCoord(this.motionX, this.motionY, this.motionZ).expand(1, 1, 1))) {
      if (!e.canBeCollidedWith() || (this.shootingEntity && e.isEntityEqual(this.shootingEntity) && this.ticksInAir < 25)) continue;
      const g = f(0.3);
      const h = e.boundingBox.expand(g, g, g).calculateIntercept(from, to);
      if (!h) continue;
      const dist = from.distanceTo(h.hitVec);
      if (dist < best || best === 0) {
        victim = e;
        best = dist;
      }
    }
    if (victim) hit = MovingObjectPosition.forEntity(victim);
    if (hit) this.onImpact(hit);
    this.posX += this.motionX;
    this.posY += this.motionY;
    this.posZ += this.motionZ;
    const horiz = MathHelper.sqrt_double(this.motionX * this.motionX + this.motionZ * this.motionZ);
    this.rotationYaw = f(f((Math.atan2(this.motionZ, this.motionX) * 180) / PI_F) + 90);
    this.rotationPitch = f(f((Math.atan2(horiz, this.motionY) * 180) / PI_F) - 90);
    smoothRotation(this);
    let drag = this.getMotionFactor();
    if (this.isInWater()) {
      for (let i = 0; i < 4; i++) {
        const k = f(0.25);
        w.spawnParticle('bubble', this.posX - this.motionX * k, this.posY - this.motionY * k, this.posZ - this.motionZ * k, this.motionX, this.motionY, this.motionZ);
      }
      drag = f(0.8);
    }
    this.motionX += this.accelerationX;
    this.motionY += this.accelerationY;
    this.motionZ += this.accelerationZ;
    this.motionX *= drag;
    this.motionY *= drag;
    this.motionZ *= drag;
    w.spawnParticle('smoke', this.posX, this.posY + 0.5, this.posZ, 0, 0, 0);
    this.setPosition(this.posX, this.posY, this.posZ);
  }

  protected getMotionFactor(): number {
    return f(0.95);
  }

  protected abstract onImpact(hit: MovingObjectPosition): void;

  override canBeCollidedWith(): boolean {
    return true;
  }

  override getCollisionBorderSize(): number {
    return 1;
  }

  /** Punched back: flies along the attacker's look and now counts as theirs. */
  override attackEntityFrom(src: DamageSource, _amount: number): boolean {
    if (this.isEntityInvulnerable()) return false;
    this.setBeenAttacked();
    const by = src.getEntity();
    if (!by) return false;
    const look = by.getLookVec();
    if (look) {
      this.motionX = look.xCoord;
      this.motionY = look.yCoord;
      this.motionZ = look.zCoord;
      this.accelerationX = this.motionX * 0.1;
      this.accelerationY = this.motionY * 0.1;
      this.accelerationZ = this.motionZ * 0.1;
    }
    if (by.isLivingEntity) this.shootingEntity = by as EntityLiving;
    return true;
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

  override writeEntityToNBT(tag: TagCompound): void {
    NBT.setShort(tag, 'xTile', this.xTile);
    NBT.setShort(tag, 'yTile', this.yTile);
    NBT.setShort(tag, 'zTile', this.zTile);
    NBT.setByte(tag, 'inTile', this.inTile);
    NBT.setByte(tag, 'inGround', this.inGround ? 1 : 0);
    NBT.setList(tag, 'direction', NBTType.Double, NBT.doubleList(this.motionX, this.motionY, this.motionZ));
  }

  override readEntityFromNBT(tag: TagCompound): void {
    this.xTile = NBT.getShort(tag, 'xTile');
    this.yTile = NBT.getShort(tag, 'yTile');
    this.zTile = NBT.getShort(tag, 'zTile');
    this.inTile = NBT.getByte(tag, 'inTile') & 255;
    this.inGround = NBT.getByte(tag, 'inGround') === 1;
    const dir = NBT.getTagList<number>(tag, 'direction');
    if (dir.length >= 3) {
      this.motionX = Number(dir[0]) || 0;
      this.motionY = Number(dir[1]) || 0;
      this.motionZ = Number(dir[2]) || 0;
    } else {
      this.setDead();
    }
  }
}
