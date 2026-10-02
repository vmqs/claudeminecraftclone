import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import type { EntityArrow } from '../../entity/EntityArrow';
import { GL } from '../gl/GL';
import { Tessellator } from '../gl/Tessellator';
import { Render } from './Render';

const f = Math.fround;

/**
 * RenderArrow: two crossed shaft quads plus the fletching cross from /item/arrows.png, turned
 * to the arrow's yaw and pitch, wobbling while `arrowShake` counts down after it sticks.
 */
export class RenderArrow extends Render {
  doRender(e: Entity, x: number, y: number, z: number, _yaw: number, pt: number): void {
    const arrow = e as EntityArrow;
    this.loadTexture('/item/arrows.png');
    GL.pushMatrix();
    GL.translate(f(x), f(y), f(z));
    GL.rotate(f(f(arrow.prevRotationYaw + f(f(arrow.rotationYaw - arrow.prevRotationYaw) * pt)) - 90), 0, 1, 0);
    GL.rotate(f(arrow.prevRotationPitch + f(f(arrow.rotationPitch - arrow.prevRotationPitch) * pt)), 0, 0, 1);
    const t = Tessellator.instance;
    const type = 0;
    const shaftU0 = 0;
    const shaftU1 = f(0.5);
    const shaftV0 = f((0 + type * 10) / 32);
    const shaftV1 = f((5 + type * 10) / 32);
    const tailU0 = 0;
    const tailU1 = f(0.15625);
    const tailV0 = f((5 + type * 10) / 32);
    const tailV1 = f((10 + type * 10) / 32);
    const s = f(0.05625);
    GL.enable(GL.RESCALE_NORMAL);
    const shake = f(arrow.arrowShake - pt);
    if (shake > 0) GL.rotate(f(-MathHelper.sin(f(shake * 3)) * shake), 0, 0, 1);
    GL.rotate(45, 1, 0, 0);
    GL.scale(s, s, s);
    GL.translate(-4, 0, 0);
    GL.normal(s, 0, 0);
    t.startDrawingQuads();
    t.addVertexWithUV(-7, -2, -2, tailU0, tailV0);
    t.addVertexWithUV(-7, -2, 2, tailU1, tailV0);
    t.addVertexWithUV(-7, 2, 2, tailU1, tailV1);
    t.addVertexWithUV(-7, 2, -2, tailU0, tailV1);
    t.draw();
    GL.normal(-s, 0, 0);
    t.startDrawingQuads();
    t.addVertexWithUV(-7, 2, -2, tailU0, tailV0);
    t.addVertexWithUV(-7, 2, 2, tailU1, tailV0);
    t.addVertexWithUV(-7, -2, 2, tailU1, tailV1);
    t.addVertexWithUV(-7, -2, -2, tailU0, tailV1);
    t.draw();
    for (let i = 0; i < 4; i++) {
      GL.rotate(90, 1, 0, 0);
      GL.normal(0, 0, s);
      t.startDrawingQuads();
      t.addVertexWithUV(-8, -2, 0, shaftU0, shaftV0);
      t.addVertexWithUV(8, -2, 0, shaftU1, shaftV0);
      t.addVertexWithUV(8, 2, 0, shaftU1, shaftV1);
      t.addVertexWithUV(-8, 2, 0, shaftU0, shaftV1);
      t.draw();
    }
    GL.disable(GL.RESCALE_NORMAL);
    GL.popMatrix();
  }
}
