import { MathHelper } from '../../core/MathHelper';
import type { EntityLiving } from '../EntityLiving';

const f = Math.fround;

/**
 * Body yaw of AI mobs (EntityBodyHelper): while moving the body faces the movement and the head
 * stays within 75 degrees of it; standing still, the body slowly follows the head after a
 * 10-tick pause.
 */
export class EntityBodyHelper {
  private stillTicks = 0;
  private lastHeadYaw = 0;

  constructor(private readonly living: EntityLiving) {}

  /** func_75664_a */
  updateRenderAngles(): void {
    const e = this.living;
    const dx = e.posX - e.prevPosX;
    const dz = e.posZ - e.prevPosZ;
    if (dx * dx + dz * dz > f(2.5000003e-7)) {
      e.renderYawOffset = e.rotationYaw;
      e.rotationYawHead = clampAround(e.renderYawOffset, e.rotationYawHead, 75);
      this.lastHeadYaw = e.rotationYawHead;
      this.stillTicks = 0;
      return;
    }
    let limit = 75;
    if (Math.abs(e.rotationYawHead - this.lastHeadYaw) > 15) {
      this.stillTicks = 0;
      this.lastHeadYaw = e.rotationYawHead;
    } else if (++this.stillTicks > 10) {
      limit = f(Math.max(f(1 - f((this.stillTicks - 10) / 10)), 0) * 75);
    }
    e.renderYawOffset = clampAround(e.rotationYawHead, e.renderYawOffset, limit);
  }
}

/** `value` pulled to within `limit` degrees of `center` (func_75665_a). */
function clampAround(center: number, value: number, limit: number): number {
  let d = MathHelper.wrapAngleTo180_float(center - value);
  if (d < -limit) d = -limit;
  if (d >= limit) d = limit;
  return f(center - d);
}
