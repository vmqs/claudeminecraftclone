import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import type { EntityXPOrb } from '../../entity/EntityXPOrb';
import { GL } from '../gl/GL';
import { Tessellator } from '../gl/Tessellator';
import { OpenGlHelper } from '../OpenGlHelper';
import { Render } from './Render';

const f = Math.fround;

/**
 * RenderXPOrb: a camera-facing sprite from the 4x4 grid of /item/xporb.png (bigger orbs use
 * later cells), lit at least half bright and tinted with a green-yellow colour pulse.
 */
export class RenderXPOrb extends Render {
  constructor() {
    super();
    this.shadowSize = f(0.15);
    this.shadowOpaque = f(0.75);
  }

  doRender(e: Entity, x: number, y: number, z: number, _yaw: number, pt: number): void {
    const orb = e as EntityXPOrb;
    GL.pushMatrix();
    GL.translate(f(x), f(y), f(z));
    const cell = orb.getTextureByXP();
    this.loadTexture('/item/xporb.png');
    const t = Tessellator.instance;
    const u0 = f(((cell % 4) * 16 + 0) / 64);
    const u1 = f(((cell % 4) * 16 + 16) / 64);
    const v0 = f((Math.trunc(cell / 4) * 16 + 0) / 64);
    const v1 = f((Math.trunc(cell / 4) * 16 + 16) / 64);
    const w = 1;
    const hx = f(0.5);
    const hy = f(0.25);
    const light = orb.getBrightnessForRender(pt);
    OpenGlHelper.setLightmapTextureCoords(OpenGlHelper.lightmapTexUnit, light % 65536, Math.trunc(light / 65536));
    GL.color(1, 1, 1, 1);
    const phase = f(f(orb.xpColor + pt) / 2);
    const r = Math.trunc(f(f(f(MathHelper.sin(phase) + 1) * f(0.5)) * 255));
    const g = 255;
    const b = Math.trunc(f(f(f(MathHelper.sin(f(phase + f((Math.PI * 4) / 3))) + 1) * f(0.1)) * 255));
    const color = (r << 16) | (g << 8) | b;
    GL.rotate(f(180 - this.renderManager.playerViewY), 0, 1, 0);
    GL.rotate(-this.renderManager.playerViewX, 1, 0, 0);
    const s = f(0.3);
    GL.scale(s, s, s);
    t.startDrawingQuads();
    t.setColorRGBA_I(color, 128);
    t.setNormal(0, 1, 0);
    t.addVertexWithUV(0 - hx, 0 - hy, 0, u0, v1);
    t.addVertexWithUV(w - hx, 0 - hy, 0, u1, v1);
    t.addVertexWithUV(w - hx, w - hy, 0, u1, v0);
    t.addVertexWithUV(0 - hx, w - hy, 0, u0, v0);
    t.draw();
    GL.disable(GL.BLEND);
    GL.disable(GL.RESCALE_NORMAL);
    GL.popMatrix();
  }
}
