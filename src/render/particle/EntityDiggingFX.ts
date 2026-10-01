import type { Block } from '../../block/Block';
import { BlockIds } from '../../block/BlockIds';
import type { World } from '../../world/World';
import type { Tessellator } from '../gl/Tessellator';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/** Block fragments from breaking/hitting a block, textured from the terrain atlas. */
export class EntityDiggingFX extends EntityFX {
  constructor(
    w: World,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    private readonly blockInstance: Block,
    _side: number,
    meta: number,
  ) {
    super(w, x, y, z, vx, vy, vz);
    this.setParticleIcon(blockInstance.getIcon(0, meta));
    this.particleGravity = blockInstance.blockParticleGravity;
    this.particleRed = this.particleGreen = this.particleBlue = f(0.6);
    this.particleScale = f(this.particleScale / 2);
  }

  /** func_70596_a: tints by the block's colour multiplier at a position (not for grass). */
  applyColourMultiplier(x: number, y: number, z: number): this {
    if (this.blockInstance.blockID === BlockIds.grass) return this;
    const c = this.blockInstance.colorMultiplier(this.worldObj, x, y, z);
    this.particleRed = f(this.particleRed * f(((c >> 16) & 255) / 255));
    this.particleGreen = f(this.particleGreen * f(((c >> 8) & 255) / 255));
    this.particleBlue = f(this.particleBlue * f((c & 255) / 255));
    return this;
  }

  applyRenderColor(meta: number): this {
    if (this.blockInstance.blockID === BlockIds.grass) return this;
    const c = this.blockInstance.getRenderColor(meta);
    this.particleRed = f(this.particleRed * f(((c >> 16) & 255) / 255));
    this.particleGreen = f(this.particleGreen * f(((c >> 8) & 255) / 255));
    this.particleBlue = f(this.particleBlue * f((c & 255) / 255));
    return this;
  }

  override getFXLayer(): number {
    return 1;
  }

  override renderParticle(t: Tessellator, pt: number, rx: number, rxz: number, rz: number, ryz: number, rxy: number): void {
    let u0 = f(f(this.particleTextureIndexX + f(this.particleTextureJitterX / 4)) / 16);
    let u1 = f(u0 + f(0.015609375));
    let v0 = f(f(this.particleTextureIndexY + f(this.particleTextureJitterY / 4)) / 16);
    let v1 = f(v0 + f(0.015609375));
    const s = f(0.1 * this.particleScale);
    if (this.particleIcon) {
      u0 = this.particleIcon.getInterpolatedU(f(f(this.particleTextureJitterX / 4) * 16));
      u1 = this.particleIcon.getInterpolatedU(f(f(f(this.particleTextureJitterX + 1) / 4) * 16));
      v0 = this.particleIcon.getInterpolatedV(f(f(this.particleTextureJitterY / 4) * 16));
      v1 = this.particleIcon.getInterpolatedV(f(f(f(this.particleTextureJitterY + 1) / 4) * 16));
    }
    const x = f(this.prevPosX + (this.posX - this.prevPosX) * pt - EntityFX.interpPosX);
    const y = f(this.prevPosY + (this.posY - this.prevPosY) * pt - EntityFX.interpPosY);
    const z = f(this.prevPosZ + (this.posZ - this.prevPosZ) * pt - EntityFX.interpPosZ);
    t.setColorOpaque_F(this.particleRed, this.particleGreen, this.particleBlue);
    t.addVertexWithUV(x - rx * s - ryz * s, y - rxz * s, z - rz * s - rxy * s, u0, v1);
    t.addVertexWithUV(x - rx * s + ryz * s, y + rxz * s, z - rz * s + rxy * s, u0, v0);
    t.addVertexWithUV(x + rx * s + ryz * s, y + rxz * s, z + rz * s + rxy * s, u1, v0);
    t.addVertexWithUV(x + rx * s - ryz * s, y - rxz * s, z + rz * s - rxy * s, u1, v1);
  }
}
