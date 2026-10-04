import { MathHelper } from '../../core/MathHelper';
import type { EntityLiving } from '../EntityLiving';
import { turnTowards } from './EntityLookHelper';

const f = Math.fround;

/** Steers towards a move target: turns at most 30 degrees a tick and sets the AI speed. */
export class EntityMoveHelper {
  private posX: number;
  private posY: number;
  private posZ: number;
  private speed = 0;
  private update = false;

  constructor(private readonly entity: EntityLiving) {
    this.posX = entity.posX;
    this.posY = entity.posY;
    this.posZ = entity.posZ;
  }

  isUpdating(): boolean {
    return this.update;
  }

  getSpeed(): number {
    return this.speed;
  }

  setMoveTo(x: number, y: number, z: number, speed: number): void {
    this.posX = x;
    this.posY = y;
    this.posZ = z;
    this.speed = speed;
    this.update = true;
  }

  onUpdateMoveHelper(): void {
    const e = this.entity;
    e.setMoveForward(0);
    if (!this.update) return;
    this.update = false;
    const feetY = MathHelper.floor_double(e.boundingBox.minY + 0.5);
    const dx = this.posX - e.posX;
    const dz = this.posZ - e.posZ;
    const dy = this.posY - feetY;
    if (dx * dx + dy * dy + dz * dz < f(2.5000003e-7)) return;
    const yaw = f(f((Math.atan2(dz, dx) * 180) / f(Math.PI)) - 90);
    e.rotationYaw = turnTowards(e.rotationYaw, yaw, 30);
    e.setAIMoveSpeed(f(this.speed * e.getSpeedModifier()));
    if (dy > 0 && dx * dx + dz * dz < 1) e.getJumpHelper().setJumping();
  }
}
