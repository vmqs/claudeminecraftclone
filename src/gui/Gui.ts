import { GL } from '../render/gl/GL';
import { Tessellator } from '../render/gl/Tessellator';
import type { Icon } from '../render/texture/Icon';
import type { FontRenderer } from './FontRenderer';

const f = Math.fround;

/** Drawing helpers shared by every screen and HUD element (Gui). */
export class Gui {
  protected zLevel = 0;

  protected drawHorizontalLine(x0: number, x1: number, y: number, color: number): void {
    if (x1 < x0) [x0, x1] = [x1, x0];
    Gui.drawRect(x0, y, x1 + 1, y + 1, color);
  }

  protected drawVerticalLine(x: number, y0: number, y1: number, color: number): void {
    if (y1 < y0) [y0, y1] = [y1, y0];
    Gui.drawRect(x, y0 + 1, x + 1, y1, color);
  }

  static drawRect(x0: number, y0: number, x1: number, y1: number, color: number): void {
    if (x0 < x1) [x0, x1] = [x1, x0];
    if (y0 < y1) [y0, y1] = [y1, y0];
    const a = ((color >>> 24) & 255) / 255;
    const r = ((color >> 16) & 255) / 255;
    const g = ((color >> 8) & 255) / 255;
    const b = (color & 255) / 255;
    const t = Tessellator.instance;
    GL.enable(GL.BLEND);
    GL.disable(GL.TEXTURE_2D);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    GL.color(r, g, b, a);
    t.startDrawingQuads();
    t.addVertex(x0, y1, 0);
    t.addVertex(x1, y1, 0);
    t.addVertex(x1, y0, 0);
    t.addVertex(x0, y0, 0);
    t.draw();
    GL.enable(GL.TEXTURE_2D);
    GL.disable(GL.BLEND);
  }

  protected drawGradientRect(x0: number, y0: number, x1: number, y1: number, top: number, bottom: number): void {
    const t = Tessellator.instance;
    GL.disable(GL.TEXTURE_2D);
    GL.enable(GL.BLEND);
    GL.disable(GL.ALPHA_TEST);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    t.startDrawingQuads();
    t.setColorRGBA_F(((top >> 16) & 255) / 255, ((top >> 8) & 255) / 255, (top & 255) / 255, ((top >>> 24) & 255) / 255);
    t.addVertex(x1, y0, this.zLevel);
    t.addVertex(x0, y0, this.zLevel);
    t.setColorRGBA_F(((bottom >> 16) & 255) / 255, ((bottom >> 8) & 255) / 255, (bottom & 255) / 255, ((bottom >>> 24) & 255) / 255);
    t.addVertex(x0, y1, this.zLevel);
    t.addVertex(x1, y1, this.zLevel);
    t.draw();
    GL.disable(GL.BLEND);
    GL.enable(GL.ALPHA_TEST);
    GL.enable(GL.TEXTURE_2D);
  }

  drawCenteredString(fr: FontRenderer, s: string, x: number, y: number, color: number): void {
    fr.drawStringWithShadow(s, x - Math.trunc(fr.getStringWidth(s) / 2), y, color);
  }

  drawString(fr: FontRenderer, s: string, x: number, y: number, color: number): void {
    fr.drawStringWithShadow(s, x, y, color);
  }

  /** A rect from a 256x256 GUI texture (UVs in 1/256 units, so HD textures work). */
  drawTexturedModalRect(x: number, y: number, u: number, v: number, w: number, h: number): void {
    const k = f(0.00390625);
    const t = Tessellator.instance;
    t.startDrawingQuads();
    t.addVertexWithUV(x + 0, y + h, this.zLevel, f((u + 0) * k), f((v + h) * k));
    t.addVertexWithUV(x + w, y + h, this.zLevel, f((u + w) * k), f((v + h) * k));
    t.addVertexWithUV(x + w, y + 0, this.zLevel, f((u + w) * k), f((v + 0) * k));
    t.addVertexWithUV(x + 0, y + 0, this.zLevel, f((u + 0) * k), f((v + 0) * k));
    t.draw();
  }

  drawTexturedModelRectFromIcon(x: number, y: number, icon: Icon, w: number, h: number): void {
    const t = Tessellator.instance;
    t.startDrawingQuads();
    t.addVertexWithUV(x + 0, y + h, this.zLevel, icon.getMinU(), icon.getMaxV());
    t.addVertexWithUV(x + w, y + h, this.zLevel, icon.getMaxU(), icon.getMaxV());
    t.addVertexWithUV(x + w, y + 0, this.zLevel, icon.getMaxU(), icon.getMinV());
    t.addVertexWithUV(x + 0, y + 0, this.zLevel, icon.getMinU(), icon.getMinV());
    t.draw();
  }
}
