import type { World } from '../../world/World';
import { GL } from '../gl/GL';
import type { Tessellator } from '../gl/Tessellator';
import { RenderHelper } from '../RenderHelper';
import type { TextureManager } from '../texture/TextureManager';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/**
 * "largeexplode": one 4x4-frame animation of misc/explosion.png played over 6-9 ticks, full
 * bright, 4 blocks wide at the start of a huge explosion and shrinking to 2 by its end.
 */
export class EntityLargeExplodeFX extends EntityFX {
  private age = 0;
  private readonly maxAge: number;
  private readonly size: number;

  constructor(
    private readonly theRenderEngine: TextureManager,
    w: World,
    x: number,
    y: number,
    z: number,
    progress: number,
    _vy: number,
    _vz: number,
  ) {
    super(w, x, y, z, 0, 0, 0);
    this.maxAge = 6 + this.rand.nextInt(4);
    this.particleRed = this.particleGreen = this.particleBlue = f(f(this.rand.nextFloat() * f(0.6)) + f(0.4));
    this.size = f(1 - f(f(progress) * f(0.5)));
  }

  override renderParticle(t: Tessellator, pt: number, rx: number, rxz: number, rz: number, ryz: number, rxy: number): void {
    const frame = Math.trunc(f(f(f(this.age + pt) * 15) / this.maxAge));
    if (frame > 15) return;
    this.theRenderEngine.bindTexture('/misc/explosion.png');
    const u0 = f((frame % 4) / 4);
    const u1 = f(u0 + f(0.24975));
    const v0 = f(Math.trunc(frame / 4) / 4);
    const v1 = f(v0 + f(0.24975));
    const s = f(2 * this.size);
    const x = f(this.prevPosX + (this.posX - this.prevPosX) * pt - EntityFX.interpPosX);
    const y = f(this.prevPosY + (this.posY - this.prevPosY) * pt - EntityFX.interpPosY);
    const z = f(this.prevPosZ + (this.posZ - this.prevPosZ) * pt - EntityFX.interpPosZ);
    GL.color(1, 1, 1, 1);
    GL.disable(GL.LIGHTING);
    RenderHelper.disableStandardItemLighting();
    t.startDrawingQuads();
    t.setColorRGBA_F(this.particleRed, this.particleGreen, this.particleBlue, 1);
    t.setNormal(0, 1, 0);
    t.setBrightness(240);
    EntityFX.billboard(t, x, y, z, s, rx, rxz, rz, ryz, rxy, u1, u0, v0, v1);
    t.draw();
    GL.polygonOffset(0, 0);
    GL.enable(GL.LIGHTING);
  }

  override getBrightnessForRender(_pt: number): number {
    return 61680;
  }

  override onUpdate(): void {
    this.prevPosX = this.posX;
    this.prevPosY = this.posY;
    this.prevPosZ = this.posZ;
    if (++this.age === this.maxAge) this.setDead();
  }

  override getFXLayer(): number {
    return 3;
  }
}
