import { Block } from '../block/Block';
import { ItemIds } from '../block/BlockIds';
import { MathHelper } from '../core/MathHelper';
import { MovingObjectPosition } from '../core/MovingObjectPosition';
import { Vec3 } from '../core/Vec3';
import { ItemStack } from '../item/ItemStack';
import type { World } from '../world/World';
import { DamageSource } from './DamageSource';
import { applyThorns } from './EnchantmentHooks';
import { Entity } from './Entity';
import { EntityList } from './EntityList';
import type { EntityLiving } from './EntityLiving';
import type { EntityPlayer } from './EntityPlayer';
import type { IProjectile } from './IProjectile';

const f = Math.fround;
const PI_F = f(Math.PI);

/** Yaw and pitch (degrees) of a motion vector, as projectiles face their flight. */
export function headingYaw(mx: number, mz: number): number {
  return f((Math.atan2(mx, mz) * 180) / PI_F);
}
export function headingPitch(my: number, horizontal: number): number {
  return f((Math.atan2(my, horizontal) * 180) / PI_F);
}

/**
 * An arrow (EntityArrow): flies with gravity 0.05 and drag 0.99 (0.8 in water), hits the first
 * entity on its path (box grown by 0.3) for ceil(speed x damage) (+ random critical bonus), or
 * sticks in a block, shaking, until the block changes. Creative players are never hit.
 * canBePickedUp: 0 never, 1 by anyone (gives an arrow), 2 by Creative players only.
 */
export class EntityArrow extends Entity implements IProjectile {
  private xTile = -1;
  private yTile = -1;
  private zTile = -1;
  private inTile = 0;
  private inData = 0;
  private inGround = false;
  canBePickedUp = 0;
  arrowShake = 0;
  shootingEntity: Entity | null = null;
  private ticksInGround = 0;
  private ticksInAir = 0;
  private damage = 2;
  private knockbackStrength = 0;
  /** DataWatcher 16 bit 0. */
  private critical = false;

  constructor(world: World);
  constructor(world: World, x: number, y: number, z: number);
  /** A mob (skeleton) shooting at a target, aiming a little above its feet. */
  constructor(world: World, shooter: EntityLiving, target: EntityLiving, velocity: number, inaccuracy: number);
  /** A bow drawn by a player or mob looking along its view; velocity is the draw strength (0-1) x 2. */
  constructor(world: World, shooter: EntityLiving, velocity: number);
  constructor(world: World, a?: number | EntityLiving, b?: number | EntityLiving, c?: number, d?: number) {
    super(world);
    this.renderDistanceWeight = 10;
    if (a === undefined) {
      this.setSize(0.5, 0.5);
    } else if (typeof a === 'number') {
      this.setSize(0.5, 0.5);
      this.setPosition(a, b as number, c!);
      this.yOffset = 0;
    } else if (typeof b === 'object') {
      const shooter = a;
      const target = b;
      this.shootingEntity = shooter;
      if (shooter.isPlayerEntity) this.canBePickedUp = 1;
      this.posY = shooter.posY + shooter.getEyeHeight() - f(0.1);
      const dx = target.posX - shooter.posX;
      const dy = target.boundingBox.minY + f(target.height / 3) - this.posY;
      const dz = target.posZ - shooter.posZ;
      const horiz = MathHelper.sqrt_double(dx * dx + dz * dz);
      if (!(horiz < 1.0e-7)) {
        const yaw = f(headingYaw(dz, dx) - 90);
        const pitch = f(-headingPitch(dy, horiz));
        this.setLocationAndAngles(shooter.posX + dx / horiz, this.posY, shooter.posZ + dz / horiz, yaw, pitch);
        this.yOffset = 0;
        const lift = f(horiz * f(0.2));
        this.setThrowableHeading(dx, dy + lift, dz, c!, d!);
      }
    } else {
      const shooter = a;
      this.shootingEntity = shooter;
      if (shooter.isPlayerEntity) this.canBePickedUp = 1;
      this.setSize(0.5, 0.5);
      this.setLocationAndAngles(shooter.posX, shooter.posY + shooter.getEyeHeight(), shooter.posZ, shooter.rotationYaw, shooter.rotationPitch);
      const yawR = f(f(this.rotationYaw / 180) * PI_F);
      const pitchR = f(f(this.rotationPitch / 180) * PI_F);
      this.posX -= f(MathHelper.cos(yawR) * f(0.16));
      this.posY -= f(0.1);
      this.posZ -= f(MathHelper.sin(yawR) * f(0.16));
      this.setPosition(this.posX, this.posY, this.posZ);
      this.yOffset = 0;
      this.motionX = f(-MathHelper.sin(yawR) * MathHelper.cos(pitchR));
      this.motionZ = f(MathHelper.cos(yawR) * MathHelper.cos(pitchR));
      this.motionY = -MathHelper.sin(pitchR);
      this.setThrowableHeading(this.motionX, this.motionY, this.motionZ, f((b as number) * f(1.5)), 1);
    }
  }

  protected entityInit(): void {}

  setThrowableHeading(x: number, y: number, z: number, velocity: number, inaccuracy: number): void {
    const len = MathHelper.sqrt_double(x * x + y * y + z * z);
    x /= len;
    y /= len;
    z /= len;
    const spread = f(0.0075);
    x += this.rand.nextGaussian() * (this.rand.nextBoolean() ? -1 : 1) * spread * inaccuracy;
    y += this.rand.nextGaussian() * (this.rand.nextBoolean() ? -1 : 1) * spread * inaccuracy;
    z += this.rand.nextGaussian() * (this.rand.nextBoolean() ? -1 : 1) * spread * inaccuracy;
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

  override setPositionAndRotation2(x: number, y: number, z: number, yaw: number, pitch: number, _inc: number): void {
    this.setPosition(x, y, z);
    this.setRotation(yaw, pitch);
  }

  override setVelocity(x: number, y: number, z: number): void {
    this.motionX = x;
    this.motionY = y;
    this.motionZ = z;
    if (this.prevRotationPitch === 0 && this.prevRotationYaw === 0) {
      const horiz = MathHelper.sqrt_double(x * x + z * z);
      this.prevRotationYaw = this.rotationYaw = headingYaw(x, z);
      this.prevRotationPitch = this.rotationPitch = headingPitch(y, horiz);
      this.setLocationAndAngles(this.posX, this.posY, this.posZ, this.rotationYaw, this.rotationPitch);
      this.ticksInGround = 0;
    }
  }

  override onUpdate(): void {
    super.onUpdate();
    const w = this.worldObj;
    if (this.prevRotationPitch === 0 && this.prevRotationYaw === 0) {
      const horiz = MathHelper.sqrt_double(this.motionX * this.motionX + this.motionZ * this.motionZ);
      this.prevRotationYaw = this.rotationYaw = headingYaw(this.motionX, this.motionZ);
      this.prevRotationPitch = this.rotationPitch = headingPitch(this.motionY, horiz);
    }
    const stuckId = w.getBlockId(this.xTile, this.yTile, this.zTile);
    if (stuckId > 0) {
      const b = Block.blocksList[stuckId];
      if (b) {
        b.setBlockBoundsBasedOnState(w, this.xTile, this.yTile, this.zTile);
        const box = b.getCollisionBoundingBoxFromPool(w, this.xTile, this.yTile, this.zTile);
        if (box && box.isVecInside(new Vec3(this.posX, this.posY, this.posZ))) this.inGround = true;
      }
    }
    if (this.arrowShake > 0) this.arrowShake--;

    if (this.inGround) {
      const id = w.getBlockId(this.xTile, this.yTile, this.zTile);
      const meta = w.getBlockMetadata(this.xTile, this.yTile, this.zTile);
      if (id === this.inTile && meta === this.inData) {
        this.ticksInGround++;
        if (this.ticksInGround === 1200) this.setDead();
      } else {
        this.inGround = false;
        this.motionX *= f(this.rand.nextFloat() * f(0.2));
        this.motionY *= f(this.rand.nextFloat() * f(0.2));
        this.motionZ *= f(this.rand.nextFloat() * f(0.2));
        this.ticksInGround = 0;
        this.ticksInAir = 0;
      }
      return;
    }

    this.ticksInAir++;
    let from = new Vec3(this.posX, this.posY, this.posZ);
    let to = new Vec3(this.posX + this.motionX, this.posY + this.motionY, this.posZ + this.motionZ);
    let hit = w.rayTraceBlocks_do_do(from, to, false, true);
    from = new Vec3(this.posX, this.posY, this.posZ);
    to = new Vec3(this.posX + this.motionX, this.posY + this.motionY, this.posZ + this.motionZ);
    if (hit) to = new Vec3(hit.hitVec.xCoord, hit.hitVec.yCoord, hit.hitVec.zCoord);
    let victim: Entity | null = null;
    let best = 0;
    const list = w.getEntitiesWithinAABBExcludingEntity(this, this.boundingBox.addCoord(this.motionX, this.motionY, this.motionZ).expand(1, 1, 1));
    for (const e of list) {
      if (!e.canBeCollidedWith() || (e === this.shootingEntity && this.ticksInAir < 5)) continue;
      const g = f(0.3);
      const box = e.boundingBox.expand(g, g, g);
      const h = box.calculateIntercept(from, to);
      if (!h) continue;
      const d = from.distanceTo(h.hitVec);
      if (d < best || best === 0) {
        victim = e;
        best = d;
      }
    }
    if (victim) hit = MovingObjectPosition.forEntity(victim);
    if (hit?.entityHit?.isPlayerEntity) {
      const p = hit.entityHit as EntityPlayer;
      if (p.capabilities.disableDamage) hit = null;
    }

    if (hit) {
      if (hit.entityHit) {
        this.hitEntity(hit.entityHit);
      } else {
        this.xTile = hit.blockX;
        this.yTile = hit.blockY;
        this.zTile = hit.blockZ;
        this.inTile = w.getBlockId(this.xTile, this.yTile, this.zTile);
        this.inData = w.getBlockMetadata(this.xTile, this.yTile, this.zTile);
        this.motionX = f(hit.hitVec.xCoord - this.posX);
        this.motionY = f(hit.hitVec.yCoord - this.posY);
        this.motionZ = f(hit.hitVec.zCoord - this.posZ);
        const len = MathHelper.sqrt_double(this.motionX * this.motionX + this.motionY * this.motionY + this.motionZ * this.motionZ);
        this.posX -= (this.motionX / len) * f(0.05);
        this.posY -= (this.motionY / len) * f(0.05);
        this.posZ -= (this.motionZ / len) * f(0.05);
        this.playSound('random.bowhit', 1, f(f(1.2) / f(f(this.rand.nextFloat() * f(0.2)) + f(0.9))));
        this.inGround = true;
        this.arrowShake = 7;
        this.setIsCritical(false);
        if (this.inTile !== 0) Block.blocksList[this.inTile]?.onEntityCollidedWithBlock(w, this.xTile, this.yTile, this.zTile, this);
      }
    }

    if (this.getIsCritical()) {
      for (let i = 0; i < 4; i++) {
        w.spawnParticle('crit', this.posX + (this.motionX * i) / 4, this.posY + (this.motionY * i) / 4, this.posZ + (this.motionZ * i) / 4, -this.motionX, -this.motionY + 0.2, -this.motionZ);
      }
    }
    this.posX += this.motionX;
    this.posY += this.motionY;
    this.posZ += this.motionZ;
    const horiz = MathHelper.sqrt_double(this.motionX * this.motionX + this.motionZ * this.motionZ);
    this.rotationYaw = headingYaw(this.motionX, this.motionZ);
    this.rotationPitch = headingPitch(this.motionY, horiz);
    smoothRotation(this);
    let drag = f(0.99);
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
    this.motionY -= f(0.05);
    this.setPosition(this.posX, this.posY, this.posZ);
    this.doBlockCollisions();
  }

  /** Damage, fire, knockback and the hit sound; bounces back when the hit was refused. */
  private hitEntity(target: Entity): void {
    const speed = MathHelper.sqrt_double(this.motionX * this.motionX + this.motionY * this.motionY + this.motionZ * this.motionZ);
    let dmg = MathHelper.ceiling_double_int(speed * this.damage);
    if (this.getIsCritical()) dmg += this.rand.nextInt(Math.trunc(dmg / 2) + 2);
    const src = DamageSource.causeArrowDamage(this, this.shootingEntity ?? this);
    const isEnderman = EntityList.getEntityString(target) === 'Enderman';
    if (this.isBurning() && !isEnderman) target.setFire(5);
    if (target.attackEntityFrom(src, dmg)) {
      if (target.isLivingEntity) {
        const living = target as EntityLiving;
        living.setArrowCountInEntity(living.getArrowCountInEntity() + 1);
        if (this.knockbackStrength > 0) {
          const h = MathHelper.sqrt_double(this.motionX * this.motionX + this.motionZ * this.motionZ);
          if (h > 0) target.addVelocity((this.motionX * this.knockbackStrength * f(0.6)) / h, 0.1, (this.motionZ * this.knockbackStrength * f(0.6)) / h);
        }
        if (this.shootingEntity) applyThorns(this.shootingEntity, living, this.rand);
      }
      this.playSound('random.bowhit', 1, f(f(1.2) / f(f(this.rand.nextFloat() * f(0.2)) + f(0.9))));
      if (!isEnderman) this.setDead();
    } else {
      this.motionX *= f(-0.1);
      this.motionY *= f(-0.1);
      this.motionZ *= f(-0.1);
      this.rotationYaw = f(this.rotationYaw + 180);
      this.prevRotationYaw = f(this.prevRotationYaw + 180);
      this.ticksInAir = 0;
    }
  }

  /** Walks into a stuck arrow: picked up when allowed (Creative players take type-2 arrows without an item). */
  override onCollideWithPlayer(player: EntityPlayer): void {
    if (!this.inGround || this.arrowShake > 0) return;
    let take = this.canBePickedUp === 1 || (this.canBePickedUp === 2 && player.capabilities.isCreativeMode);
    if (this.canBePickedUp === 1 && !player.inventory.addItemStackToInventory(new ItemStack(ItemIds.arrow, 1, 0))) take = false;
    if (!take) return;
    this.playSound('random.pop', f(0.2), f(f(f(f(this.rand.nextFloat() - this.rand.nextFloat()) * f(0.7)) + 1) * 2));
    player.onItemPickup(this, 1);
    this.setDead();
  }

  protected override canTriggerWalking(): boolean {
    return false;
  }

  override getShadowSize(): number {
    return 0;
  }

  setDamage(d: number): void {
    this.damage = d;
  }

  getDamage(): number {
    return this.damage;
  }

  setKnockbackStrength(k: number): void {
    this.knockbackStrength = k;
  }

  override canAttackWithItem(): boolean {
    return false;
  }

  setIsCritical(v: boolean): void {
    this.critical = v;
  }

  getIsCritical(): boolean {
    return this.critical;
  }

  /** Whether the arrow is stuck in a block (renderers and pickup). */
  isInGround(): boolean {
    return this.inGround;
  }
}

/** Projectiles turn towards their flight direction by 20% per tick (yaw and pitch unwrapped first). */
export function smoothRotation(e: Entity): void {
  while (e.rotationPitch - e.prevRotationPitch < -180) e.prevRotationPitch -= 360;
  while (e.rotationPitch - e.prevRotationPitch >= 180) e.prevRotationPitch += 360;
  while (e.rotationYaw - e.prevRotationYaw < -180) e.prevRotationYaw -= 360;
  while (e.rotationYaw - e.prevRotationYaw >= 180) e.prevRotationYaw += 360;
  e.rotationPitch = f(e.prevRotationPitch + f(f(e.rotationPitch - e.prevRotationPitch) * f(0.2)));
  e.rotationYaw = f(e.prevRotationYaw + f(f(e.rotationYaw - e.prevRotationYaw) * f(0.2)));
}
