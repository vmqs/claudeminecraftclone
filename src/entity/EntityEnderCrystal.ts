import { BlockIds } from '../block/BlockIds';
import { MathHelper } from '../core/MathHelper';
import type { World } from '../world/World';
import type { DamageSource } from './DamageSource';
import { Entity } from './Entity';

const f = Math.fround;

/**
 * An ender crystal (EntityEnderCrystal): keeps a fire burning at its feet and explodes
 * (strength 6) when hit by anything.
 */
export class EntityEnderCrystal extends Entity {
  innerRotation = 0;
  health = 5;

  constructor(world: World, x?: number, y?: number, z?: number) {
    super(world);
    this.preventEntitySpawning = true;
    this.setSize(2, 2);
    this.yOffset = f(this.height / 2);
    this.health = 5;
    this.innerRotation = this.rand.nextInt(100000);
    if (x !== undefined && y !== undefined && z !== undefined) this.setPosition(x, y, z);
  }

  protected entityInit(): void {}

  protected override canTriggerWalking(): boolean {
    return false;
  }

  override onUpdate(): void {
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    this.innerRotation++;
    const x = MathHelper.floor_double(this.posX);
    const y = MathHelper.floor_double(this.posY);
    const z = MathHelper.floor_double(this.posZ);
    if (this.worldObj.getBlockId(x, y, z) !== BlockIds.fire) this.worldObj.setBlock(x, y, z, BlockIds.fire);
  }

  override getShadowSize(): number {
    return 0;
  }

  override canBeCollidedWith(): boolean {
    return true;
  }

  override attackEntityFrom(_src: DamageSource, _amount: number): boolean {
    if (this.isEntityInvulnerable()) return false;
    if (!this.isDead) {
      this.health = 0;
      this.setDead();
      this.worldObj.createExplosion(null, this.posX, this.posY, this.posZ, 6, true);
    }
    return true;
  }
}
