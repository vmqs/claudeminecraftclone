import { MathHelper } from '../../core/MathHelper';
import type { World } from '../../world/World';
import { GL } from '../gl/GL';
import type { Tessellator } from '../gl/Tessellator';
import type { TextureManager } from '../texture/TextureManager';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/**
 * "footstep": a flat footprint (misc/footprint.png) on the ground for 200 ticks, shaded by
 * the world light and fading out over the second half of its life.
 */
export class EntityFootStepFX extends EntityFX {
  private footstepAge = 0;
  private readonly footstepMaxAge = 200;

  constructor(
    private readonly currentFootSteps: TextureManager,
    w: World,
    x: number,
    y: number,
    z: number,
  ) {
    super(w, x, y, z, 0, 0, 0);
    this.motionX = this.motionY = this.motionZ = 0;
  }

  override renderParticle(t: Tessellator, pt: number): void {
    let k = f(f(this.footstepAge + pt) / this.footstepMaxAge);
    k = f(k * k);
    let alpha = f(2 - f(k * 2));
    if (alpha > 1) alpha = 1;
    alpha = f(alpha * f(0.2));
    GL.disable(GL.LIGHTING);
    const r = f(0.125);
    const x = f(this.posX - EntityFX.interpPosX);
    const y = f(this.posY - EntityFX.interpPosY);
    const z = f(this.posZ - EntityFX.interpPosZ);
    const light = this.worldObj.getLightBrightness(MathHelper.floor_double(this.posX), MathHelper.floor_double(this.posY), MathHelper.floor_double(this.posZ));
    this.currentFootSteps.bindTexture('/misc/footprint.png');
    GL.enable(GL.BLEND);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    t.startDrawingQuads();
    t.setColorRGBA_F(light, light, light, alpha);
    t.addVertexWithUV(x - r, y, z + r, 0, 1);
    t.addVertexWithUV(x + r, y, z + r, 1, 1);
    t.addVertexWithUV(x + r, y, z - r, 1, 0);
    t.addVertexWithUV(x - r, y, z - r, 0, 0);
    t.draw();
    GL.disable(GL.BLEND);
    GL.enable(GL.LIGHTING);
  }

  override onUpdate(): void {
    if (++this.footstepAge === this.footstepMaxAge) this.setDead();
  }

  override getFXLayer(): number {
    return 3;
  }
}
