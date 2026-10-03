import { Block } from '../block/Block';
import { MathHelper } from '../core/MathHelper';
import type { World } from '../world/World';
import { EntityLiving } from './EntityLiving';

const f = Math.fround;

/** Flying mobs (EntityFlying: ghasts): no gravity, no fall damage, air drag in all axes. */
export abstract class EntityFlying extends EntityLiving {
  constructor(world: World) {
    super(world);
  }

  protected override fall(_dist: number): void {}

  protected override updateFallState(_dy: number, _onGround: boolean): void {}

  private friction(): number {
    if (!this.onGround) return f(0.91);
    const id = this.worldObj.getBlockId(MathHelper.floor_double(this.posX), MathHelper.floor_double(this.boundingBox.minY) - 1, MathHelper.floor_double(this.posZ));
    const b = id > 0 ? Block.blocksList[id] : null;
    return b ? f(f(b.slipperiness) * f(0.91)) : f(0.54600006);
  }

  override moveEntityWithHeading(strafe: number, forward: number): void {
    if (this.isInWater()) {
      this.moveFlying(strafe, forward, f(0.02));
      this.moveEntity(this.motionX, this.motionY, this.motionZ);
      this.motionX *= f(0.8);
      this.motionY *= f(0.8);
      this.motionZ *= f(0.8);
    } else if (this.handleLavaMovement()) {
      this.moveFlying(strafe, forward, f(0.02));
      this.moveEntity(this.motionX, this.motionY, this.motionZ);
      this.motionX *= 0.5;
      this.motionY *= 0.5;
      this.motionZ *= 0.5;
    } else {
      let slip = this.friction();
      const accel = f(f(0.16277136) / f(f(slip * slip) * slip));
      this.moveFlying(strafe, forward, this.onGround ? f(f(0.1) * accel) : f(0.02));
      slip = this.friction();
      this.moveEntity(this.motionX, this.motionY, this.motionZ);
      this.motionX *= slip;
      this.motionY *= slip;
      this.motionZ *= slip;
    }
    this.prevLimbYaw = this.limbYaw;
    const dx = this.posX - this.prevPosX;
    const dz = this.posZ - this.prevPosZ;
    let l = f(MathHelper.sqrt_double(dx * dx + dz * dz) * 4);
    if (l > 1) l = 1;
    this.limbYaw = f(this.limbYaw + (l - this.limbYaw) * f(0.4));
    this.limbSwing = f(this.limbSwing + this.limbYaw);
  }

  override isOnLadder(): boolean {
    return false;
  }
}
