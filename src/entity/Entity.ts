import { Block } from '../block/Block';
import { BlockFluid } from '../block/BlockFluid';
import { BlockIds } from '../block/BlockIds';
import { Material } from '../block/Material';
import { AxisAlignedBB } from '../core/AxisAlignedBB';
import { JavaRandom } from '../core/JavaRandom';
import { MathHelper } from '../core/MathHelper';
import { Vec3 } from '../core/Vec3';
import { ItemStack } from '../item/ItemStack';
import type { EnumCreatureType } from '../world/biome/SpawnListEntry';
import type { Explosion } from '../world/Explosion';
import type { World } from '../world/World';
import { I18n } from '../core/I18n';
import { DamageSource } from './DamageSource';
import { fireProtectedTicks } from './EnchantmentHooks';
import { EntityList } from './EntityList';
import type { EntityPlayer } from './EntityPlayer';

const f = Math.fround;

let nextEntityID = 0;

/** Base of everything that moves in the world. Mirrors net.minecraft.src.Entity. */
export abstract class Entity {
  entityId = nextEntityID++;
  renderDistanceWeight = 1.0;
  preventEntitySpawning = false;
  riddenByEntity: Entity | null = null;
  ridingEntity: Entity | null = null;
  /** Spawn even when chunks are missing (World.spawnEntityInWorld). */
  forceSpawn = false;
  /** True for EntityPlayer instances; avoids a runtime import cycle. */
  get isPlayerEntity(): boolean {
    return false;
  }
  /** True for EntityLiving instances (instanceof without the import cycle). */
  get isLivingEntity(): boolean {
    return false;
  }
  /** Hostile (implements IMob in the original): monsters, slimes, ghasts. */
  get isIMob(): boolean {
    return false;
  }
  /** Natural-spawning category this entity counts towards (animals, ambient, water), if any. */
  get creatureType(): EnumCreatureType | null {
    return null;
  }
  worldObj: World;
  prevPosX = 0;
  prevPosY = 0;
  prevPosZ = 0;
  posX = 0;
  posY = 0;
  posZ = 0;
  motionX = 0;
  motionY = 0;
  motionZ = 0;
  rotationYaw = 0;
  rotationPitch = 0;
  prevRotationYaw = 0;
  prevRotationPitch = 0;
  readonly boundingBox = AxisAlignedBB.getBoundingBox(0, 0, 0, 0, 0, 0);
  onGround = false;
  isCollidedHorizontally = false;
  isCollidedVertically = false;
  isCollided = false;
  velocityChanged = false;
  protected isInWeb = false;
  /** field_70135_K: when false any collision cancels all movement. */
  field_70135_K = true;
  isDead = false;
  yOffset = 0;
  width = f(0.6);
  height = f(1.8);
  prevDistanceWalkedModified = 0;
  distanceWalkedModified = 0;
  distanceWalkedOnStepModified = 0;
  fallDistance = 0;
  private nextStepDistance = 1;
  lastTickPosX = 0;
  lastTickPosY = 0;
  lastTickPosZ = 0;
  ySize = 0;
  stepHeight = 0;
  noClip = false;
  entityCollisionReduction = 0;
  protected rand = new JavaRandom(BigInt(Math.floor(Math.random() * 2 ** 48)));
  ticksExisted = 0;
  fireResistance = 1;
  private fire = 0;
  protected inWater = false;
  hurtResistantTime = 0;
  private firstUpdate = true;
  protected isImmuneToFire_ = false;
  /** DataWatcher slot 0 (flags) and 1 (air). */
  private watcherFlags = 0;
  private watcherAir = 300;
  private entityRiderPitchDelta = 0;
  private entityRiderYawDelta = 0;
  addedToChunk = false;
  chunkCoordX = 0;
  chunkCoordY = 0;
  chunkCoordZ = 0;
  ignoreFrustumCheck = false;
  isAirBorne = false;
  timeUntilPortal = 0;
  protected inPortal = false;
  dimension = 0;
  private invulnerable = false;

  constructor(world: World) {
    this.worldObj = world;
    this.setPosition(0, 0, 0);
    if (world) this.dimension = world.provider.dimensionId;
    this.entityInit();
  }

  protected abstract entityInit(): void;

  protected preparePlayerToSpawn(): void {
    while (this.posY > 0) {
      this.setPosition(this.posX, this.posY, this.posZ);
      if (this.worldObj.getCollidingBoundingBoxes(this, this.boundingBox).length === 0) break;
      this.posY++;
    }
    this.motionX = this.motionY = this.motionZ = 0;
    this.rotationPitch = 0;
  }

  setDead(): void {
    this.isDead = true;
  }

  protected setSize(w: number, h: number): void {
    w = f(w);
    h = f(h);
    if (w !== this.width || h !== this.height) {
      this.width = w;
      this.height = h;
      this.boundingBox.maxX = this.boundingBox.minX + w;
      this.boundingBox.maxZ = this.boundingBox.minZ + w;
      this.boundingBox.maxY = this.boundingBox.minY + h;
    }
  }

  protected setRotation(yaw: number, pitch: number): void {
    this.rotationYaw = f(yaw % 360);
    this.rotationPitch = f(pitch % 360);
  }

  setPosition(x: number, y: number, z: number): void {
    this.posX = x;
    this.posY = y;
    this.posZ = z;
    const hw = f(this.width / 2);
    const minY = y - this.yOffset + this.ySize;
    this.boundingBox.setBounds(x - hw, minY, z - hw, x + hw, minY + this.height, z + hw);
  }

  /** Mouse look: yaw/pitch deltas scaled by 0.15 with the pitch clamped to ±90. */
  setAngles(dYaw: number, dPitch: number): void {
    const oldPitch = this.rotationPitch;
    const oldYaw = this.rotationYaw;
    this.rotationYaw = f(this.rotationYaw + dYaw * 0.15);
    this.rotationPitch = f(this.rotationPitch - dPitch * 0.15);
    if (this.rotationPitch < -90) this.rotationPitch = -90;
    if (this.rotationPitch > 90) this.rotationPitch = 90;
    this.prevRotationPitch = f(this.prevRotationPitch + (this.rotationPitch - oldPitch));
    this.prevRotationYaw = f(this.prevRotationYaw + (this.rotationYaw - oldYaw));
  }

  onUpdate(): void {
    this.onEntityUpdate();
  }

  onEntityUpdate(): void {
    if (this.ridingEntity && this.ridingEntity.isDead) this.ridingEntity = null;
    this.prevDistanceWalkedModified = this.distanceWalkedModified;
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    this.prevRotationPitch = this.rotationPitch;
    this.prevRotationYaw = this.rotationYaw;
    if (this.timeUntilPortal > 0) this.timeUntilPortal--;

    if (this.isSprinting() && !this.isInWater()) {
      const x = MathHelper.floor_double(this.posX);
      const y = MathHelper.floor_double(this.posY - f(0.2) - this.yOffset);
      const z = MathHelper.floor_double(this.posZ);
      const id = this.worldObj.getBlockId(x, y, z);
      if (id > 0) {
        this.worldObj.spawnParticle(
          `tilecrack_${id}_${this.worldObj.getBlockMetadata(x, y, z)}`,
          this.posX + (this.rand.nextFloat() - 0.5) * this.width,
          this.boundingBox.minY + 0.1,
          this.posZ + (this.rand.nextFloat() - 0.5) * this.width,
          -this.motionX * 4,
          1.5,
          -this.motionZ * 4,
        );
      }
    }

    this.handleWaterMovement();
    if (this.fire > 0) {
      if (this.isImmuneToFire_) {
        this.fire -= 4;
        if (this.fire < 0) this.fire = 0;
      } else {
        if (this.fire % 20 === 0) this.attackEntityFrom(DamageSource.onFire, 1);
        this.fire--;
      }
    }
    if (this.handleLavaMovement()) {
      this.setOnFireFromLava();
      this.fallDistance = f(this.fallDistance * 0.5);
    }
    if (this.posY < -64) this.kill();
    this.setFlag(0, this.fire > 0);
    this.setFlag(2, this.ridingEntity !== null);
    this.firstUpdate = false;
  }

  protected setOnFireFromLava(): void {
    if (!this.isImmuneToFire_) {
      this.attackEntityFrom(DamageSource.lava, 4);
      this.setFire(15);
    }
  }

  setFire(seconds: number): void {
    const t = fireProtectedTicks(this, seconds * 20);
    if (this.fire < t) this.fire = t;
  }

  extinguish(): void {
    this.fire = 0;
  }

  protected kill(): void {
    this.setDead();
  }

  isOffsetPositionInLiquid(dx: number, dy: number, dz: number): boolean {
    const bb = this.boundingBox.getOffsetBoundingBox(dx, dy, dz);
    const list = this.worldObj.getCollidingBoundingBoxes(this, bb);
    return list.length > 0 ? false : !this.worldObj.isAnyLiquid(bb);
  }

  /** Collision-resolved movement including stepping and the sneaking edge guard. */
  moveEntity(dx: number, dy: number, dz: number): void {
    if (this.noClip) {
      this.boundingBox.offset(dx, dy, dz);
      this.posX = (this.boundingBox.minX + this.boundingBox.maxX) / 2;
      this.posY = this.boundingBox.minY + this.yOffset - this.ySize;
      this.posZ = (this.boundingBox.minZ + this.boundingBox.maxZ) / 2;
      return;
    }
    this.ySize = f(this.ySize * f(0.4));
    const startX = this.posX;
    const startY = this.posY;
    const startZ = this.posZ;
    if (this.isInWeb) {
      this.isInWeb = false;
      dx *= 0.25;
      dy *= f(0.05);
      dz *= 0.25;
      this.motionX = 0;
      this.motionY = 0;
      this.motionZ = 0;
    }
    let origX = dx;
    const origY = dy;
    let origZ = dz;
    const bbCopy = this.boundingBox.copy();
    const w = this.worldObj;
    const sneakGuard = this.onGround && this.isSneaking() && this.isPlayerEntity;
    if (sneakGuard) {
      const step = 0.05;
      for (; dx !== 0 && w.getCollidingBoundingBoxes(this, this.boundingBox.getOffsetBoundingBox(dx, -1, 0)).length === 0; origX = dx) {
        if (dx < step && dx >= -step) dx = 0;
        else if (dx > 0) dx -= step;
        else dx += step;
      }
      for (; dz !== 0 && w.getCollidingBoundingBoxes(this, this.boundingBox.getOffsetBoundingBox(0, -1, dz)).length === 0; origZ = dz) {
        if (dz < step && dz >= -step) dz = 0;
        else if (dz > 0) dz -= step;
        else dz += step;
      }
      while (dx !== 0 && dz !== 0 && w.getCollidingBoundingBoxes(this, this.boundingBox.getOffsetBoundingBox(dx, -1, dz)).length === 0) {
        if (dx < step && dx >= -step) dx = 0;
        else if (dx > 0) dx -= step;
        else dx += step;
        if (dz < step && dz >= -step) dz = 0;
        else if (dz > 0) dz -= step;
        else dz += step;
        origX = dx;
        origZ = dz;
      }
    }

    let boxes = w.getCollidingBoundingBoxes(this, this.boundingBox.addCoord(dx, dy, dz));
    for (const b of boxes) dy = b.calculateYOffset(this.boundingBox, dy);
    this.boundingBox.offset(0, dy, 0);
    if (!this.field_70135_K && origY !== dy) dx = dy = dz = 0;
    const canStep = this.onGround || (origY !== dy && origY < 0);
    for (const b of boxes) dx = b.calculateXOffset(this.boundingBox, dx);
    this.boundingBox.offset(dx, 0, 0);
    if (!this.field_70135_K && origX !== dx) dx = dy = dz = 0;
    for (const b of boxes) dz = b.calculateZOffset(this.boundingBox, dz);
    this.boundingBox.offset(0, 0, dz);
    if (!this.field_70135_K && origZ !== dz) dx = dy = dz = 0;

    if (this.stepHeight > 0 && canStep && (sneakGuard || this.ySize < f(0.05)) && (origX !== dx || origZ !== dz)) {
      const flatX = dx;
      const flatY = dy;
      const flatZ = dz;
      dx = origX;
      dy = this.stepHeight;
      dz = origZ;
      const flatBox = this.boundingBox.copy();
      this.boundingBox.setBB(bbCopy);
      boxes = w.getCollidingBoundingBoxes(this, this.boundingBox.addCoord(origX, dy, origZ));
      for (const b of boxes) dy = b.calculateYOffset(this.boundingBox, dy);
      this.boundingBox.offset(0, dy, 0);
      if (!this.field_70135_K && origY !== dy) dx = dy = dz = 0;
      for (const b of boxes) dx = b.calculateXOffset(this.boundingBox, dx);
      this.boundingBox.offset(dx, 0, 0);
      if (!this.field_70135_K && origX !== dx) dx = dy = dz = 0;
      for (const b of boxes) dz = b.calculateZOffset(this.boundingBox, dz);
      this.boundingBox.offset(0, 0, dz);
      if (!this.field_70135_K && origZ !== dz) dx = dy = dz = 0;
      if (!this.field_70135_K && origY !== dy) {
        dx = dy = dz = 0;
      } else {
        dy = -this.stepHeight;
        for (const b of boxes) dy = b.calculateYOffset(this.boundingBox, dy);
        this.boundingBox.offset(0, dy, 0);
      }
      if (flatX * flatX + flatZ * flatZ >= dx * dx + dz * dz) {
        dx = flatX;
        dy = flatY;
        dz = flatZ;
        this.boundingBox.setBB(flatBox);
      }
    }

    this.posX = (this.boundingBox.minX + this.boundingBox.maxX) / 2;
    this.posY = this.boundingBox.minY + this.yOffset - this.ySize;
    this.posZ = (this.boundingBox.minZ + this.boundingBox.maxZ) / 2;
    this.isCollidedHorizontally = origX !== dx || origZ !== dz;
    this.isCollidedVertically = origY !== dy;
    this.onGround = origY !== dy && origY < 0;
    this.isCollided = this.isCollidedHorizontally || this.isCollidedVertically;
    this.updateFallState(dy, this.onGround);
    if (origX !== dx) this.motionX = 0;
    if (origY !== dy) this.motionY = 0;
    if (origZ !== dz) this.motionZ = 0;

    const mx = this.posX - startX;
    let my = this.posY - startY;
    const mz = this.posZ - startZ;
    if (this.canTriggerWalking() && !sneakGuard && this.ridingEntity === null) {
      const bx = MathHelper.floor_double(this.posX);
      const by = MathHelper.floor_double(this.posY - f(0.2) - this.yOffset);
      const bz = MathHelper.floor_double(this.posZ);
      let id = w.getBlockId(bx, by, bz);
      if (id === 0) {
        const rt = w.blockGetRenderType(bx, by - 1, bz);
        if (rt === 11 || rt === 32 || rt === 21) id = w.getBlockId(bx, by - 1, bz);
      }
      if (id !== BlockIds.ladder) my = 0;
      this.distanceWalkedModified = f(this.distanceWalkedModified + MathHelper.sqrt_double(mx * mx + mz * mz) * 0.6);
      this.distanceWalkedOnStepModified = f(this.distanceWalkedOnStepModified + MathHelper.sqrt_double(mx * mx + my * my + mz * mz) * 0.6);
      if (this.distanceWalkedOnStepModified > this.nextStepDistance && id > 0) {
        this.nextStepDistance = Math.trunc(this.distanceWalkedOnStepModified) + 1;
        if (this.isInWater()) {
          let v = f(MathHelper.sqrt_double(this.motionX * this.motionX * f(0.2) + this.motionY * this.motionY + this.motionZ * this.motionZ * f(0.2)) * f(0.35));
          if (v > 1) v = 1;
          this.playSound('liquid.swim', v, 1 + (this.rand.nextFloat() - this.rand.nextFloat()) * 0.4);
        }
        this.playStepSound(bx, by, bz, id);
        Block.blocksList[id]?.onEntityWalking(w, bx, by, bz, this);
      }
    }

    this.doBlockCollisions();
    const wet = this.isWet();
    if (w.isBoundingBoxBurning(this.boundingBox.contract(0.001, 0.001, 0.001))) {
      this.dealFireDamage(1);
      if (!wet) {
        this.fire++;
        if (this.fire === 0) this.setFire(8);
      }
    } else if (this.fire <= 0) {
      this.fire = -this.fireResistance;
    }
    if (wet && this.fire > 0) {
      this.playSound('random.fizz', 0.7, 1.6 + (this.rand.nextFloat() - this.rand.nextFloat()) * 0.4);
      this.fire = -this.fireResistance;
    }
  }

  protected doBlockCollisions(): void {
    const bb = this.boundingBox;
    const x0 = MathHelper.floor_double(bb.minX + 0.001);
    const y0 = MathHelper.floor_double(bb.minY + 0.001);
    const z0 = MathHelper.floor_double(bb.minZ + 0.001);
    const x1 = MathHelper.floor_double(bb.maxX - 0.001);
    const y1 = MathHelper.floor_double(bb.maxY - 0.001);
    const z1 = MathHelper.floor_double(bb.maxZ - 0.001);
    const w = this.worldObj;
    if (!w.checkChunksExist(x0, y0, z0, x1, y1, z1)) return;
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const id = w.getBlockId(x, y, z);
          if (id > 0) Block.blocksList[id]?.onEntityCollidedWithBlock(w, x, y, z, this);
        }
  }

  protected playStepSound(x: number, y: number, z: number, id: number): void {
    const block = Block.blocksList[id];
    if (!block) return;
    let s = block.stepSound;
    if (this.worldObj.getBlockId(x, y + 1, z) === BlockIds.snow) {
      s = Block.blocksList[BlockIds.snow]!.stepSound;
      this.playSound(s.getStepSound(), s.getVolume() * 0.15, s.getPitch());
    } else if (!block.blockMaterial.isLiquid()) {
      this.playSound(s.getStepSound(), s.getVolume() * 0.15, s.getPitch());
    }
  }

  /**
   * A sound that 1.5.2 single player hears twice: the integrated server's entity and the
   * client's copy both run the code that plays it, each with its own random pitch (see the
   * "client echoes" rule in docs/ARCHITECTURE.md).
   */
  playSoundEchoed(name: string, volume: number, pitch: () => number): void {
    for (let i = 0; i < 2; i++) this.playSound(name, volume, pitch());
  }

  playSound(name: string, volume: number, pitch: number): void {
    this.worldObj.playSoundAtEntity(this, name, volume, pitch);
  }

  protected canTriggerWalking(): boolean {
    return true;
  }

  protected updateFallState(dy: number, onGround: boolean): void {
    if (onGround) {
      if (this.fallDistance > 0) {
        this.fall(this.fallDistance);
        this.fallDistance = 0;
      }
    } else if (dy < 0) {
      this.fallDistance = f(this.fallDistance - dy);
    }
  }

  /** Collision box other entities bump into (boats, minecarts); null for most. */
  getBoundingBox(): AxisAlignedBB | null {
    return null;
  }

  protected dealFireDamage(amount: number): void {
    if (!this.isImmuneToFire_) this.attackEntityFrom(DamageSource.inFire, amount);
  }

  isImmuneToFire(): boolean {
    return this.isImmuneToFire_;
  }

  protected fall(dist: number): void {
    if (this.riddenByEntity) this.riddenByEntity.fall(dist);
  }

  isWet(): boolean {
    const x = MathHelper.floor_double(this.posX);
    const z = MathHelper.floor_double(this.posZ);
    return (
      this.inWater ||
      this.worldObj.canLightningStrikeAt(x, MathHelper.floor_double(this.posY), z) ||
      this.worldObj.canLightningStrikeAt(x, MathHelper.floor_double(this.posY + this.height), z)
    );
  }

  isInWater(): boolean {
    return this.inWater;
  }

  handleWaterMovement(): boolean {
    const box = this.boundingBox.expand(0, f(-0.4), 0).contract(0.001, 0.001, 0.001);
    if (this.worldObj.handleMaterialAcceleration(box, Material.water, this)) {
      if (!this.inWater && !this.firstUpdate) {
        let v = f(MathHelper.sqrt_double(this.motionX * this.motionX * f(0.2) + this.motionY * this.motionY + this.motionZ * this.motionZ * f(0.2)) * f(0.2));
        if (v > 1) v = 1;
        this.playSound('liquid.splash', v, 1 + (this.rand.nextFloat() - this.rand.nextFloat()) * 0.4);
        const surface = MathHelper.floor_double(this.boundingBox.minY);
        for (let i = 0; i < 1 + this.width * 20; i++) {
          const ox = (this.rand.nextFloat() * 2 - 1) * this.width;
          const oz = (this.rand.nextFloat() * 2 - 1) * this.width;
          this.worldObj.spawnParticle('bubble', this.posX + ox, surface + 1, this.posZ + oz, this.motionX, this.motionY - this.rand.nextFloat() * 0.2, this.motionZ);
        }
        for (let i = 0; i < 1 + this.width * 20; i++) {
          const ox = (this.rand.nextFloat() * 2 - 1) * this.width;
          const oz = (this.rand.nextFloat() * 2 - 1) * this.width;
          this.worldObj.spawnParticle('splash', this.posX + ox, surface + 1, this.posZ + oz, this.motionX, this.motionY, this.motionZ);
        }
      }
      this.fallDistance = 0;
      this.inWater = true;
      this.fire = 0;
    } else {
      this.inWater = false;
    }
    return this.inWater;
  }

  isInsideOfMaterial(m: Material): boolean {
    const eyeY = this.posY + this.getEyeHeight();
    const x = MathHelper.floor_double(this.posX);
    const y = MathHelper.floor_float(MathHelper.floor_double(eyeY));
    const z = MathHelper.floor_double(this.posZ);
    const id = this.worldObj.getBlockId(x, y, z);
    const b = Block.blocksList[id];
    if (id !== 0 && b && b.blockMaterial === m) {
      const h = f(BlockFluid.getFluidHeightPercent(this.worldObj.getBlockMetadata(x, y, z)) - f(0.11111111));
      const top = f(y + 1 - h);
      return eyeY < top;
    }
    return false;
  }

  getEyeHeight(): number {
    return 0;
  }

  handleLavaMovement(): boolean {
    return this.worldObj.isMaterialInBB(this.boundingBox.expand(f(-0.1), f(-0.4), f(-0.1)), Material.lava);
  }

  /** Adds strafe/forward input to the motion, rotated by yaw. */
  moveFlying(strafe: number, forward: number, speed: number): void {
    let d = f(strafe * strafe + forward * forward);
    if (d < f(1.0e-4)) return;
    d = MathHelper.sqrt_float(d);
    if (d < 1) d = 1;
    d = f(speed / d);
    strafe = f(strafe * d);
    forward = f(forward * d);
    const rad = f(f(this.rotationYaw * f(Math.PI)) / 180);
    const s = MathHelper.sin(rad);
    const c = MathHelper.cos(rad);
    this.motionX += f(f(strafe * c) - f(forward * s));
    this.motionZ += f(f(forward * c) + f(strafe * s));
  }

  getBrightnessForRender(_pt: number): number {
    const x = MathHelper.floor_double(this.posX);
    const z = MathHelper.floor_double(this.posZ);
    if (!this.worldObj.blockExists(x, 0, z)) return 0;
    const h = (this.boundingBox.maxY - this.boundingBox.minY) * 0.66;
    const y = MathHelper.floor_double(this.posY - this.yOffset + h);
    return this.worldObj.getLightBrightnessForSkyBlocks(x, y, z, 0);
  }

  getBrightness(_pt: number): number {
    const x = MathHelper.floor_double(this.posX);
    const z = MathHelper.floor_double(this.posZ);
    if (!this.worldObj.blockExists(x, 0, z)) return 0;
    const h = (this.boundingBox.maxY - this.boundingBox.minY) * 0.66;
    const y = MathHelper.floor_double(this.posY - this.yOffset + h);
    return this.worldObj.getLightBrightness(x, y, z);
  }

  setWorld(w: World): void {
    this.worldObj = w;
  }

  setPositionAndRotation(x: number, y: number, z: number, yaw: number, pitch: number): void {
    this.prevPosX = this.posX = x;
    this.prevPosY = this.posY = y;
    this.prevPosZ = this.posZ = z;
    this.prevRotationYaw = this.rotationYaw = f(yaw);
    this.prevRotationPitch = this.rotationPitch = f(pitch);
    this.ySize = 0;
    const d = this.prevRotationYaw - yaw;
    if (d < -180) this.prevRotationYaw += 360;
    if (d >= 180) this.prevRotationYaw -= 360;
    this.setPosition(this.posX, this.posY, this.posZ);
    this.setRotation(yaw, pitch);
  }

  setLocationAndAngles(x: number, y: number, z: number, yaw: number, pitch: number): void {
    this.lastTickPosX = this.prevPosX = this.posX = x;
    this.lastTickPosY = this.prevPosY = this.posY = y + this.yOffset;
    this.lastTickPosZ = this.prevPosZ = this.posZ = z;
    this.rotationYaw = f(yaw);
    this.rotationPitch = f(pitch);
    this.setPosition(this.posX, this.posY, this.posZ);
  }

  getDistanceToEntity(e: Entity): number {
    const dx = f(this.posX - e.posX);
    const dy = f(this.posY - e.posY);
    const dz = f(this.posZ - e.posZ);
    return MathHelper.sqrt_float(dx * dx + dy * dy + dz * dz);
  }

  getDistanceSq(x: number, y: number, z: number): number {
    const dx = this.posX - x;
    const dy = this.posY - y;
    const dz = this.posZ - z;
    return dx * dx + dy * dy + dz * dz;
  }

  getDistance(x: number, y: number, z: number): number {
    return MathHelper.sqrt_double(this.getDistanceSq(x, y, z));
  }

  getDistanceSqToEntity(e: Entity): number {
    return this.getDistanceSq(e.posX, e.posY, e.posZ);
  }

  onCollideWithPlayer(_p: EntityPlayer): void {}

  applyEntityCollision(e: Entity): void {
    if (e.riddenByEntity === this || e.ridingEntity === this) return;
    let dx = e.posX - this.posX;
    let dz = e.posZ - this.posZ;
    let d = MathHelper.abs_max(dx, dz);
    if (d >= f(0.01)) {
      d = MathHelper.sqrt_double(d);
      dx /= d;
      dz /= d;
      let k = 1 / d;
      if (k > 1) k = 1;
      dx *= k;
      dz *= k;
      dx *= f(0.05);
      dz *= f(0.05);
      dx *= 1 - this.entityCollisionReduction;
      dz *= 1 - this.entityCollisionReduction;
      this.addVelocity(-dx, 0, -dz);
      e.addVelocity(dx, 0, dz);
    }
  }

  addVelocity(x: number, y: number, z: number): void {
    this.motionX += x;
    this.motionY += y;
    this.motionZ += z;
    this.isAirBorne = true;
  }

  protected setBeenAttacked(): void {
    this.velocityChanged = true;
  }

  attackEntityFrom(_src: DamageSource, _amount: number): boolean {
    if (this.isEntityInvulnerable()) return false;
    this.setBeenAttacked();
    return false;
  }

  canBeCollidedWith(): boolean {
    return false;
  }

  canBePushed(): boolean {
    return false;
  }

  isInRangeToRenderVec3D(v: Vec3): boolean {
    const dx = this.posX - v.xCoord;
    const dy = this.posY - v.yCoord;
    const dz = this.posZ - v.zCoord;
    return this.isInRangeToRenderDist(dx * dx + dy * dy + dz * dz);
  }

  isInRangeToRenderDist(distSq: number): boolean {
    const d = this.boundingBox.getAverageEdgeLength() * 64 * this.renderDistanceWeight;
    return distSq < d * d;
  }

  getTexture(): string | null {
    return null;
  }

  getShadowSize(): number {
    return this.height / 2;
  }

  dropItem(id: number, count: number): Entity | null {
    return this.dropItemWithOffset(id, count, 0);
  }

  dropItemWithOffset(id: number, count: number, yOff: number): Entity | null {
    return this.entityDropItem(new ItemStack(id, count, 0), yOff);
  }

  /** Drops a stack at the entity's feet plus a vertical offset (an EntityItem, pickup delay 10). */
  entityDropItem(stack: ItemStack, yOff: number): Entity | null {
    const item = this.worldObj.createItemEntity(this.posX, this.posY + yOff, this.posZ, stack);
    if (!item) return null;
    item.delayBeforeCanPickup = 10;
    this.worldObj.spawnEntityInWorld(item);
    return item;
  }

  /** Called on the attacker when it kills `e`. */
  onKillEntity(_e: Entity): void {}

  /** func_82146_a: resistance of a block against this entity's explosion (wither skulls change it). */
  getBlockExplosionResistance(_explosion: Explosion, _w: World, _x: number, _y: number, _z: number, block: Block): number {
    return block.getExplosionResistance(this);
  }

  /** func_96091_a: whether this entity's explosion may destroy the block (wither skulls, minecarts). */
  canExplosionDestroyBlock(_explosion: Explosion, _w: World, _x: number, _y: number, _z: number, _id: number, _strength: number): boolean {
    return true;
  }

  /** A tamed wolf (its kills count as the owner's for loot). */
  isTamedWolf(): boolean {
    return false;
  }

  /** func_85031_j: true when the hit is absorbed (item frames, paintings). */
  hitByEntity(_e: Entity): boolean {
    return false;
  }

  /** func_82143_as: how far a pathing walker may drop. */
  getMaxFallHeight(): number {
    return 3;
  }

  addToPlayerScore(_e: Entity, _score: number): void {}

  /** Client-side entity status (2 = hurt, 3 = dead, ...); unused without a server, kept for mobs. */
  handleHealthUpdate(_status: number): void {}

  performHurtAnimation(): void {}

  /** Held item and armour (EntityLiving.equipment), or null for entities without any. */
  getLastActiveItems(): (ItemStack | null)[] | null {
    return null;
  }

  setCurrentItemOrArmor(_slot: number, _stack: ItemStack | null): void {}

  onStruckByLightning(_bolt: Entity): void {
    this.dealFireDamage(5);
    this.fire++;
    if (this.fire === 0) this.setFire(8);
  }

  isEntityAlive(): boolean {
    return !this.isDead;
  }

  isEntityInsideOpaqueBlock(): boolean {
    for (let i = 0; i < 8; i++) {
      const ox = f(f(((i >> 0) % 2) - 0.5) * this.width * f(0.8));
      const oy = f(f(((i >> 1) % 2) - 0.5) * f(0.1));
      const oz = f(f(((i >> 2) % 2) - 0.5) * this.width * f(0.8));
      const x = MathHelper.floor_double(this.posX + ox);
      const y = MathHelper.floor_double(this.posY + this.getEyeHeight() + oy);
      const z = MathHelper.floor_double(this.posZ + oz);
      if (this.worldObj.isBlockNormalCube(x, y, z)) return true;
    }
    return false;
  }

  interact(_p: EntityPlayer): boolean {
    return false;
  }

  getCollisionBox(_other: Entity): AxisAlignedBB | null {
    return null;
  }

  updateRidden(): void {
    const mount = this.ridingEntity;
    if (!mount || mount.isDead) {
      this.ridingEntity = null;
      return;
    }
    this.motionX = 0;
    this.motionY = 0;
    this.motionZ = 0;
    this.onUpdate();
    const r = this.ridingEntity as Entity | null;
    if (!r) return;
    r.updateRiderPosition();
    this.entityRiderYawDelta += r.rotationYaw - r.prevRotationYaw;
    this.entityRiderPitchDelta += r.rotationPitch - r.prevRotationPitch;
    while (this.entityRiderYawDelta >= 180) this.entityRiderYawDelta -= 360;
    while (this.entityRiderYawDelta < -180) this.entityRiderYawDelta += 360;
    while (this.entityRiderPitchDelta >= 180) this.entityRiderPitchDelta -= 360;
    while (this.entityRiderPitchDelta < -180) this.entityRiderPitchDelta += 360;
    let dy = this.entityRiderYawDelta * 0.5;
    let dp = this.entityRiderPitchDelta * 0.5;
    const lim = 10;
    dy = Math.max(-lim, Math.min(lim, dy));
    dp = Math.max(-lim, Math.min(lim, dp));
    this.entityRiderYawDelta -= dy;
    this.entityRiderPitchDelta -= dp;
    this.rotationYaw = f(this.rotationYaw + dy);
    this.rotationPitch = f(this.rotationPitch + dp);
  }

  updateRiderPosition(): void {
    const r = this.riddenByEntity;
    if (!r) return;
    r.lastTickPosX = this.lastTickPosX;
    r.lastTickPosY = this.lastTickPosY + this.getMountedYOffset() + r.getYOffset();
    r.lastTickPosZ = this.lastTickPosZ;
    r.setPosition(this.posX, this.posY + this.getMountedYOffset() + r.getYOffset(), this.posZ);
  }

  getYOffset(): number {
    return this.yOffset;
  }

  getMountedYOffset(): number {
    return this.height * 0.75;
  }

  mountEntity(e: Entity | null): void {
    this.entityRiderPitchDelta = 0;
    this.entityRiderYawDelta = 0;
    if (e === null) {
      if (this.ridingEntity) {
        this.setLocationAndAngles(
          this.ridingEntity.posX,
          this.ridingEntity.boundingBox.minY + this.ridingEntity.height,
          this.ridingEntity.posZ,
          this.rotationYaw,
          this.rotationPitch,
        );
        this.ridingEntity.riddenByEntity = null;
      }
      this.ridingEntity = null;
    } else {
      if (this.ridingEntity) this.ridingEntity.riddenByEntity = null;
      this.ridingEntity = e;
      e.riddenByEntity = this;
    }
  }

  /**
   * Leaves the mount (or this position) for a free spot next to it with solid ground, checking
   * the 8 neighbours one block up (Entity.unmountEntity, used by players getting off).
   */
  unmountEntity(mount: Entity | null): void {
    let x = this.posX;
    let y = this.posY;
    let z = this.posZ;
    if (mount) {
      x = mount.posX;
      y = mount.boundingBox.minY + mount.height;
      z = mount.posZ;
    }
    const w = this.worldObj;
    for (let dx = -1.5; dx < 2; dx++) {
      for (let dz = -1.5; dz < 2; dz++) {
        if (dx === 0 && dz === 0) continue;
        const bx = Math.trunc(this.posX + dx);
        const bz = Math.trunc(this.posZ + dz);
        const box = this.boundingBox.getOffsetBoundingBox(dx, 1, dz);
        if (w.getCollidingBlockBounds(box).length !== 0) continue;
        if (w.doesBlockHaveSolidTopSurface(bx, Math.trunc(this.posY), bz)) {
          this.setLocationAndAngles(this.posX + dx, this.posY + 1, this.posZ + dz, this.rotationYaw, this.rotationPitch);
          return;
        }
        if (w.doesBlockHaveSolidTopSurface(bx, Math.trunc(this.posY) - 1, bz) || w.getBlockMaterial(bx, Math.trunc(this.posY) - 1, bz) === Material.water) {
          x = this.posX + dx;
          y = this.posY + 1;
          z = this.posZ + dz;
        }
      }
    }
    this.setLocationAndAngles(x, y, z, this.rotationYaw, this.rotationPitch);
  }

  /**
   * Network position update (setPositionAndRotation2); the client entity snaps to it. Living
   * entities interpolate over the given number of ticks instead.
   */
  setPositionAndRotation2(x: number, y: number, z: number, yaw: number, pitch: number, _increments: number): void {
    this.setPosition(x, y, z);
    this.setRotation(yaw, pitch);
    const boxes = this.worldObj.getCollidingBoundingBoxes(this, this.boundingBox.contract(f(0.03125), 0, f(0.03125)));
    if (boxes.length > 0) {
      let top = 0;
      for (const b of boxes) if (b.maxY > top) top = b.maxY;
      y += top - this.boundingBox.minY;
      this.setPosition(x, y, z);
    }
  }

  getCollisionBorderSize(): number {
    return f(0.1);
  }

  getLookVec(): Vec3 | null {
    return null;
  }

  setVelocity(x: number, y: number, z: number): void {
    this.motionX = x;
    this.motionY = y;
    this.motionZ = z;
  }

  getHeldItem(): ItemStack | null {
    return null;
  }

  isBurning(): boolean {
    return this.fire > 0 || this.getFlag(0);
  }
  isRiding(): boolean {
    return this.ridingEntity !== null || this.getFlag(2);
  }
  isSneaking(): boolean {
    return this.getFlag(1);
  }
  setSneaking(v: boolean): void {
    this.setFlag(1, v);
  }
  isSprinting(): boolean {
    return this.getFlag(3);
  }
  setSprinting(v: boolean): void {
    this.setFlag(3, v);
  }
  isInvisible(): boolean {
    return this.getFlag(5);
  }
  setInvisible(v: boolean): void {
    this.setFlag(5, v);
  }
  isEating(): boolean {
    return this.getFlag(4);
  }
  setEating(v: boolean): void {
    this.setFlag(4, v);
  }
  protected getFlag(bit: number): boolean {
    return (this.watcherFlags & (1 << bit)) !== 0;
  }
  protected setFlag(bit: number, v: boolean): void {
    this.watcherFlags = v ? this.watcherFlags | (1 << bit) : this.watcherFlags & ~(1 << bit);
  }
  getAir(): number {
    return this.watcherAir;
  }
  setAir(v: number): void {
    this.watcherAir = (v << 16) >> 16;
  }

  /** Nudges the entity out of a full block it is stuck in. */
  protected pushOutOfBlocks(px: number, py: number, pz: number): boolean {
    const x = MathHelper.floor_double(px);
    const y = MathHelper.floor_double(py);
    const z = MathHelper.floor_double(pz);
    const fx = px - x;
    const fy = py - y;
    const fz = pz - z;
    const w = this.worldObj;
    if (w.getCollidingBlockBounds(this.boundingBox).length === 0 && !w.isBlockFullCube(x, y, z)) return false;
    const west = !w.isBlockFullCube(x - 1, y, z);
    const east = !w.isBlockFullCube(x + 1, y, z);
    const up = !w.isBlockFullCube(x, y + 1, z);
    const north = !w.isBlockFullCube(x, y, z - 1);
    const south = !w.isBlockFullCube(x, y, z + 1);
    let dir = 3;
    let best = 9999;
    if (west && fx < best) {
      best = fx;
      dir = 0;
    }
    if (east && 1 - fx < best) {
      best = 1 - fx;
      dir = 1;
    }
    if (up && 1 - fy < best) {
      best = 1 - fy;
      dir = 3;
    }
    if (north && fz < best) {
      best = fz;
      dir = 4;
    }
    if (south && 1 - fz < best) {
      best = 1 - fz;
      dir = 5;
    }
    const v = f(this.rand.nextFloat() * f(0.2) + f(0.1));
    if (dir === 0) this.motionX = -v;
    if (dir === 1) this.motionX = v;
    if (dir === 2) this.motionY = -v;
    if (dir === 3) this.motionY = v;
    if (dir === 4) this.motionZ = -v;
    if (dir === 5) this.motionZ = v;
    return true;
  }

  setInWeb(): void {
    this.isInWeb = true;
    this.fallDistance = 0;
  }

  /** The translated "entity.<EntityList name>.name". */
  getEntityName(): string {
    return I18n.translateToLocal('entity.' + (EntityList.getEntityString(this) ?? 'generic') + '.name');
  }

  /** Sub-parts for multi-part entities (the dragon); null otherwise. */
  getParts(): Entity[] | null {
    return null;
  }

  /** The whole entity a part belongs to (EntityDragonPart.entityDragonObj); null for normal entities. */
  getMultiPartOwner(): Entity | null {
    return null;
  }

  /**
   * True for a player whose capabilities disable damage (Creative): hostile AI never targets
   * them, creepers do not swell for them and skeletons do not shoot them, as in 1.5.2.
   */
  isCreativeInvulnerable(): boolean {
    return false;
  }

  /** Copies position, rotation and motion from another entity (copyDataFrom, used by conversions). */
  copyLocationAndAnglesFrom(e: Entity): void {
    this.setLocationAndAngles(e.posX, e.posY, e.posZ, e.rotationYaw, e.rotationPitch);
  }

  isEntityEqual(e: Entity): boolean {
    return this === e;
  }

  getRotationYawHead(): number {
    return 0;
  }

  setRotationYawHead(_v: number): void {}

  canAttackWithItem(): boolean {
    return true;
  }

  isEntityInvulnerable(): boolean {
    return this.invulnerable;
  }

  canRenderOnFire(): boolean {
    return this.isBurning();
  }

  /** func_96092_aw: whether flowing water pushes this entity. */
  isPushedByWater(): boolean {
    return true;
  }
}
