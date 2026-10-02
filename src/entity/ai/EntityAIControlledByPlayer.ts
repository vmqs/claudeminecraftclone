import { Block } from '../../block/Block';
import { BlockHalfSlab } from '../../block/BlockHalfSlab';
import { ItemIds } from '../../block/BlockIds';
import { MathHelper } from '../../core/MathHelper';
import { ItemStack } from '../../item/ItemStack';
import type { EntityLiving } from '../EntityLiving';
import type { EntityPlayer } from '../EntityPlayer';
import { EntityAIBase } from './EntityAIBase';
import { PathCell, PathFinder } from './PathFinder';
import { PathPoint } from './PathPoint';

const f = Math.fround;
const PI_F = f(Math.PI);

/**
 * Pig riding (EntityAIControlledByPlayer): while a player holding a carrot on a stick rides,
 * the pig turns towards the rider's yaw (5 degrees a tick at most), accelerates towards
 * `maxSpeed`, jumps single steps on its own and wears the stick down now and then (survival).
 * boostSpeed (right click with the stick) adds a sine-shaped burst of 140-980 ticks.
 */
export class EntityAIControlledByPlayer extends EntityAIBase {
  private currentSpeed = 0;
  private speedBoosted = false;
  private speedBoostTime = 0;
  private maxSpeedBoostTime = 0;

  constructor(
    private readonly thisEntity: EntityLiving,
    private readonly maxSpeed: number,
  ) {
    super();
    this.setMutexBits(7);
  }

  override startExecuting(): void {
    this.currentSpeed = 0;
  }

  override resetTask(): void {
    this.speedBoosted = false;
    this.currentSpeed = 0;
  }

  shouldExecute(): boolean {
    const e = this.thisEntity;
    return e.isEntityAlive() && e.riddenByEntity !== null && e.riddenByEntity.isPlayerEntity && (this.speedBoosted || e.canBeSteered());
  }

  override updateTask(): void {
    const e = this.thisEntity;
    const rider = e.riddenByEntity as EntityPlayer;
    let turn = f(MathHelper.wrapAngleTo180_float(rider.rotationYaw - e.rotationYaw) * f(0.5));
    if (turn > 5) turn = 5;
    if (turn < -5) turn = -5;
    e.rotationYaw = MathHelper.wrapAngleTo180_float(e.rotationYaw + turn);
    if (this.currentSpeed < this.maxSpeed) this.currentSpeed = f(this.currentSpeed + f((this.maxSpeed - this.currentSpeed) * f(0.01)));
    if (this.currentSpeed > this.maxSpeed) this.currentSpeed = this.maxSpeed;
    const x = MathHelper.floor_double(e.posX);
    const y = MathHelper.floor_double(e.posY);
    const z = MathHelper.floor_double(e.posZ);
    let speed = this.currentSpeed;
    if (this.speedBoosted) {
      if (this.speedBoostTime++ > this.maxSpeedBoostTime) this.speedBoosted = false;
      speed = f(speed + f(f(speed * f(1.15)) * MathHelper.sin(f(f(f(this.speedBoostTime) / f(this.maxSpeedBoostTime)) * PI_F))));
    }
    let slip = f(0.91);
    if (e.onGround) {
      slip = f(0.54600006);
      const id = e.worldObj.getBlockId(MathHelper.floor_float(x), MathHelper.floor_float(y) - 1, MathHelper.floor_float(z));
      if (id > 0) slip = f(f(Block.blocksList[id]!.slipperiness) * f(0.91));
    }
    const accel = f(f(0.16277136) / f(f(slip * slip) * slip));
    const sin = MathHelper.sin(f(f(e.rotationYaw * PI_F) / 180));
    const cos = MathHelper.cos(f(f(e.rotationYaw * PI_F) / 180));
    const move = f(e.getAIMoveSpeed() * accel);
    const k = f(move / Math.max(speed, 1));
    const step = f(speed * k);
    let dx = f(-f(step * sin));
    let dz = f(step * cos);
    const half = f(e.width / 2);
    if (MathHelper.abs(dx) > MathHelper.abs(dz)) {
      if (dx < 0) dx = f(dx - half);
      if (dx > 0) dx = f(dx + half);
      dz = 0;
    } else {
      dx = 0;
      if (dz < 0) dz = f(dz - half);
      if (dz > 0) dz = f(dz + half);
    }
    const nx = MathHelper.floor_double(e.posX + dx);
    const nz = MathHelper.floor_double(e.posZ + dz);
    const size = new PathPoint(MathHelper.floor_float(f(e.width + 1)), MathHelper.floor_float(f(f(e.height + rider.height) + 1)), MathHelper.floor_float(f(e.width + 1)));
    if (x !== nx || z !== nz) {
      const here = e.worldObj.getBlockId(x, y, z);
      const below = e.worldObj.getBlockId(x, y - 1, z);
      const onStep = this.isStairOrSlab(here) || (Block.blocksList[here] == null && this.isStairOrSlab(below));
      if (
        !onStep &&
        PathFinder.checkCell(e, nx, y, nz, size, false, false, true) === PathCell.Blocked &&
        PathFinder.checkCell(e, x, y + 1, z, size, false, false, true) === PathCell.Clear &&
        PathFinder.checkCell(e, nx, y + 1, nz, size, false, false, true) === PathCell.Clear
      ) {
        e.getJumpHelper().setJumping();
      }
    }
    if (!rider.capabilities.isCreativeMode && this.currentSpeed >= f(this.maxSpeed * f(0.5)) && e.getRNG().nextFloat() < f(0.006) && !this.speedBoosted) {
      const held = rider.getHeldItem();
      if (held && held.itemID === ItemIds.carrotOnAStick) {
        held.damageItem(1, rider);
        if (held.stackSize === 0) {
          const rod = new ItemStack(ItemIds.fishingRod);
          rod.setTagCompound(held.stackTagCompound);
          rider.inventory.mainInventory[rider.inventory.currentItem] = rod;
        }
      }
    }
    e.moveEntityWithHeading(0, speed);
  }

  /** func_98216_b: stairs (render type 10) or half slabs, which the pig walks up by itself. */
  private isStairOrSlab(id: number): boolean {
    const b = Block.blocksList[id];
    return b != null && (b.getRenderType() === 10 || b instanceof BlockHalfSlab);
  }

  isSpeedBoosted(): boolean {
    return this.speedBoosted;
  }

  boostSpeed(): void {
    this.speedBoosted = true;
    this.speedBoostTime = 0;
    this.maxSpeedBoostTime = this.thisEntity.getRNG().nextInt(841) + 140;
  }

  isControlledByPlayer(): boolean {
    return !this.isSpeedBoosted() && this.currentSpeed > f(this.maxSpeed * f(0.3));
  }
}
