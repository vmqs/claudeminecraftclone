import { MathHelper } from '../../core/MathHelper';
import type { World } from '../../world/World';
import type { Tessellator } from '../gl/Tessellator';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/**
 * The flash of a firework burst: the big soft disc at cells (4..7, 2..5) of particles.png,
 * tinted with the first colour, growing to about 7 blocks and fading over 4 ticks.
 */
export class EntityFireworkOverlayFX extends EntityFX {
  constructor(w: World, x: number, y: number, z: number) {
    super(w, x, y, z);
    this.particleMaxAge = 4;
  }

  override renderParticle(t: Tessellator, pt: number, rx: number, rxz: number, rz: number, ryz: number, rxy: number): void {
    const u0 = f(0.25);
    const u1 = f(u0 + f(0.25));
    const v0 = f(0.125);
    const v1 = f(v0 + f(0.25));
    const phase = f(f(f(this.particleAge + pt) - 1) * f(0.25));
    const s = f(f(7.1) * MathHelper.sin(f(phase * f(Math.PI))));
    this.particleAlpha = f(f(0.6) - f(phase * f(0.5)));
    const x = f(this.prevPosX + (this.posX - this.prevPosX) * pt - EntityFX.interpPosX);
    const y = f(this.prevPosY + (this.posY - this.prevPosY) * pt - EntityFX.interpPosY);
    const z = f(this.prevPosZ + (this.posZ - this.prevPosZ) * pt - EntityFX.interpPosZ);
    t.setColorRGBA_F(this.particleRed, this.particleGreen, this.particleBlue, this.particleAlpha);
    EntityFX.billboard(t, x, y, z, s, rx, rxz, rz, ryz, rxy, u1, u0, v0, v1);
  }
}
