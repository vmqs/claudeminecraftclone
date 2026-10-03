import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../Entity';
import type { EntityLiving } from '../EntityLiving';

const f = Math.fround;

/** Turns pitch and head yaw towards a look target at limited speeds (EntityLookHelper). */
export class EntityLookHelper {
  private deltaLookYaw = 0;
  private deltaLookPitch = 0;
  private isLooking = false;
  private posX = 0;
  private posY = 0;
  private posZ = 0;

  constructor(private readonly entity: EntityLiving) {}

  setLookPositionWithEntity(e: Entity, yawSpeed: number, pitchSpeed: number): void {
    this.posX = e.posX;
    this.posY = e.isLivingEntity ? e.posY + e.getEyeHeight() : (e.boundingBox.minY + e.boundingBox.maxY) / 2;
    this.posZ = e.posZ;
    this.deltaLookYaw = yawSpeed;
    this.deltaLookPitch = pitchSpeed;
    this.isLooking = true;
  }

  setLookPosition(x: number, y: number, z: number, yawSpeed: number, pitchSpeed: number): void {
    this.posX = x;
    this.posY = y;
    this.posZ = z;
    this.deltaLookYaw = yawSpeed;
    this.deltaLookPitch = pitchSpeed;
    this.isLooking = true;
  }

  onUpdateLook(): void {
    const e = this.entity;
    e.rotationPitch = 0;
    if (this.isLooking) {
      this.isLooking = false;
      const dx = this.posX - e.posX;
      const dy = this.posY - (e.posY + e.getEyeHeight());
      const dz = this.posZ - e.posZ;
      const horiz = MathHelper.sqrt_double(dx * dx + dz * dz);
      const yaw = f(f((Math.atan2(dz, dx) * 180) / f(Math.PI)) - 90);
      const pitch = f(-((Math.atan2(dy, horiz) * 180) / f(Math.PI)));
      e.rotationPitch = turnTowards(e.rotationPitch, pitch, this.deltaLookPitch);
      e.rotationYawHead = turnTowards(e.rotationYawHead, yaw, this.deltaLookYaw);
    } else {
      e.rotationYawHead = turnTowards(e.rotationYawHead, e.renderYawOffset, 10);
    }
    const headOffset = MathHelper.wrapAngleTo180_float(e.rotationYawHead - e.renderYawOffset);
    if (!e.getNavigator().noPath()) {
      if (headOffset < -75) e.rotationYawHead = f(e.renderYawOffset - 75);
      if (headOffset > 75) e.rotationYawHead = f(e.renderYawOffset + 75);
    }
  }
}

/** Moves `from` towards `to` by at most `maxStep` degrees, the short way round. */
export function turnTowards(from: number, to: number, maxStep: number): number {
  let d = MathHelper.wrapAngleTo180_float(to - from);
  if (d > maxStep) d = maxStep;
  if (d < -maxStep) d = -maxStep;
  return f(from + d);
}
