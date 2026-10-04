import type { TextureManager } from '../texture/TextureManager';
import { GL } from '../gl/GL';
import { Tessellator } from '../gl/Tessellator';
import { RenderHelper } from '../RenderHelper';

/** The End's sky texture (RenderGlobal.renderSky binds it for dimension 1). */
export const END_SKY_TEXTURE = '/misc/tunnel.png';

/**
 * RenderGlobal.renderSky for The End: a box of six faces around the camera, each the tunnel
 * texture tiled 16 times and tinted 0x282828, drawn without fog, alpha test or depth writes.
 * The Nether draws no sky at all (only the fog colour the frame is cleared to).
 */
export function renderEndSky(engine: TextureManager): void {
  GL.disable(GL.FOG);
  GL.disable(GL.ALPHA_TEST);
  GL.enable(GL.BLEND);
  GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
  RenderHelper.disableStandardItemLighting();
  GL.depthMask(false);
  engine.bindTexture(END_SKY_TEXTURE);
  const t = Tessellator.instance;
  for (let i = 0; i < 6; i++) {
    GL.pushMatrix();
    if (i === 1) GL.rotate(90, 1, 0, 0);
    if (i === 2) GL.rotate(-90, 1, 0, 0);
    if (i === 3) GL.rotate(180, 1, 0, 0);
    if (i === 4) GL.rotate(90, 0, 0, 1);
    if (i === 5) GL.rotate(-90, 0, 0, 1);
    t.startDrawingQuads();
    t.setColorOpaque_I(0x282828);
    t.addVertexWithUV(-100, -100, -100, 0, 0);
    t.addVertexWithUV(-100, -100, 100, 0, 16);
    t.addVertexWithUV(100, -100, 100, 16, 16);
    t.addVertexWithUV(100, -100, -100, 16, 0);
    t.draw();
    GL.popMatrix();
  }
  GL.depthMask(true);
  GL.enable(GL.TEXTURE_2D);
  GL.enable(GL.ALPHA_TEST);
}
