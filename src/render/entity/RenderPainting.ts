import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import type { EntityPainting } from '../../entity/EntityPainting';
import { GL } from '../gl/GL';
import { Tessellator } from '../gl/Tessellator';
import { OpenGlHelper } from '../OpenGlHelper';
import { Render } from './Render';

const f = Math.fround;

/**
 * RenderPainting: the motive from /art/kz.png on the front, the wooden back and edges, drawn
 * one 16x16 tile at a time, each lit by the block in front of that tile.
 */
export class RenderPainting extends Render {
  doRender(e: Entity, x: number, y: number, z: number, yaw: number, _pt: number): void {
    const p = e as EntityPainting;
    GL.pushMatrix();
    GL.translate(f(x), f(y), f(z));
    GL.rotate(yaw, 0, 1, 0);
    GL.enable(GL.RESCALE_NORMAL);
    this.loadTexture('/art/kz.png');
    const s = f(0.0625);
    GL.scale(s, s, s);
    this.renderPainting(p, p.art.sizeX, p.art.sizeY, p.art.offsetX, p.art.offsetY);
    GL.disable(GL.RESCALE_NORMAL);
    GL.popMatrix();
  }

  private renderPainting(p: EntityPainting, w: number, h: number, ox: number, oy: number): void {
    const x0 = f(-w / 2);
    const y0 = f(-h / 2);
    const depth = f(0.5);
    const backU0 = f(0.75);
    const backU1 = f(0.8125);
    const backV0 = 0;
    const backV1 = f(0.0625);
    const edgeU0 = f(0.75);
    const edgeU1 = f(0.8125);
    const edgeV0 = f(0.001953125);
    const edgeV1 = f(0.001953125);
    const sideU0 = f(0.7519531);
    const sideU1 = f(0.7519531);
    const sideV0 = 0;
    const sideV1 = f(0.0625);
    const t = Tessellator.instance;
    for (let i = 0; i < w / 16; i++) {
      for (let j = 0; j < h / 16; j++) {
        const right = f(x0 + (i + 1) * 16);
        const left = f(x0 + i * 16);
        const top = f(y0 + (j + 1) * 16);
        const bottom = f(y0 + j * 16);
        this.setLightForTile(p, f(f(right + left) / 2), f(f(top + bottom) / 2));
        const u0 = f((ox + w - i * 16) / 256);
        const u1 = f((ox + w - (i + 1) * 16) / 256);
        const v0 = f((oy + h - j * 16) / 256);
        const v1 = f((oy + h - (j + 1) * 16) / 256);
        t.startDrawingQuads();
        t.setNormal(0, 0, -1);
        t.addVertexWithUV(right, bottom, -depth, u1, v0);
        t.addVertexWithUV(left, bottom, -depth, u0, v0);
        t.addVertexWithUV(left, top, -depth, u0, v1);
        t.addVertexWithUV(right, top, -depth, u1, v1);
        t.setNormal(0, 0, 1);
        t.addVertexWithUV(right, top, depth, backU0, backV0);
        t.addVertexWithUV(left, top, depth, backU1, backV0);
        t.addVertexWithUV(left, bottom, depth, backU1, backV1);
        t.addVertexWithUV(right, bottom, depth, backU0, backV1);
        t.setNormal(0, 1, 0);
        t.addVertexWithUV(right, top, -depth, edgeU0, edgeV0);
        t.addVertexWithUV(left, top, -depth, edgeU1, edgeV0);
        t.addVertexWithUV(left, top, depth, edgeU1, edgeV1);
        t.addVertexWithUV(right, top, depth, edgeU0, edgeV1);
        t.setNormal(0, -1, 0);
        t.addVertexWithUV(right, bottom, depth, edgeU0, edgeV0);
        t.addVertexWithUV(left, bottom, depth, edgeU1, edgeV0);
        t.addVertexWithUV(left, bottom, -depth, edgeU1, edgeV1);
        t.addVertexWithUV(right, bottom, -depth, edgeU0, edgeV1);
        t.setNormal(-1, 0, 0);
        t.addVertexWithUV(right, top, depth, sideU1, sideV0);
        t.addVertexWithUV(right, bottom, depth, sideU1, sideV1);
        t.addVertexWithUV(right, bottom, -depth, sideU0, sideV1);
        t.addVertexWithUV(right, top, -depth, sideU0, sideV0);
        t.setNormal(1, 0, 0);
        t.addVertexWithUV(left, top, -depth, sideU1, sideV0);
        t.addVertexWithUV(left, bottom, -depth, sideU1, sideV1);
        t.addVertexWithUV(left, bottom, depth, sideU0, sideV1);
        t.addVertexWithUV(left, top, depth, sideU0, sideV0);
        t.draw();
      }
    }
  }

  /** func_77008_a: the lightmap from the block the tile hangs in front of. */
  private setLightForTile(p: EntityPainting, cx: number, cy: number): void {
    let x = MathHelper.floor_double(p.posX);
    const y = MathHelper.floor_double(p.posY + f(cy / 16));
    let z = MathHelper.floor_double(p.posZ);
    const d = p.hangingDirection;
    if (d === 2) x = MathHelper.floor_double(p.posX + f(cx / 16));
    if (d === 1) z = MathHelper.floor_double(p.posZ - f(cx / 16));
    if (d === 0) x = MathHelper.floor_double(p.posX - f(cx / 16));
    if (d === 3) z = MathHelper.floor_double(p.posZ + f(cx / 16));
    const light = this.renderManager.worldObj!.getLightBrightnessForSkyBlocks(x, y, z, 0);
    OpenGlHelper.setLightmapTextureCoords(OpenGlHelper.lightmapTexUnit, light % 65536, Math.trunc(light / 65536));
    GL.color(1, 1, 1);
  }
}
