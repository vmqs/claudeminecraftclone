import { BlockIds } from '../block/BlockIds';
import { MathHelper } from '../core/MathHelper';
import { EnumMovingObjectType, MovingObjectPosition } from '../core/MovingObjectPosition';
import { Vec3 } from '../core/Vec3';
import type { World } from '../world/World';
import { headingPitch, headingYaw, smoothRotation } from './EntityArrow';
import { Entity } from './Entity';
import type { EntityLiving } from './EntityLiving';
import type { IProjectile } from './IProjectile';
import type { TagCompound } from '../item/ItemStack';
import { NBT } from '../world/storage/NBT';

const f = Math.fround;
const PI_F = f(Math.PI);

/**
 * Base of thrown items (EntityThrowable: snowballs, eggs, ender pearls, bottles o' enchanting,
 * splash potions): launched from the thrower's eyes, fly with drag 0.99 (0.8 in water) and a
 * per-class gravity, and call onImpact on the first block or entity on their path.
 */
export abstract class EntityThrowable extends Entity implements IProjectile {
  private xTile = -1;
  private yTile = -1;
  private zTile = -1;
  private inTile = 0;
  protected inGround = false;
  throwableShake = 0;
  private thrower: EntityLiving | null = null;
  private throwerName: string | null = null;
  private ticksInGround = 0;
  private ticksInAir = 0;

  constructor(world: World);
  constructor(world: World, thrower: EntityLiving);
  constructor(world: World, x: number, y: number, z: number);
  constructor(world: World, a?: EntityLiving | number, y?: number, z?: number) {
    super(world);
    this.setSize(0.25, 0.25);
    if (a === undefined) return;
    if (typeof a === 'number') {
      this.ticksInGround = 0;
      this.setPosition(a, y!, z!);
      this.yOffset = 0;
      return;
    }
    this.thrower = a;
    this.setLocationAndAngles(a.posX, a.posY + a.getEyeHeight(), a.posZ, a.rotationYaw, a.rotationPitch);
    const yawR = f(f(this.rotationYaw / 180) * PI_F);
    const pitchR = f(f(this.rotationPitch / 180) * PI_F);
    this.posX -= f(MathHelper.cos(yawR) * f(0.16));
    this.posY -= f(0.1);
    this.posZ -= f(MathHelper.sin(yawR) * f(0.16));
    this.setPosition(this.posX, this.posY, this.posZ);
    this.yOffset = 0;
    const k = f(0.4);
    this.motionX = f(f(-MathHelper.sin(yawR) * MathHelper.cos(pitchR)) * k);
    this.motionZ = f(f(MathHelper.cos(yawR) * MathHelper.cos(pitchR)) * k);
    this.motionY = f(-MathHelper.sin(f(f(f(this.rotationPitch + this.getThrowPitchOffset()) / 180) * PI_F)) * k);
    this.setThrowableHeading(this.motionX, this.motionY, this.motionZ, this.getThrowVelocity(), 1);
  }

  protected entityInit(): void {}

  /** Thrown things stay visible further than their tiny box suggests. */
  override isInRangeToRenderDist(distSq: number): boolean {
    const d = this.boundingBox.getAverageEdgeLength() * 4 * 64;
    return distSq < d * d;
  }

  /** Launch speed (func_70182_d). */
  protected getThrowVelocity(): number {
    return f(1.5);
  }

  /** Added to the thrower's pitch for the launch direction (func_70183_g; bottles aim 20 degrees up). */
  protected getThrowPitchOffset(): number {
    return 0;
  }

  setThrowableHeading(x: number, y: number, z: number, velocity: number, inaccuracy: number): void {
    const len = MathHelper.sqrt_double(x * x + y * y + z * z);
    x /= len;
    y /= len;
    z /= len;
    x += this.rand.nextGaussian() * f(0.0075) * inaccuracy;
    y += this.rand.nextGaussian() * f(0.0075) * inaccuracy;
    z += this.rand.nextGaussian() * f(0.0075) * inaccuracy;
    x *= velocity;
    y *= velocity;
    z *= velocity;
    this.motionX = x;
    this.motionY = y;
    this.motionZ = z;
    const horiz = MathHelper.sqrt_double(x * x + z * z);
    this.prevRotationYaw = this.rotationYaw = headingYaw(x, z);
    this.prevRotationPitch = this.rotationPitch = headingPitch(y, horiz);
    this.ticksInGround = 0;
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
    if (this.throwableShake > 0) this.throwableShake--;
    const w = this.worldObj;
    if (this.inGround) {
      if (w.getBlockId(this.xTile, this.yTile, this.zTile) === this.inTile) {
        this.ticksInGround++;
        if (this.ticksInGround === 1200) this.setDead();
        return;
      }
      this.inGround = false;
      this.motionX *= f(this.rand.nextFloat() * f(0.2));
      this.motionY *= f(this.rand.nextFloat() * f(0.2));
      this.motionZ *= f(this.rand.nextFloat() * f(0.2));
      this.ticksInGround = 0;
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
    const thrower = this.getThrower();
    for (const e of w.getEntitiesWithinAABBExcludingEntity(this, this.boundingBox.addCoord(this.motionX, this.motionY, this.motionZ).expand(1, 1, 1))) {
      if (!e.canBeCollidedWith() || (e === thrower && this.ticksInAir < 5)) continue;
      const g = f(0.3);
      const h = e.boundingBox.expand(g, g, g).calculateIntercept(from, to);
      if (!h) continue;
      const d = from.distanceTo(h.hitVec);
      if (d < best || best === 0) {
        victim = e;
        best = d;
      }
    }
    if (victim) hit = MovingObjectPosition.forEntity(victim);
    if (hit) {
      if (hit.typeOfHit === EnumMovingObjectType.TILE && w.getBlockId(hit.blockX, hit.blockY, hit.blockZ) === BlockIds.portal) this.setInPortal();
      else this.onImpact(hit);
    }
    this.posX += this.motionX;
    this.posY += this.motionY;
    this.posZ += this.motionZ;
    const horiz = MathHelper.sqrt_double(this.motionX * this.motionX + this.motionZ * this.motionZ);
    this.rotationYaw = headingYaw(this.motionX, this.motionZ);
    this.rotationPitch = headingPitch(this.motionY, horiz);
    smoothRotation(this);
    let drag = f(0.99);
    const gravity = this.getGravityVelocity();
    if (this.isInWater()) {
      for (let i = 0; i < 4; i++) {
        const k = f(0.25);
        w.spawnParticle('bubble', this.posX - this.motionX * k, this.posY - this.motionY * k, this.posZ - this.motionZ * k, this.motionX, this.motionY, this.motionZ);
      }
      drag = f(0.8);
    }
    this.motionX *= drag;
    this.motionY *= drag;
    this.motionZ *= drag;
    this.motionY -= gravity;
    this.setPosition(this.posX, this.posY, this.posZ);
  }

  protected getGravityVelocity(): number {
    return f(0.03);
  }

  /**
   * Hit something. Only the client's copy of a thrown item spawns the impact particles, and
   * it only ever detects blocks, so entity hits show none (impactParticlesVisible).
   */
  protected abstract onImpact(hit: MovingObjectPosition): void;

  /** Whether the impact puff is seen: the client copy detects block hits only. */
  protected impactParticlesVisible(hit: MovingObjectPosition): boolean {
    return hit.entityHit === null;
  }

  override getShadowSize(): number {
    return 0;
  }

  getThrower(): EntityLiving | null {
    if (!this.thrower && this.throwerName) this.thrower = this.worldObj.getPlayerEntityByName(this.throwerName);
    return this.thrower;
  }

  /** Sets who threw it (dispensers leave it empty). */
  setThrower(e: EntityLiving | null): void {
    this.thrower = e;
    this.throwerName = e?.isPlayerEntity ? e.getEntityName() : null;
  }

  override writeEntityToNBT(tag: TagCompound): void {
    NBT.setShort(tag, 'xTile', this.xTile);
    NBT.setShort(tag, 'yTile', this.yTile);
    NBT.setShort(tag, 'zTile', this.zTile);
    NBT.setByte(tag, 'inTile', this.inTile);
    NBT.setByte(tag, 'shake', this.throwableShake);
    NBT.setByte(tag, 'inGround', this.inGround ? 1 : 0);
    if (!this.throwerName && this.thrower?.isPlayerEntity) this.throwerName = this.thrower.getEntityName();
    NBT.setString(tag, 'ownerName', this.throwerName ?? '');
  }

  override readEntityFromNBT(tag: TagCompound): void {
    this.xTile = NBT.getShort(tag, 'xTile');
    this.yTile = NBT.getShort(tag, 'yTile');
    this.zTile = NBT.getShort(tag, 'zTile');
    this.inTile = NBT.getByte(tag, 'inTile') & 255;
    this.throwableShake = NBT.getByte(tag, 'shake') & 255;
    this.inGround = NBT.getByte(tag, 'inGround') === 1;
    const owner = NBT.getString(tag, 'ownerName');
    this.throwerName = owner.length > 0 ? owner : null;
  }
}
