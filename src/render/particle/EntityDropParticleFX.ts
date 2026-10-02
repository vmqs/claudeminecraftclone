import { BlockFluid } from '../../block/BlockFluid';
import { Material } from '../../block/Material';
import { MathHelper } from '../../core/MathHelper';
import type { World } from '../../world/World';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/**
 * "dripWater" / "dripLava": a drop that hangs under the block for 40 ticks (cell 113), falls
 * (cell 112) and then splashes (water) or lies on the ground as a puddle (lava, cell 114).
 * Lava drops are full-bright and cool from yellow to red while hanging.
 */
export class EntityDropParticleFX extends EntityFX {
  private bobTimer = 40;

  constructor(
    w: World,
    x: number,
    y: number,
    z: number,
    private readonly materialType: Material,
  ) {
    super(w, x, y, z, 0, 0, 0);
    this.motionX = this.motionY = this.motionZ = 0;
    if (materialType === Material.water) this.setRBGColorF(0, 0, 1);
    else this.setRBGColorF(1, 0, 0);
    this.setParticleTextureIndex(113);
    this.setSize(f(0.01), f(0.01));
    this.particleGravity = f(0.06);
    this.particleMaxAge = Math.trunc(64 / (Math.random() * 0.8 + 0.2));
    this.motionX = this.motionY = this.motionZ = 0;
  }

  override getBrightnessForRender(pt: number): number {
    return this.materialType === Material.water ? super.getBrightnessForRender(pt) : 257;
  }

  override getBrightness(pt: number): number {
    return this.materialType === Material.water ? super.getBrightness(pt) : 1;
  }

  override onUpdate(): void {
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    if (this.materialType === Material.water) {
      this.setRBGColorF(f(0.2), f(0.3), 1);
    } else {
      this.setRBGColorF(1, f(16 / (40 - this.bobTimer + 16)), f(4 / (40 - this.bobTimer + 8)));
    }
    this.motionY -= this.particleGravity;
    if (this.bobTimer-- > 0) {
      this.motionX *= 0.02;
      this.motionY *= 0.02;
      this.motionZ *= 0.02;
      this.setParticleTextureIndex(113);
    } else {
      this.setParticleTextureIndex(112);
    }
    this.moveEntity(this.motionX, this.motionY, this.motionZ);
    this.motionX *= f(0.98);
    this.motionY *= f(0.98);
    this.motionZ *= f(0.98);
    if (this.particleMaxAge-- <= 0) this.setDead();
    if (this.onGround) {
      if (this.materialType === Material.water) {
        this.setDead();
        this.worldObj.spawnParticle('splash', this.posX, this.posY, this.posZ, 0, 0, 0);
      } else {
        this.setParticleTextureIndex(114);
      }
      this.motionX *= f(0.7);
      this.motionZ *= f(0.7);
    }
    diesInsideBlock(this);
  }
}

/**
 * Rain drops and drips vanish once inside a liquid (below its surface) or a solid block,
 * using the fluid height of the block's metadata either way.
 */
export function diesInsideBlock(fx: EntityFX): void {
  const x = MathHelper.floor_double(fx.posX);
  const y = MathHelper.floor_double(fx.posY);
  const z = MathHelper.floor_double(fx.posZ);
  const m = fx.worldObj.getBlockMaterial(x, y, z);
  if (m.isLiquid() || m.isSolid()) {
    const surface = f(y + 1 - BlockFluid.getFluidHeightPercent(fx.worldObj.getBlockMetadata(x, y, z)));
    if (fx.posY < surface) fx.setDead();
  }
}
