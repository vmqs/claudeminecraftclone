import { Material } from '../block/Material';
import { ItemIds } from '../block/BlockIds';
import { MathHelper } from '../core/MathHelper';
import { ItemStack } from '../item/ItemStack';
import type { World } from '../world/World';
import { EntityWaterMob } from './EntityWaterMob';

const f = Math.fround;
const PI_F = f(Math.PI);
const TWO_PI_F = f(Math.PI * 2);

/**
 * The squid (EntitySquid): 10 health, swims in pulses (tentacles fold in, then it shoots off in a
 * random direction), sinks and flops on land, silent, drops 1-3 ink sacs. Spawns in water
 * between y 46 and 62.
 */
export class EntitySquid extends EntityWaterMob {
  squidPitch = 0;
  prevSquidPitch = 0;
  squidYaw = 0;
  prevSquidYaw = 0;
  /** field_70867_h / field_70868_i: the swimming cycle phase (0..2 pi) and its previous value. */
  squidRotation = 0;
  prevSquidRotation = 0;
  tentacleAngle = 0;
  prevTentacleAngle = 0;
  private randomMotionSpeed = 0;
  /** field_70864_bA: cycle speed; field_70871_bB: spin speed. */
  private rotationVelocity: number;
  private spinSpeed = 0;
  private randomMotionVecX = 0;
  private randomMotionVecY = 0;
  private randomMotionVecZ = 0;

  constructor(world: World) {
    super(world);
    this.texture = '/mob/squid.png';
    this.setSize(f(0.95), f(0.95));
    this.rotationVelocity = f(f(1 / f(this.rand.nextFloat() + 1)) * f(0.2));
  }

  getMaxHealth(): number {
    return 10;
  }

  protected override getLivingSound(): string | null {
    return null;
  }

  protected override getHurtSound(): string | null {
    return null;
  }

  protected override getDeathSound(): string | null {
    return null;
  }

  protected override getSoundVolume(): number {
    return f(0.4);
  }

  protected override getDropItemId(): number {
    return 0;
  }

  protected override dropFewItems(_recentlyHit: boolean, looting: number): void {
    const n = this.rand.nextInt(3 + looting) + 1;
    for (let i = 0; i < n; i++) this.entityDropItem(new ItemStack(ItemIds.dyePowder, 1, 0), 0);
  }

  /** In water once the box shrunk by 0.6 at the top touches water. */
  override isInWater(): boolean {
    return this.worldObj.handleMaterialAcceleration(this.boundingBox.expand(0, f(-0.6), 0), Material.water, this);
  }

  override onLivingUpdate(): void {
    super.onLivingUpdate();
    this.prevSquidPitch = this.squidPitch;
    this.prevSquidYaw = this.squidYaw;
    this.prevSquidRotation = this.squidRotation;
    this.prevTentacleAngle = this.tentacleAngle;
    this.squidRotation = f(this.squidRotation + this.rotationVelocity);
    if (this.squidRotation > TWO_PI_F) {
      this.squidRotation = f(this.squidRotation - TWO_PI_F);
      if (this.rand.nextInt(10) === 0) this.rotationVelocity = f(f(1 / f(this.rand.nextFloat() + 1)) * f(0.2));
    }
    if (this.isInWater()) {
      if (this.squidRotation < PI_F) {
        const k = f(this.squidRotation / PI_F);
        this.tentacleAngle = f(f(MathHelper.sin(f(f(k * k) * PI_F)) * PI_F) * f(0.25));
        if (k > 0.75) {
          this.randomMotionSpeed = 1;
          this.spinSpeed = 1;
        } else {
          this.spinSpeed = f(this.spinSpeed * f(0.8));
        }
      } else {
        this.tentacleAngle = 0;
        this.randomMotionSpeed = f(this.randomMotionSpeed * f(0.9));
        this.spinSpeed = f(this.spinSpeed * f(0.99));
      }
      this.motionX = f(this.randomMotionVecX * this.randomMotionSpeed);
      this.motionY = f(this.randomMotionVecY * this.randomMotionSpeed);
      this.motionZ = f(this.randomMotionVecZ * this.randomMotionSpeed);
      const horiz = MathHelper.sqrt_double(this.motionX * this.motionX + this.motionZ * this.motionZ);
      this.renderYawOffset = f(this.renderYawOffset + f(f(f(f(-f(Math.atan2(this.motionX, this.motionZ)) * 180) / PI_F) - this.renderYawOffset) * f(0.1)));
      this.rotationYaw = this.renderYawOffset;
      this.squidYaw = f(this.squidYaw + f(f(PI_F * this.spinSpeed) * f(1.5)));
      this.squidPitch = f(this.squidPitch + f(f(f(f(-f(Math.atan2(horiz, this.motionY)) * 180) / PI_F) - this.squidPitch) * f(0.1)));
    } else {
      this.tentacleAngle = f(f(MathHelper.abs(MathHelper.sin(this.squidRotation)) * PI_F) * f(0.25));
      this.motionX = 0;
      this.motionY -= 0.08;
      this.motionY *= f(0.98);
      this.motionZ = 0;
      this.squidPitch = f(this.squidPitch + (-90 - this.squidPitch) * 0.02);
    }
  }

  /** Squids move only by their own motion. */
  override moveEntityWithHeading(_strafe: number, _forward: number): void {
    this.moveEntity(this.motionX, this.motionY, this.motionZ);
  }

  /** Picks a new swimming direction now and then (never after 100 ticks without a player near). */
  protected override updateEntityActionState(): void {
    this.entityAge++;
    if (this.entityAge > 100) {
      this.randomMotionVecX = this.randomMotionVecY = this.randomMotionVecZ = 0;
    } else if (this.rand.nextInt(50) === 0 || !this.inWater || (this.randomMotionVecX === 0 && this.randomMotionVecY === 0 && this.randomMotionVecZ === 0)) {
      const a = f(f(this.rand.nextFloat() * PI_F) * 2);
      this.randomMotionVecX = f(MathHelper.cos(a) * f(0.2));
      this.randomMotionVecY = f(f(-0.1) + f(this.rand.nextFloat() * f(0.2)));
      this.randomMotionVecZ = f(MathHelper.sin(a) * f(0.2));
    }
    this.despawnEntity();
  }

  override getCanSpawnHere(): boolean {
    return this.posY > 45 && this.posY < 63 && super.getCanSpawnHere();
  }
}
