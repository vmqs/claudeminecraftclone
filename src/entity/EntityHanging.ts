import { MathHelper } from '../core/MathHelper';
import type { World } from '../world/World';
import { DamageSource } from './DamageSource';
import { Entity } from './Entity';
import type { EntityPlayer } from './EntityPlayer';

const f = Math.fround;

/** Direction.rotateOpposite: the facing of the side opposite each hanging direction. */
const ROTATE_OPPOSITE = [2, 3, 0, 1];
/** Direction.offsetX / offsetZ: hanging directions 0 south, 1 west, 2 north, 3 east. */
export const DIRECTION_OFFSET_X = [0, -1, 0, 1];
export const DIRECTION_OFFSET_Z = [1, 0, -1, 0];

/**
 * Something hung on a wall (EntityHanging: paintings, item frames). It sits on the face of the
 * block (xPosition, yPosition, zPosition) in hangingDirection (0 south, 1 west, 2 north, 3 east),
 * every 100 ticks checks that the wall behind is still solid, pops off when pushed or hit, and
 * is removed without a drop by Creative players.
 */
export abstract class EntityHanging extends Entity {
  private tickCounter1 = 0;
  hangingDirection = 0;
  xPosition = 0;
  yPosition = 0;
  zPosition = 0;

  constructor(world: World, x?: number, y?: number, z?: number, _direction?: number) {
    super(world);
    this.yOffset = 0;
    this.setSize(0.5, 0.5);
    if (x === undefined || y === undefined || z === undefined) return;
    this.xPosition = x;
    this.yPosition = y;
    this.zPosition = z;
  }

  protected entityInit(): void {}

  /** Faces `dir`, and centres the box on the wall face (half a pixel thick, sized to the art). */
  setDirection(dir: number): void {
    this.hangingDirection = dir;
    this.prevRotationYaw = this.rotationYaw = dir * 90;
    let hx = this.getWidthPixels();
    let hy = this.getHeightPixels();
    let hz = this.getWidthPixels();
    if (dir !== 2 && dir !== 0) {
      hx = 0.5;
    } else {
      hz = 0.5;
      this.rotationYaw = this.prevRotationYaw = ROTATE_OPPOSITE[dir] * 90;
    }
    hx = f(hx / 32);
    hy = f(hy / 32);
    hz = f(hz / 32);
    let cx = f(this.xPosition + f(0.5));
    let cy = f(this.yPosition + f(0.5));
    let cz = f(this.zPosition + f(0.5));
    const out = f(0.5625);
    if (dir === 2) cz = f(cz - out);
    if (dir === 1) cx = f(cx - out);
    if (dir === 0) cz = f(cz + out);
    if (dir === 3) cx = f(cx + out);
    const w = this.getWidthPixels();
    if (dir === 2) cx = f(cx - halfBlockShift(w));
    if (dir === 1) cz = f(cz + halfBlockShift(w));
    if (dir === 0) cx = f(cx + halfBlockShift(w));
    if (dir === 3) cz = f(cz - halfBlockShift(w));
    cy = f(cy + halfBlockShift(this.getHeightPixels()));
    this.setPosition(cx, cy, cz);
    const g = f(-0.03125);
    this.boundingBox.setBounds(f(f(cx - hx) - g), f(f(cy - hy) - g), f(f(cz - hz) - g), f(f(cx + hx) + g), f(f(cy + hy) + g), f(f(cz + hz) + g));
  }

  override onUpdate(): void {
    if (this.tickCounter1++ === 100) {
      this.tickCounter1 = 0;
      if (!this.isDead && !this.onValidSurface()) {
        this.setDead();
        this.dropItemStack();
      }
    }
  }

  /** Free of blocks and other hanging things, with solid blocks behind every 16x16 tile. */
  onValidSurface(): boolean {
    const w = this.worldObj;
    if (w.getCollidingBoundingBoxes(this, this.boundingBox).length !== 0) return false;
    const tilesW = Math.max(1, Math.trunc(this.getWidthPixels() / 16));
    const tilesH = Math.max(1, Math.trunc(this.getHeightPixels() / 16));
    let x = this.xPosition;
    let z = this.zPosition;
    const d = this.hangingDirection;
    if (d === 2 || d === 0) x = MathHelper.floor_double(this.posX - f(this.getWidthPixels() / 32));
    if (d === 1 || d === 3) z = MathHelper.floor_double(this.posZ - f(this.getWidthPixels() / 32));
    const y = MathHelper.floor_double(this.posY - f(this.getHeightPixels() / 32));
    for (let i = 0; i < tilesW; i++) {
      for (let j = 0; j < tilesH; j++) {
        const m = d !== 2 && d !== 0 ? w.getBlockMaterial(this.xPosition, y + j, z + i) : w.getBlockMaterial(x + i, y + j, this.zPosition);
        if (!m.isSolid()) return false;
      }
    }
    for (const e of w.getEntitiesWithinAABBExcludingEntity(this, this.boundingBox)) if (e instanceof EntityHanging) return false;
    return true;
  }

  override canBeCollidedWith(): boolean {
    return true;
  }

  /** A player punch counts as a 0-damage attack (func_85031_j). */
  override hitByEntity(e: Entity): boolean {
    return e.isPlayerEntity ? this.attackEntityFrom(DamageSource.causePlayerDamage(e), 0) : false;
  }

  override attackEntityFrom(src: DamageSource, _amount: number): boolean {
    if (this.isEntityInvulnerable()) return false;
    if (!this.isDead) {
      this.setDead();
      this.setBeenAttacked();
      const by = src.getEntity();
      if (by && by.isPlayerEntity && (by as EntityPlayer).capabilities.isCreativeMode) return true;
      this.dropItemStack();
    }
    return true;
  }

  /** Any push knocks it off the wall. */
  override moveEntity(dx: number, dy: number, dz: number): void {
    if (!this.isDead && dx * dx + dy * dy + dz * dz > 0) {
      this.setDead();
      this.dropItemStack();
    }
  }

  override addVelocity(dx: number, dy: number, dz: number): void {
    if (!this.isDead && dx * dx + dy * dy + dz * dz > 0) {
      this.setDead();
      this.dropItemStack();
    }
  }

  /** Width in pixels (func_82329_d). */
  abstract getWidthPixels(): number;
  /** Height in pixels (func_82330_g). */
  abstract getHeightPixels(): number;
  abstract dropItemStack(): void;
}

/** func_70517_b: 32 and 64 pixel sizes are centred on a block edge. */
function halfBlockShift(pixels: number): number {
  return pixels === 32 || pixels === 64 ? f(0.5) : 0;
}
