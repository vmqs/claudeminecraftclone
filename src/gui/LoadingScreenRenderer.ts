import type { Minecraft } from '../client/Minecraft';
import { GL } from '../render/gl/GL';
import { Tessellator } from '../render/gl/Tessellator';
import { ScaledResolution } from './ScaledResolution';

/**
 * LoadingScreenRenderer: the dirt screen with a title, a status line and an optional
 * progress bar. The original drew it from inside blocking loops; here the main loop draws
 * it every frame while `active` is set.
 */
export class LoadingScreenRenderer {
  active = false;
  private title = '';
  private message = '';
  private progress = -1;

  constructor(private readonly mc: Minecraft) {}

  resetProgressAndMessage(title: string): void {
    this.active = true;
    this.title = title;
  }

  displayProgressMessage(title: string): void {
    this.resetProgressAndMessage(title);
  }

  resetProgresAndWorkingMessage(message: string): void {
    this.message = message;
    this.progress = -1;
  }

  /** 0-100, or -1 for no bar. */
  setLoadingProgress(p: number): void {
    this.progress = p;
  }

  onNoMoreProgress(): void {
    this.active = false;
  }

  draw(): void {
    const mc = this.mc;
    const sr = new ScaledResolution(mc.gameSettings.guiScale, mc.displayWidth, mc.displayHeight);
    const w = sr.getScaledWidth();
    const h = sr.getScaledHeight();
    GL.viewport(0, 0, mc.displayWidth, mc.displayHeight);
    GL.clear(GL.DEPTH_BUFFER_BIT);
    GL.matrixMode(GL.PROJECTION);
    GL.loadIdentity();
    GL.ortho(0, sr.getScaledWidth_double(), sr.getScaledHeight_double(), 0, 100, 300);
    GL.matrixMode(GL.MODELVIEW);
    GL.loadIdentity();
    GL.translate(0, 0, -200);
    GL.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);
    GL.disable(GL.FOG);
    GL.disable(GL.LIGHTING);
    GL.color(1, 1, 1, 1);
    const t = Tessellator.instance;
    mc.renderEngine.bindTexture('/gui/background.png');
    const s = 32;
    t.startDrawingQuads();
    t.setColorOpaque_I(0x404040);
    t.addVertexWithUV(0, h, 0, 0, h / s);
    t.addVertexWithUV(w, h, 0, w / s, h / s);
    t.addVertexWithUV(w, 0, 0, w / s, 0);
    t.addVertexWithUV(0, 0, 0, 0, 0);
    t.draw();
    if (this.progress >= 0) {
      const bw = 100;
      const bh = 2;
      const x = Math.trunc(w / 2) - Math.trunc(bw / 2);
      const y = Math.trunc(h / 2) + 16;
      GL.disable(GL.TEXTURE_2D);
      t.startDrawingQuads();
      t.setColorOpaque_I(0x808080);
      t.addVertex(x, y, 0);
      t.addVertex(x, y + bh, 0);
      t.addVertex(x + bw, y + bh, 0);
      t.addVertex(x + bw, y, 0);
      t.setColorOpaque_I(0x80ff80);
      t.addVertex(x, y, 0);
      t.addVertex(x, y + bh, 0);
      t.addVertex(x + this.progress, y + bh, 0);
      t.addVertex(x + this.progress, y, 0);
      t.draw();
      GL.enable(GL.TEXTURE_2D);
    }
    const fr = mc.fontRenderer;
    fr.drawStringWithShadow(this.title, Math.trunc((w - fr.getStringWidth(this.title)) / 2), Math.trunc(h / 2) - 4 - 16, 0xffffff);
    fr.drawStringWithShadow(this.message, Math.trunc((w - fr.getStringWidth(this.message)) / 2), Math.trunc(h / 2) - 4 + 8, 0xffffff);
  }
}
