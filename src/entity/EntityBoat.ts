import { BlockIds, ItemIds } from '../block/BlockIds';
import { Material } from '../block/Material';
import { AxisAlignedBB } from '../core/AxisAlignedBB';
import { MathHelper } from '../core/MathHelper';
import type { World } from '../world/World';
import type { DamageSource } from './DamageSource';
import { Entity } from './Entity';
import type { EntityPlayer } from './EntityPlayer';

const f = Math.fround;

/**
 * A boat (EntityBoat): floats on water by how much of its box is submerged, is pushed by its
 * rider's movement (the multiplier ramps up from 0.07 to 0.35 while accelerating), turns
 * towards its heading by at most 20 degrees a tick, and breaks into 3 planks and 2 sticks when
 * it rams something at speed. A Creative player breaks it with one hit and no drop.
 */
export class EntityBoat extends Entity {
  private speedMultiplier = 0.07;
  /** DataWatcher 17-19: wobble after a hit, its direction, and the accumulated damage. */
  private timeSinceHit = 0;
  private forwardDirection = 1;
  private damageTaken = 0;

  constructor(world: World, x?: number, y?: number, z?: number) {
    super(world);
    this.preventEntitySpawning = true;
    this.setSize(1.5, 0.6);
    this.yOffset = f(this.height / 2);
    if (x === undefined || y === undefined || z === undefined) return;
    this.setPosition(x, y + this.yOffset, z);
    this.motionX = 0;
    this.motionY = 0;
    this.motionZ = 0;
    this.prevPosX = x;
    this.prevPosY = y;
    this.prevPosZ = z;
  }

  protected entityInit(): void {}

  protected override canTriggerWalking(): boolean {
    return false;
  }

  /** Solid to other entities: they collide with its whole box. */
  override getCollisionBox(other: Entity): AxisAlignedBB | null {
    return other.boundingBox;
  }

  override getBoundingBox(): AxisAlignedBB | null {
    return this.boundingBox;
  }

  override canBePushed(): boolean {
    return true;
  }

  override getMountedYOffset(): number {
    return this.height * 0 - f(0.3);
  }

  override attackEntityFrom(src: DamageSource, amount: number): boolean {
    if (this.isEntityInvulnerable()) return false;
    if (this.isDead) return true;
    this.setForwardDirection(-this.getForwardDirection());
    this.setTimeSinceHit(10);
    this.setDamageTaken(this.getDamageTaken() + amount * 10);
    this.setBeenAttacked();
    const by = src.getEntity();
    const creative = !!by && by.isPlayerEntity && (by as EntityPlayer).capabilities.isCreativeMode;
    if (creative || this.getDamageTaken() > 40) {
      if (this.riddenByEntity) this.riddenByEntity.mountEntity(this);
      if (!creative) this.dropItemWithOffset(ItemIds.boat, 1, 0);
      this.setDead();
    }
    return true;
  }

  override performHurtAnimation(): void {
    this.setForwardDirection(-this.getForwardDirection());
    this.setTimeSinceHit(10);
    this.setDamageTaken(this.getDamageTaken() * 11);
  }

  override canBeCollidedWith(): boolean {
    return !this.isDead;
  }

  override setVelocity(x: number, y: number, z: number): void {
    this.motionX = x;
    this.motionY = y;
    this.motionZ = z;
  }

  override onUpdate(): void {
    super.onUpdate();
    const w = this.worldObj;
    if (this.getTimeSinceHit() > 0) this.setTimeSinceHit(this.getTimeSinceHit() - 1);
    if (this.getDamageTaken() > 0) this.setDamageTaken(this.getDamageTaken() - 1);
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;

    // How much of the hull is in water, in fifths.
    const slices = 5;
    let submerged = 0;
    const bb = this.boundingBox;
    for (let i = 0; i < slices; i++) {
      const y0 = bb.minY + ((bb.maxY - bb.minY) * (i + 0)) / slices - 0.125;
      const y1 = bb.minY + ((bb.maxY - bb.minY) * (i + 1)) / slices - 0.125;
      if (w.isAABBInMaterial(AxisAlignedBB.getBoundingBox(bb.minX, y0, bb.minZ, bb.maxX, y1, bb.maxZ), Material.water)) submerged += 1 / slices;
    }

    const speedBefore = Math.sqrt(this.motionX * this.motionX + this.motionZ * this.motionZ);
    if (speedBefore > 0.26249999999999996) {
      const c = Math.cos((this.rotationYaw * Math.PI) / 180);
      const s = Math.sin((this.rotationYaw * Math.PI) / 180);
      for (let i = 0; i < 1 + speedBefore * 60; i++) {
        const along = f(f(this.rand.nextFloat() * 2) - 1);
        const side = (this.rand.nextInt(2) * 2 - 1) * 0.7;
        if (this.rand.nextBoolean()) {
          const px = this.posX - c * along * 0.8 + s * side;
          const pz = this.posZ - s * along * 0.8 - c * side;
          w.spawnParticle('splash', px, this.posY - 0.125, pz, this.motionX, this.motionY, this.motionZ);
        } else {
          const px = this.posX + c + s * along * 0.7;
          const pz = this.posZ + s - c * along * 0.7;
          w.spawnParticle('splash', px, this.posY - 0.125, pz, this.motionX, this.motionY, this.motionZ);
        }
      }
    }

    if (submerged < 1) {
      this.motionY += f(0.04) * (submerged * 2 - 1);
    } else {
      if (this.motionY < 0) this.motionY /= 2;
      this.motionY += f(0.007);
    }
    if (this.riddenByEntity) {
      this.motionX += this.riddenByEntity.motionX * this.speedMultiplier;
      this.motionZ += this.riddenByEntity.motionZ * this.speedMultiplier;
    }
    let speed = Math.sqrt(this.motionX * this.motionX + this.motionZ * this.motionZ);
    if (speed > 0.35) {
      const k = 0.35 / speed;
      this.motionX *= k;
      this.motionZ *= k;
      speed = 0.35;
    }
    if (speed > speedBefore && this.speedMultiplier < 0.35) {
      this.speedMultiplier += (0.35 - this.speedMultiplier) / 35;
      if (this.speedMultiplier > 0.35) this.speedMultiplier = 0.35;
    } else {
      this.speedMultiplier -= (this.speedMultiplier - 0.07) / 35;
      if (this.speedMultiplier < 0.07) this.speedMultiplier = 0.07;
    }
    if (this.onGround) {
      this.motionX *= 0.5;
      this.motionY *= 0.5;
      this.motionZ *= 0.5;
    }
    this.moveEntity(this.motionX, this.motionY, this.motionZ);
    if (!this.isCollidedHorizontally || !(speedBefore > 0.2)) {
      this.motionX *= f(0.99);
      this.motionY *= f(0.95);
      this.motionZ *= f(0.99);
    } else if (!this.isDead) {
      this.setDead();
      for (let i = 0; i < 3; i++) this.dropItemWithOffset(BlockIds.planks, 1, 0);
      for (let i = 0; i < 2; i++) this.dropItemWithOffset(ItemIds.stick, 1, 0);
    }

    this.rotationPitch = 0;
    let heading = this.rotationYaw;
    const dx = this.prevPosX - this.posX;
    const dz = this.prevPosZ - this.posZ;
    if (dx * dx + dz * dz > 0.001) heading = f((Math.atan2(dz, dx) * 180) / Math.PI);
    let turn = MathHelper.wrapAngleTo180_double(heading - this.rotationYaw);
    if (turn > 20) turn = 20;
    if (turn < -20) turn = -20;
    this.rotationYaw = f(this.rotationYaw + turn);
    this.setRotation(this.rotationYaw, this.rotationPitch);

    for (const e of w.getEntitiesWithinAABBExcludingEntity(this, this.boundingBox.expand(f(0.2), 0, f(0.2)))) {
      if (e !== this.riddenByEntity && e.canBePushed() && e instanceof EntityBoat) e.applyEntityCollision(this);
    }
    for (let i = 0; i < 4; i++) {
      const bx = MathHelper.floor_double(this.posX + ((i % 2) - 0.5) * 0.8);
      const bz = MathHelper.floor_double(this.posZ + (Math.trunc(i / 2) - 0.5) * 0.8);
      for (let j = 0; j < 2; j++) {
        const by = MathHelper.floor_double(this.posY) + j;
        const id = w.getBlockId(bx, by, bz);
        if (id === BlockIds.snow) w.setBlockToAir(bx, by, bz);
        else if (id === BlockIds.waterlily) w.destroyBlock(bx, by, bz, true);
      }
    }
    if (this.riddenByEntity && this.riddenByEntity.isDead) this.riddenByEntity = null;
  }

  /** The rider sits 0.4 forward of the centre. */
  override updateRiderPosition(): void {
    const r = this.riddenByEntity;
    if (!r) return;
    const ox = Math.cos((this.rotationYaw * Math.PI) / 180) * 0.4;
    const oz = Math.sin((this.rotationYaw * Math.PI) / 180) * 0.4;
    r.setPosition(this.posX + ox, this.posY + this.getMountedYOffset() + r.getYOffset(), this.posZ + oz);
  }

  override getShadowSize(): number {
    return 0;
  }

  /** Right click: get in (or, when already in, out); someone else's boat stays theirs. */
  override interact(player: EntityPlayer): boolean {
    if (this.riddenByEntity && this.riddenByEntity.isPlayerEntity && this.riddenByEntity !== player) return true;
    player.mountEntity(this);
    return true;
  }

  setDamageTaken(v: number): void {
    this.damageTaken = v;
  }

  getDamageTaken(): number {
    return this.damageTaken;
  }

  setTimeSinceHit(v: number): void {
    this.timeSinceHit = v;
  }

  getTimeSinceHit(): number {
    return this.timeSinceHit;
  }

  setForwardDirection(v: number): void {
    this.forwardDirection = v;
  }

  getForwardDirection(): number {
    return this.forwardDirection;
  }
}
