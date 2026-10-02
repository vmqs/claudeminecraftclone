import { MathHelper } from '../core/MathHelper';
import type { Vec3 } from '../core/Vec3';
import type { World } from '../world/World';
import type { PathEntity } from './ai/PathEntity';
import type { Entity } from './Entity';
import { EntityLiving } from './EntityLiving';

const f = Math.fround;

/**
 * A creature that walks with paths (EntityCreature). Its old AI (mobs that do not enable AI
 * tasks) chases findPlayerToAttack() along a path, calls attackEntity() when it can see the
 * target, and otherwise wanders to the best getBlockPathWeight() spot nearby.
 */
export abstract class EntityCreature extends EntityLiving {
  private pathToEntity: PathEntity | null = null;
  protected entityToAttack: Entity | null = null;
  /** Stop walking this tick (it attacked, or the subclass froze it). */
  protected hasAttacked = false;
  /** Ticks left of running away after being hurt. */
  protected fleeingTick = 0;

  constructor(world: World) {
    super(world);
  }

  protected isMovementCeased(): boolean {
    return false;
  }

  protected override updateEntityActionState(): void {
    if (this.fleeingTick > 0) this.fleeingTick--;
    this.hasAttacked = this.isMovementCeased();
    const range = 16;
    if (this.entityToAttack === null) {
      this.entityToAttack = this.findPlayerToAttack();
      if (this.entityToAttack) this.pathToEntity = this.newPathToEntity(this.entityToAttack, range);
    } else if (this.entityToAttack.isEntityAlive()) {
      const d = this.entityToAttack.getDistanceToEntity(this);
      if (this.canEntityBeSeen(this.entityToAttack)) this.attackEntity(this.entityToAttack, d);
    } else {
      this.entityToAttack = null;
    }
    if (!this.hasAttacked && this.entityToAttack && (this.pathToEntity === null || this.rand.nextInt(20) === 0)) {
      this.pathToEntity = this.newPathToEntity(this.entityToAttack, range);
    } else if (!this.hasAttacked && ((this.pathToEntity === null && this.rand.nextInt(180) === 0) || this.rand.nextInt(120) === 0 || this.fleeingTick > 0) && this.entityAge < 100) {
      this.updateWanderPath();
    }
    const feetY = MathHelper.floor_double(this.boundingBox.minY + 0.5);
    const inWater = this.isInWater();
    const inLava = this.handleLavaMovement();
    this.rotationPitch = 0;
    if (this.pathToEntity === null || this.rand.nextInt(100) === 0) {
      super.updateEntityActionState();
      this.pathToEntity = null;
      return;
    }
    let next: Vec3 | null = this.pathToEntity.getPosition(this);
    const reach = f(this.width * 2);
    while (next && next.squareDistanceToXYZ(this.posX, next.yCoord, this.posZ) < reach * reach) {
      this.pathToEntity!.incrementPathIndex();
      if (this.pathToEntity!.isFinished()) {
        next = null;
        this.pathToEntity = null;
      } else {
        next = this.pathToEntity!.getPosition(this);
      }
    }
    this.isJumping = false;
    if (next) {
      const dx = next.xCoord - this.posX;
      const dz = next.zCoord - this.posZ;
      const dy = next.yCoord - feetY;
      const yaw = f(f((Math.atan2(dz, dx) * 180) / f(Math.PI)) - 90);
      let turn = MathHelper.wrapAngleTo180_float(yaw - this.rotationYaw);
      this.moveForward = this.moveSpeed;
      if (turn > 30) turn = 30;
      if (turn < -30) turn = -30;
      this.rotationYaw = f(this.rotationYaw + turn);
      if (this.hasAttacked && this.entityToAttack) {
        // Strafe around the target while facing it.
        const tx = this.entityToAttack.posX - this.posX;
        const tz = this.entityToAttack.posZ - this.posZ;
        const oldYaw = this.rotationYaw;
        this.rotationYaw = f(f((Math.atan2(tz, tx) * 180) / f(Math.PI)) - 90);
        const a = f((f(oldYaw - this.rotationYaw + 90) * f(Math.PI)) / 180);
        this.moveStrafing = f(f(-MathHelper.sin(a) * this.moveForward) * 1);
        this.moveForward = f(f(MathHelper.cos(a) * this.moveForward) * 1);
      }
      if (dy > 0) this.isJumping = true;
    }
    if (this.entityToAttack) this.faceEntity(this.entityToAttack, 30, 30);
    if (this.isCollidedHorizontally && !this.hasPath()) this.isJumping = true;
    if (this.rand.nextFloat() < f(0.8) && (inWater || inLava)) this.isJumping = true;
  }

  private newPathToEntity(target: Entity, range: number): PathEntity | null {
    return this.worldObj.getPathEntityToEntity(this, target, range, true, false, false, true);
  }

  /** Picks the best of 10 random spots within 6 blocks by getBlockPathWeight and paths there. */
  protected updateWanderPath(): void {
    let found = false;
    let bx = -1;
    let by = -1;
    let bz = -1;
    let best = -99999;
    for (let i = 0; i < 10; i++) {
      const x = MathHelper.floor_double(this.posX + this.rand.nextInt(13) - 6);
      const y = MathHelper.floor_double(this.posY + this.rand.nextInt(7) - 3);
      const z = MathHelper.floor_double(this.posZ + this.rand.nextInt(13) - 6);
      const w = this.getBlockPathWeight(x, y, z);
      if (w > best) {
        best = w;
        bx = x;
        by = y;
        bz = z;
        found = true;
      }
    }
    if (found) this.pathToEntity = this.worldObj.getEntityPathToXYZ(this, bx, by, bz, 10, true, false, false, true);
  }

  /** Old-AI attack when the target is visible at `dist` blocks. */
  protected attackEntity(_target: Entity, _dist: number): void {}

  /** Preference for standing at a position (higher is better; < 0 forbids spawning there). */
  getBlockPathWeight(_x: number, _y: number, _z: number): number {
    return 0;
  }

  protected findPlayerToAttack(): Entity | null {
    return null;
  }

  override getCanSpawnHere(): boolean {
    const x = MathHelper.floor_double(this.posX);
    const y = MathHelper.floor_double(this.boundingBox.minY);
    const z = MathHelper.floor_double(this.posZ);
    return super.getCanSpawnHere() && this.getBlockPathWeight(x, y, z) >= 0;
  }

  hasPath(): boolean {
    return this.pathToEntity !== null;
  }

  setPathToEntity(p: PathEntity | null): void {
    this.pathToEntity = p;
  }

  getEntityToAttack(): Entity | null {
    return this.entityToAttack;
  }

  setTarget(e: Entity | null): void {
    this.entityToAttack = e;
  }

  override getSpeedModifier(): number {
    let m = super.getSpeedModifier();
    if (this.fleeingTick > 0 && !this.isAIEnabled()) m = f(m * 2);
    return m;
  }
}
