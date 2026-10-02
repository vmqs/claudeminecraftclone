import { ItemIds } from '../block/BlockIds';
import { Material } from '../block/Material';
import { AxisAlignedBB } from '../core/AxisAlignedBB';
import { MathHelper } from '../core/MathHelper';
import { MovingObjectPosition } from '../core/MovingObjectPosition';
import { Vec3 } from '../core/Vec3';
import { ItemStack } from '../item/ItemStack';
import type { World } from '../world/World';
import { DamageSource } from './DamageSource';
import { Entity } from './Entity';
import { smoothRotation, headingPitch, headingYaw } from './EntityArrow';
import { EntityItem } from './EntityItem';
import type { EntityPlayer } from './EntityPlayer';
import { EntityXPOrb } from './EntityXPOrb';

const f = Math.fround;
const PI_F = f(Math.PI);

/**
 * A fishing bobber (EntityFishHook): cast from the rod, it floats on water by how much of it is
 * submerged; every tick it has a 1 in 500 chance (1 in 300 in rain) of a bite, which pulls it
 * under with a splash for 10-40 ticks. Reeling in then (catchFish) lands a raw fish and some
 * experience; a hooked entity is pulled towards the angler.
 */
export class EntityFishHook extends Entity {
  private xTile = -1;
  private yTile = -1;
  private zTile = -1;
  private inTile = 0;
  private inGround = false;
  shake = 0;
  angler: EntityPlayer | null = null;
  private ticksInGround = 0;
  private ticksInAir = 0;
  private ticksCatchable = 0;
  /** The entity the hook is stuck in. */
  bobber: Entity | null = null;

  constructor(world: World);
  constructor(world: World, angler: EntityPlayer);
  constructor(world: World, x: number, y: number, z: number, angler: EntityPlayer);
  constructor(world: World, a?: EntityPlayer | number, y?: number, z?: number, angler?: EntityPlayer) {
    super(world);
    this.setSize(0.25, 0.25);
    this.ignoreFrustumCheck = true;
    if (a === undefined) return;
    if (typeof a === 'number') {
      this.setPosition(a, y!, z!);
      this.angler = angler!;
      angler!.fishEntity = this;
      return;
    }
    this.angler = a;
    a.fishEntity = this;
    this.setLocationAndAngles(a.posX, a.posY + 1.62 - a.yOffset, a.posZ, a.rotationYaw, a.rotationPitch);
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
    this.motionY = f(-MathHelper.sin(pitchR) * k);
    this.calculateVelocity(this.motionX, this.motionY, this.motionZ, f(1.5), 1);
  }

  protected entityInit(): void {}

  override isInRangeToRenderDist(distSq: number): boolean {
    const d = this.boundingBox.getAverageEdgeLength() * 4 * 64;
    return distSq < d * d;
  }

  calculateVelocity(x: number, y: number, z: number, velocity: number, inaccuracy: number): void {
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

  override onUpdate(): void {
    super.onUpdate();
    const w = this.worldObj;
    const angler = this.angler;
    if (!angler) {
      this.setDead();
      return;
    }
    const rod = angler.getCurrentEquippedItem();
    if (angler.isDead || !angler.isEntityAlive() || !rod || rod.itemID !== ItemIds.fishingRod || this.getDistanceSqToEntity(angler) > 1024) {
      this.setDead();
      angler.fishEntity = null;
      return;
    }
    if (this.bobber) {
      if (!this.bobber.isDead) {
        this.posX = this.bobber.posX;
        this.posY = this.bobber.boundingBox.minY + this.bobber.height * 0.8;
        this.posZ = this.bobber.posZ;
        return;
      }
      this.bobber = null;
    }
    if (this.shake > 0) this.shake--;
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
    for (const e of w.getEntitiesWithinAABBExcludingEntity(this, this.boundingBox.addCoord(this.motionX, this.motionY, this.motionZ).expand(1, 1, 1))) {
      if (!e.canBeCollidedWith() || (e === angler && this.ticksInAir < 5)) continue;
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
      if (hit.entityHit) {
        if (hit.entityHit.attackEntityFrom(DamageSource.causeThrownDamage(this, angler), 0)) this.bobber = hit.entityHit;
      } else {
        this.inGround = true;
      }
    }
    if (this.inGround) return;
    this.moveEntity(this.motionX, this.motionY, this.motionZ);
    const horiz = MathHelper.sqrt_double(this.motionX * this.motionX + this.motionZ * this.motionZ);
    this.rotationYaw = headingYaw(this.motionX, this.motionZ);
    this.rotationPitch = headingPitch(this.motionY, horiz);
    smoothRotation(this);
    let drag = f(0.92);
    if (this.onGround || this.isCollidedHorizontally) drag = f(0.5);
    const slices = 5;
    let submerged = 0;
    const bb = this.boundingBox;
    for (let i = 0; i < slices; i++) {
      const y0 = bb.minY + ((bb.maxY - bb.minY) * (i + 0)) / slices - 0.125 + 0.125;
      const y1 = bb.minY + ((bb.maxY - bb.minY) * (i + 1)) / slices - 0.125 + 0.125;
      if (w.isAABBInMaterial(AxisAlignedBB.getBoundingBox(bb.minX, y0, bb.minZ, bb.maxX, y1, bb.maxZ), Material.water)) submerged += 1 / slices;
    }
    if (submerged > 0) {
      if (this.ticksCatchable > 0) {
        this.ticksCatchable--;
      } else {
        const chance = w.canLightningStrikeAt(MathHelper.floor_double(this.posX), MathHelper.floor_double(this.posY) + 1, MathHelper.floor_double(this.posZ)) ? 300 : 500;
        if (this.rand.nextInt(chance) === 0) this.bite();
      }
    }
    if (this.ticksCatchable > 0) this.motionY -= f(f(this.rand.nextFloat() * this.rand.nextFloat()) * this.rand.nextFloat()) * 0.2;
    this.motionY += f(0.04) * (submerged * 2 - 1);
    if (submerged > 0) {
      drag = f(drag * 0.9);
      this.motionY *= 0.8;
    }
    this.motionX *= drag;
    this.motionY *= drag;
    this.motionZ *= drag;
    this.setPosition(this.posX, this.posY, this.posZ);
  }

  /** A fish bites: the bobber dips with a splash, bubbles and splash particles. */
  private bite(): void {
    const w = this.worldObj;
    this.ticksCatchable = this.rand.nextInt(30) + 10;
    this.motionY -= f(0.2);
    this.playSound('random.splash', f(0.25), f(1 + f(f(this.rand.nextFloat() - this.rand.nextFloat()) * f(0.4))));
    const surface = f(MathHelper.floor_double(this.boundingBox.minY));
    for (let i = 0; i < f(1 + f(this.width * 20)); i++) {
      const ox = f(f(f(this.rand.nextFloat() * 2) - 1) * this.width);
      const oz = f(f(f(this.rand.nextFloat() * 2) - 1) * this.width);
      w.spawnParticle('bubble', this.posX + ox, f(surface + 1), this.posZ + oz, this.motionX, this.motionY - f(this.rand.nextFloat() * f(0.2)), this.motionZ);
    }
    for (let i = 0; i < f(1 + f(this.width * 20)); i++) {
      const ox = f(f(f(this.rand.nextFloat() * 2) - 1) * this.width);
      const oz = f(f(f(this.rand.nextFloat() * 2) - 1) * this.width);
      w.spawnParticle('splash', this.posX + ox, f(surface + 1), this.posZ + oz, this.motionX, this.motionY, this.motionZ);
    }
  }

  override getShadowSize(): number {
    return 0;
  }

  /**
   * Reels in (ItemFishingRod): yanks a hooked entity towards the angler (rod damage 3), lands a
   * fish and 1-6 experience during a bite (1), or 2 when stuck in the ground; 0 otherwise.
   */
  catchFish(): number {
    const angler = this.angler;
    if (!angler) return 0;
    let wear = 0;
    if (this.bobber) {
      const dx = angler.posX - this.posX;
      const dy = angler.posY - this.posY;
      const dz = angler.posZ - this.posZ;
      const d = MathHelper.sqrt_double(dx * dx + dy * dy + dz * dz);
      const k = 0.1;
      this.bobber.motionX += dx * k;
      this.bobber.motionY += dy * k + MathHelper.sqrt_double(d) * 0.08;
      this.bobber.motionZ += dz * k;
      wear = 3;
    } else if (this.ticksCatchable > 0) {
      const fish = new EntityItem(this.worldObj, this.posX, this.posY, this.posZ, new ItemStack(ItemIds.fishRaw, 1, 0));
      const dx = angler.posX - this.posX;
      const dy = angler.posY - this.posY;
      const dz = angler.posZ - this.posZ;
      const d = MathHelper.sqrt_double(dx * dx + dy * dy + dz * dz);
      const k = 0.1;
      fish.motionX = dx * k;
      fish.motionY = dy * k + MathHelper.sqrt_double(d) * 0.08;
      fish.motionZ = dz * k;
      this.worldObj.spawnEntityInWorld(fish);
      angler.worldObj.spawnEntityInWorld(new EntityXPOrb(angler.worldObj, angler.posX, angler.posY + 0.5, angler.posZ + 0.5, this.rand.nextInt(6) + 1));
      wear = 1;
    }
    if (this.inGround) wear = 2;
    this.setDead();
    angler.fishEntity = null;
    return wear;
  }

  override setDead(): void {
    super.setDead();
    if (this.angler) this.angler.fishEntity = null;
  }
}
