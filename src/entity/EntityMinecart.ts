import { Block } from '../block/Block';
import { BlockIds, ItemIds } from '../block/BlockIds';
import type { AxisAlignedBB } from '../core/AxisAlignedBB';
import { MathHelper } from '../core/MathHelper';
import { Vec3 } from '../core/Vec3';
import { ItemStack } from '../item/ItemStack';
import type { World } from '../world/World';
import type { DamageSource } from './DamageSource';
import { Entity } from './Entity';
import type { EntityPlayer } from './EntityPlayer';
import { EntityList } from './EntityList';

const f = Math.fround;

/** The two exits of each rail shape (meta 0-9) as block offsets: straight, ascending, curves. */
const RAIL_EXITS: readonly (readonly (readonly [number, number, number])[])[] = [
  [[0, 0, -1], [0, 0, 1]],
  [[-1, 0, 0], [1, 0, 0]],
  [[-1, -1, 0], [1, 0, 0]],
  [[-1, 0, 0], [1, -1, 0]],
  [[0, 0, -1], [0, -1, 1]],
  [[0, -1, -1], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0]],
  [[0, 0, 1], [-1, 0, 0]],
  [[0, 0, -1], [-1, 0, 0]],
  [[0, 0, -1], [1, 0, 0]],
];

/** BlockRailBase.isRailBlock: rails, powered rails, detector rails, activator rails. */
export function isRailBlock(id: number): boolean {
  return id === BlockIds.rail || id === BlockIds.railPowered || id === BlockIds.railDetector || id === BlockIds.railActivator;
}

export function isRailBlockAt(w: World, x: number, y: number, z: number): boolean {
  return isRailBlock(w.getBlockId(x, y, z));
}

/** BlockRailBase.isPowered: rails whose meta bit 8 is a power flag (only straight shapes 0-5). */
export function isPowerableRail(id: number): boolean {
  return id === BlockIds.railPowered || id === BlockIds.railDetector || id === BlockIds.railActivator;
}

type MinecartConstructor = new (w: World, x: number, y: number, z: number) => EntityMinecart;

/**
 * Base of every minecart (EntityMinecart): follows the rail shapes (straight, slopes that add
 * speed going down, curves), speed capped at 0.4 per tick, unpowered powered rails brake to a
 * stop (there is no redstone), pushes and is pushed by other carts, and leaves the rails as a
 * plain physics box. Damage makes it wobble; a Creative player removes it with one hit.
 */
export abstract class EntityMinecart extends Entity {
  /** Cart classes by type (0 rideable, 1 chest, 2 furnace, 3 TNT, 4 spawner, 5 hopper). */
  static readonly minecartTypes = new Map<number, MinecartConstructor>();
  private isInReverse = false;
  private entityName: string | null = null;
  /** DataWatcher 17-22: wobble amplitude and direction, damage, display tile, its offset, override flag. */
  private rollingAmplitude = 0;
  private rollingDirection = 1;
  private damage = 0;
  private displayTile = 0;
  private displayTileOffset = 6;
  private hasCustomDisplayTile = false;

  constructor(world: World, x?: number, y?: number, z?: number) {
    super(world);
    this.preventEntitySpawning = true;
    this.setSize(0.98, 0.7);
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

  /** ItemMinecart / dispensers: a cart of the given type at (x, y, z). */
  static createMinecart(w: World, x: number, y: number, z: number, type: number): EntityMinecart | null {
    const cls = EntityMinecart.minecartTypes.get(type) ?? EntityMinecart.minecartTypes.get(0);
    return cls ? new cls(w, x, y, z) : null;
  }

  protected entityInit(): void {}

  protected override canTriggerWalking(): boolean {
    return false;
  }

  /** Pushable entities collide with carts; carts themselves have no solid box. */
  override getCollisionBox(other: Entity): AxisAlignedBB | null {
    return other.canBePushed() ? other.boundingBox : null;
  }

  override getBoundingBox(): AxisAlignedBB | null {
    return null;
  }

  override canBePushed(): boolean {
    return true;
  }

  override getMountedYOffset(): number {
    return this.height * 0 - f(0.3);
  }

  override attackEntityFrom(src: DamageSource, amount: number): boolean {
    if (this.isDead) return true;
    if (this.isEntityInvulnerable()) return false;
    this.setRollingDirection(-this.getRollingDirection());
    this.setRollingAmplitude(10);
    this.setBeenAttacked();
    this.setDamage(this.getDamage() + amount * 10);
    const by = src.getEntity();
    const creative = !!by && by.isPlayerEntity && (by as EntityPlayer).capabilities.isCreativeMode;
    if (creative || this.getDamage() > 40) {
      if (this.riddenByEntity) this.riddenByEntity.mountEntity(this);
      if (creative && !this.isInvNameLocalized()) this.setDead();
      else this.killMinecart(src);
    }
    return true;
  }

  /** Broken: drops the cart item (with its custom name) and, in subclasses, its block. */
  killMinecart(_src: DamageSource): void {
    this.setDead();
    const stack = new ItemStack(ItemIds.minecartEmpty, 1, 0);
    if (this.entityName !== null) stack.setItemName(this.entityName);
    this.entityDropItem(stack, 0);
  }

  override performHurtAnimation(): void {
    this.setRollingDirection(-this.getRollingDirection());
    this.setRollingAmplitude(10);
    this.setDamage(this.getDamage() + this.getDamage() * 10);
  }

  override canBeCollidedWith(): boolean {
    return !this.isDead;
  }

  override onUpdate(): void {
    if (this.getRollingAmplitude() > 0) this.setRollingAmplitude(this.getRollingAmplitude() - 1);
    if (this.getDamage() > 0) this.setDamage(this.getDamage() - 1);
    if (this.posY < -64) this.kill();
    if (this.timeUntilPortal > 0) this.timeUntilPortal--;
    const w = this.worldObj;
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    this.motionY -= f(0.04);
    const x = MathHelper.floor_double(this.posX);
    let y = MathHelper.floor_double(this.posY);
    const z = MathHelper.floor_double(this.posZ);
    if (isRailBlockAt(w, x, y - 1, z)) y--;
    const maxSpeed = 0.4;
    const slopeAccel = 0.0078125;
    const id = w.getBlockId(x, y, z);
    if (isRailBlock(id)) {
      const meta = w.getBlockMetadata(x, y, z);
      this.updateOnTrack(x, y, z, maxSpeed, slopeAccel, id, meta);
      if (id === BlockIds.railActivator) this.onActivatorRailPass(x, y, z, (meta & 8) !== 0);
    } else {
      this.moveOffRail(maxSpeed);
    }
    this.doBlockCollisions();
    this.rotationPitch = 0;
    const dx = this.prevPosX - this.posX;
    const dz = this.prevPosZ - this.posZ;
    if (dx * dx + dz * dz > 0.001) {
      this.rotationYaw = f((Math.atan2(dz, dx) * 180) / Math.PI);
      if (this.isInReverse) this.rotationYaw = f(this.rotationYaw + 180);
    }
    const turn = MathHelper.wrapAngleTo180_float(this.rotationYaw - this.prevRotationYaw);
    if (turn < -170 || turn >= 170) {
      this.rotationYaw = f(this.rotationYaw + 180);
      this.isInReverse = !this.isInReverse;
    }
    this.setRotation(this.rotationYaw, this.rotationPitch);
    for (const e of w.getEntitiesWithinAABBExcludingEntity(this, this.boundingBox.expand(f(0.2), 0, f(0.2)))) {
      if (e !== this.riddenByEntity && e.canBePushed() && e instanceof EntityMinecart) e.applyEntityCollision(this);
    }
    if (this.riddenByEntity && this.riddenByEntity.isDead) {
      if (this.riddenByEntity.ridingEntity === this) this.riddenByEntity.ridingEntity = null;
      this.riddenByEntity = null;
    }
  }

  /** An activator rail under the cart (powered or not); TNT carts ignite, hopper carts unlock. */
  onActivatorRailPass(_x: number, _y: number, _z: number, _powered: boolean): void {}

  /** Off the rails (func_94088_b): capped speed, halved on the ground, 0.95 drag in the air. */
  protected moveOffRail(max: number): void {
    if (this.motionX < -max) this.motionX = -max;
    if (this.motionX > max) this.motionX = max;
    if (this.motionZ < -max) this.motionZ = -max;
    if (this.motionZ > max) this.motionZ = max;
    if (this.onGround) {
      this.motionX *= 0.5;
      this.motionY *= 0.5;
      this.motionZ *= 0.5;
    }
    this.moveEntity(this.motionX, this.motionY, this.motionZ);
    if (!this.onGround) {
      this.motionX *= f(0.95);
      this.motionY *= f(0.95);
      this.motionZ *= f(0.95);
    }
  }

  /** One tick on a rail block: snap to the rail line, follow its direction, slopes and boosters. */
  protected updateOnTrack(x: number, y: number, z: number, maxSpeed: number, slopeAccel: number, id: number, meta: number): void {
    this.fallDistance = 0;
    const before = this.getRailPosition(this.posX, this.posY, this.posZ);
    this.posY = y;
    let boosting = false;
    let braking = false;
    if (id === BlockIds.railPowered) {
      boosting = (meta & 8) !== 0;
      braking = !boosting;
    }
    if (isPowerableRail(id)) meta &= 7;
    if (meta >= 2 && meta <= 5) this.posY = y + 1;
    if (meta === 2) this.motionX -= slopeAccel;
    if (meta === 3) this.motionX += slopeAccel;
    if (meta === 4) this.motionZ += slopeAccel;
    if (meta === 5) this.motionZ -= slopeAccel;
    const exits = RAIL_EXITS[meta];
    let ex = exits[1][0] - exits[0][0];
    let ez = exits[1][2] - exits[0][2];
    const len = Math.sqrt(ex * ex + ez * ez);
    if (this.motionX * ex + this.motionZ * ez < 0) {
      ex = -ex;
      ez = -ez;
    }
    let speed = Math.sqrt(this.motionX * this.motionX + this.motionZ * this.motionZ);
    if (speed > 2) speed = 2;
    this.motionX = (speed * ex) / len;
    this.motionZ = (speed * ez) / len;
    const rider = this.riddenByEntity;
    if (rider) {
      const riderSpeed = rider.motionX * rider.motionX + rider.motionZ * rider.motionZ;
      const ownSpeed = this.motionX * this.motionX + this.motionZ * this.motionZ;
      if (riderSpeed > 1.0e-4 && ownSpeed < 0.01) {
        this.motionX += rider.motionX * 0.1;
        this.motionZ += rider.motionZ * 0.1;
        braking = false;
      }
    }
    if (braking) {
      const s = Math.sqrt(this.motionX * this.motionX + this.motionZ * this.motionZ);
      if (s < 0.03) {
        this.motionX *= 0;
        this.motionY *= 0;
        this.motionZ *= 0;
      } else {
        this.motionX *= 0.5;
        this.motionY *= 0;
        this.motionZ *= 0.5;
      }
    }
    // Project onto the line between the two exits.
    const x0 = x + 0.5 + exits[0][0] * 0.5;
    const z0 = z + 0.5 + exits[0][2] * 0.5;
    const x1 = x + 0.5 + exits[1][0] * 0.5;
    const z1 = z + 0.5 + exits[1][2] * 0.5;
    ex = x1 - x0;
    ez = z1 - z0;
    let t: number;
    if (ex === 0) {
      this.posX = x + 0.5;
      t = this.posZ - z;
    } else if (ez === 0) {
      this.posZ = z + 0.5;
      t = this.posX - x;
    } else {
      t = ((this.posX - x0) * ex + (this.posZ - z0) * ez) * 2;
    }
    this.posX = x0 + ex * t;
    this.posZ = z0 + ez * t;
    this.setPosition(this.posX, this.posY + this.yOffset, this.posZ);
    let mx = this.motionX;
    let mz = this.motionZ;
    if (this.riddenByEntity) {
      mx *= 0.75;
      mz *= 0.75;
    }
    if (mx < -maxSpeed) mx = -maxSpeed;
    if (mx > maxSpeed) mx = maxSpeed;
    if (mz < -maxSpeed) mz = -maxSpeed;
    if (mz > maxSpeed) mz = maxSpeed;
    this.moveEntity(mx, 0, mz);
    if (exits[0][1] !== 0 && MathHelper.floor_double(this.posX) - x === exits[0][0] && MathHelper.floor_double(this.posZ) - z === exits[0][2]) {
      this.setPosition(this.posX, this.posY + exits[0][1], this.posZ);
    } else if (exits[1][1] !== 0 && MathHelper.floor_double(this.posX) - x === exits[1][0] && MathHelper.floor_double(this.posZ) - z === exits[1][2]) {
      this.setPosition(this.posX, this.posY + exits[1][1], this.posZ);
    }
    this.applyDrag();
    const after = this.getRailPosition(this.posX, this.posY, this.posZ);
    if (after && before) {
      const drop = (before.yCoord - after.yCoord) * 0.05;
      speed = Math.sqrt(this.motionX * this.motionX + this.motionZ * this.motionZ);
      if (speed > 0) {
        this.motionX = (this.motionX / speed) * (speed + drop);
        this.motionZ = (this.motionZ / speed) * (speed + drop);
      }
      this.setPosition(this.posX, after.yCoord, this.posZ);
    }
    const nx = MathHelper.floor_double(this.posX);
    const nz = MathHelper.floor_double(this.posZ);
    if (nx !== x || nz !== z) {
      speed = Math.sqrt(this.motionX * this.motionX + this.motionZ * this.motionZ);
      this.motionX = speed * (nx - x);
      this.motionZ = speed * (nz - z);
    }
    if (boosting) {
      const s = Math.sqrt(this.motionX * this.motionX + this.motionZ * this.motionZ);
      if (s > 0.01) {
        const k = 0.06;
        this.motionX += (this.motionX / s) * k;
        this.motionZ += (this.motionZ / s) * k;
      } else if (meta === 1) {
        if (this.worldObj.isBlockNormalCube(x - 1, y, z)) this.motionX = 0.02;
        else if (this.worldObj.isBlockNormalCube(x + 1, y, z)) this.motionX = -0.02;
      } else if (meta === 0) {
        if (this.worldObj.isBlockNormalCube(x, y, z - 1)) this.motionZ = 0.02;
        else if (this.worldObj.isBlockNormalCube(x, y, z + 1)) this.motionZ = -0.02;
      }
    }
  }

  /** Rolling resistance: 0.997 with a rider, 0.96 empty. */
  protected applyDrag(): void {
    if (this.riddenByEntity) {
      this.motionX *= f(0.997);
      this.motionY *= 0;
      this.motionZ *= f(0.997);
    } else {
      this.motionX *= f(0.96);
      this.motionY *= 0;
      this.motionZ *= f(0.96);
    }
  }

  /** func_70495_a: the rail position `dist` further along the rail (renderer look-ahead). */
  getRailPositionAhead(px: number, py: number, pz: number, dist: number): Vec3 | null {
    const x = MathHelper.floor_double(px);
    let y = MathHelper.floor_double(py);
    const z = MathHelper.floor_double(pz);
    const w = this.worldObj;
    if (isRailBlockAt(w, x, y - 1, z)) y--;
    const id = w.getBlockId(x, y, z);
    if (!isRailBlock(id)) return null;
    let meta = w.getBlockMetadata(x, y, z);
    if (isPowerableRail(id)) meta &= 7;
    py = y;
    if (meta >= 2 && meta <= 5) py = y + 1;
    const exits = RAIL_EXITS[meta];
    let ex = exits[1][0] - exits[0][0];
    let ez = exits[1][2] - exits[0][2];
    const len = Math.sqrt(ex * ex + ez * ez);
    ex /= len;
    ez /= len;
    px += ex * dist;
    pz += ez * dist;
    if (exits[0][1] !== 0 && MathHelper.floor_double(px) - x === exits[0][0] && MathHelper.floor_double(pz) - z === exits[0][2]) py += exits[0][1];
    else if (exits[1][1] !== 0 && MathHelper.floor_double(px) - x === exits[1][0] && MathHelper.floor_double(pz) - z === exits[1][2]) py += exits[1][1];
    return this.getRailPosition(px, py, pz);
  }

  /** func_70489_a: the point on the rail closest to (x, y, z), raised on slopes; null off rails. */
  getRailPosition(px: number, py: number, pz: number): Vec3 | null {
    const x = MathHelper.floor_double(px);
    let y = MathHelper.floor_double(py);
    const z = MathHelper.floor_double(pz);
    const w = this.worldObj;
    if (isRailBlockAt(w, x, y - 1, z)) y--;
    const id = w.getBlockId(x, y, z);
    if (!isRailBlock(id)) return null;
    let meta = w.getBlockMetadata(x, y, z);
    py = y;
    if (isPowerableRail(id)) meta &= 7;
    if (meta >= 2 && meta <= 5) py = y + 1;
    const exits = RAIL_EXITS[meta];
    const x0 = x + 0.5 + exits[0][0] * 0.5;
    const y0 = y + 0.5 + exits[0][1] * 0.5;
    const z0 = z + 0.5 + exits[0][2] * 0.5;
    const x1 = x + 0.5 + exits[1][0] * 0.5;
    const y1 = y + 0.5 + exits[1][1] * 0.5;
    const z1 = z + 0.5 + exits[1][2] * 0.5;
    const ex = x1 - x0;
    const ey = (y1 - y0) * 2;
    const ez = z1 - z0;
    let t: number;
    if (ex === 0) {
      px = x + 0.5;
      t = pz - z;
    } else if (ez === 0) {
      pz = z + 0.5;
      t = px - x;
    } else {
      t = ((px - x0) * ex + (pz - z0) * ez) * 2;
    }
    px = x0 + ex * t;
    py = y0 + ey * t;
    pz = z0 + ez * t;
    if (ey < 0) py++;
    if (ey > 0) py += 0.5;
    return new Vec3(px, py, pz);
  }

  override getShadowSize(): number {
    return 0;
  }

  /**
   * Carts push each other along the rails (furnace carts push harder), pick up mobs that walk
   * into a moving empty cart, and nudge other entities aside.
   */
  override applyEntityCollision(e: Entity): void {
    if (e === this.riddenByEntity) return;
    if (
      e.isLivingEntity &&
      !e.isPlayerEntity &&
      EntityList.getEntityString(e) !== 'VillagerGolem' &&
      this.getMinecartType() === 0 &&
      this.motionX * this.motionX + this.motionZ * this.motionZ > 0.01 &&
      this.riddenByEntity === null &&
      e.ridingEntity === null
    ) {
      e.mountEntity(this);
    }
    let dx = e.posX - this.posX;
    let dz = e.posZ - this.posZ;
    let d = dx * dx + dz * dz;
    if (d < f(1.0e-4)) return;
    d = MathHelper.sqrt_double(d);
    dx /= d;
    dz /= d;
    let k = 1 / d;
    if (k > 1) k = 1;
    dx *= k;
    dz *= k;
    dx *= f(0.1);
    dz *= f(0.1);
    dx *= f(1 - this.entityCollisionReduction);
    dz *= f(1 - this.entityCollisionReduction);
    dx *= 0.5;
    dz *= 0.5;
    if (e instanceof EntityMinecart) {
      const toOther = new Vec3(e.posX - this.posX, 0, e.posZ - this.posZ).normalize();
      const r = f(f(this.rotationYaw * f(Math.PI)) / 180);
      const facing = new Vec3(MathHelper.cos(r), 0, MathHelper.sin(r)).normalize();
      if (Math.abs(toOther.dotProduct(facing)) < f(0.8)) return;
      let sx = e.motionX + this.motionX;
      let sz = e.motionZ + this.motionZ;
      if (e.getMinecartType() === 2 && this.getMinecartType() !== 2) {
        this.motionX *= f(0.2);
        this.motionZ *= f(0.2);
        this.addVelocity(e.motionX - dx, 0, e.motionZ - dz);
        e.motionX *= f(0.95);
        e.motionZ *= f(0.95);
      } else if (e.getMinecartType() !== 2 && this.getMinecartType() === 2) {
        e.motionX *= f(0.2);
        e.motionZ *= f(0.2);
        e.addVelocity(this.motionX + dx, 0, this.motionZ + dz);
        this.motionX *= f(0.95);
        this.motionZ *= f(0.95);
      } else {
        sx /= 2;
        sz /= 2;
        this.motionX *= f(0.2);
        this.motionZ *= f(0.2);
        this.addVelocity(sx - dx, 0, sz - dz);
        e.motionX *= f(0.2);
        e.motionZ *= f(0.2);
        e.addVelocity(sx + dx, 0, sz + dz);
      }
    } else {
      this.addVelocity(-dx, 0, -dz);
      e.addVelocity(dx / 4, 0, dz / 4);
    }
  }

  setDamage(v: number): void {
    this.damage = v;
  }

  getDamage(): number {
    return this.damage;
  }

  setRollingAmplitude(v: number): void {
    this.rollingAmplitude = v;
  }

  getRollingAmplitude(): number {
    return this.rollingAmplitude;
  }

  setRollingDirection(v: number): void {
    this.rollingDirection = v;
  }

  getRollingDirection(): number {
    return this.rollingDirection;
  }

  /** 0 rideable, 1 chest, 2 furnace, 3 TNT, 4 spawner, 5 hopper. */
  abstract getMinecartType(): number;

  /** The block shown inside the cart (custom, or the type's default). */
  getDisplayTile(): Block | null {
    if (!this.hasDisplayTile()) return this.getDefaultDisplayTile();
    const id = this.displayTile & 65535;
    return id > 0 && id < Block.blocksList.length ? Block.blocksList[id] : null;
  }

  getDefaultDisplayTile(): Block | null {
    return null;
  }

  getDisplayTileData(): number {
    return this.hasDisplayTile() ? this.displayTile >> 16 : this.getDefaultDisplayTileData();
  }

  getDefaultDisplayTileData(): number {
    return 0;
  }

  /** Height of the shown block in 1/16 blocks. */
  getDisplayTileOffset(): number {
    return this.hasDisplayTile() ? this.displayTileOffset : this.getDefaultDisplayTileOffset();
  }

  getDefaultDisplayTileOffset(): number {
    return 6;
  }

  setDisplayTile(id: number): void {
    this.displayTile = (id & 65535) | (this.getDisplayTileData() << 16);
    this.setHasDisplayTile(true);
  }

  setDisplayTileData(data: number): void {
    const b = this.getDisplayTile();
    this.displayTile = ((b ? b.blockID : 0) & 65535) | (data << 16);
    this.setHasDisplayTile(true);
  }

  setDisplayTileOffset(v: number): void {
    this.displayTileOffset = v;
    this.setHasDisplayTile(true);
  }

  hasDisplayTile(): boolean {
    return this.hasCustomDisplayTile;
  }

  setHasDisplayTile(v: boolean): void {
    this.hasCustomDisplayTile = v;
  }

  /** A name from a renamed cart item (func_96094_a). */
  setMinecartName(name: string | null): void {
    this.entityName = name;
  }

  override getEntityName(): string {
    return this.entityName ?? super.getEntityName();
  }

  isInvNameLocalized(): boolean {
    return this.entityName !== null;
  }

  getCustomName(): string | null {
    return this.entityName;
  }
}
