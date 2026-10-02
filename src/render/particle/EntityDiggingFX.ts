import type { Block } from '../../block/Block';
import { BlockIds } from '../../block/BlockIds';
import type { World } from '../../world/World';
import type { Tessellator } from '../gl/Tessellator';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/**
 * A block fragment from the terrain atlas: the 4x4x4 burst of a broken block, the crumbs of a
 * hit face, and "tilecrack_<id>_<meta>" (running, landing). Always the bottom-face icon of the
 * metadata, at 60% brightness, tinted by the block colour except for grass.
 */
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
    return this.tint(this.blockInstance.colorMultiplier(this.worldObj, x, y, z));
  }

  /** Tints by the block's item colour for a metadata (not for grass). */
  applyRenderColor(meta: number): this {
    if (this.blockInstance.blockID === BlockIds.grass) return this;
    return this.tint(this.blockInstance.getRenderColor(meta));
  }

  private tint(c: number): this {
    this.particleRed = f(this.particleRed * f(((c >> 16) & 255) / 255));
    this.particleGreen = f(this.particleGreen * f(((c >> 8) & 255) / 255));
    this.particleBlue = f(this.particleBlue * f((c & 255) / 255));
    return this;
  }

  override getFXLayer(): number {
    return 1;
  }

  override renderParticle(t: Tessellator, pt: number, rx: number, rxz: number, rz: number, ryz: number, rxy: number): void {
    this.renderIconCrumb(t, pt, rx, rxz, rz, ryz, rxy);
  }
}
