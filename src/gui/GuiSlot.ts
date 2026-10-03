import type { Minecraft } from '../client/Minecraft';
import { Mouse } from '../client/Keyboard';
import { GL } from '../render/gl/GL';
import { Tessellator } from '../render/gl/Tessellator';
import type { GuiButton } from './GuiButton';

const f = Math.fround;

/**
 * A scrolling list (GuiSlot) for the world, texture pack, language and stats screens: rows
 * of slotHeight between top and bottom over the dirt background, a scroll bar at
 * width / 2 + 124, drag and wheel scrolling, click and double-click selection.
 */
export abstract class GuiSlot {
  protected top: number;
  protected bottom: number;
  protected mouseX = 0;
  protected mouseY = 0;
  private left = 0;
  private right: number;
  private scrollUpButtonID = 0;
  private scrollDownButtonID = 0;
  /** -1 waiting for a press, -2 ignoring the current press, otherwise the drag's last y. */
  private initialClickY = -2;
  private scrollMultiplier = 0;
  private amountScrolled = 0;
  private selectedElement = -1;
  private lastClicked = 0;
  private showSelectionBox = true;
  /** A header row above the entries (field_77243_s / field_77242_t). */
  private hasListHeader = false;
  private headerPadding = 0;

  constructor(
    private readonly mc: Minecraft,
    private width: number,
    private height: number,
    top: number,
    bottom: number,
    protected readonly slotHeight: number,
  ) {
    this.top = top;
    this.bottom = bottom;
    this.right = width;
  }

  /** func_77207_a: new screen size. */
  setDimensions(width: number, height: number, top: number, bottom: number): void {
    this.width = width;
    this.height = height;
    this.top = top;
    this.bottom = bottom;
    this.left = 0;
    this.right = width;
  }

  setShowSelectionBox(v: boolean): void {
    this.showSelectionBox = v;
  }

  /** func_77223_a */
  protected setHasListHeader(v: boolean, padding: number): void {
    this.hasListHeader = v;
    this.headerPadding = v ? padding : 0;
  }

  protected abstract getSize(): number;
  protected abstract elementClicked(index: number, doubleClick: boolean): void;
  protected abstract isSelected(index: number): boolean;
  protected abstract drawBackground(): void;
  protected abstract drawSlot(index: number, x: number, y: number, height: number, t: Tessellator): void;

  protected getContentHeight(): number {
    return this.getSize() * this.slotHeight + this.headerPadding;
  }

  /** func_77222_a: draws the header row. */
  protected drawListHeader(_x: number, _y: number, _t: Tessellator): void {}

  /** func_77224_a: a click on the header. */
  protected headerClicked(_x: number, _y: number): void {}

  /** func_77215_b: tooltips and other overlays after the list. */
  protected drawOverlay(_mx: number, _my: number): void {}

  /** func_77210_c: the entry under (x, y), or -1. */
  getSlotIndexFromScreenCoords(x: number, y: number): number {
    const x0 = Math.trunc(this.width / 2) - 110;
    const x1 = Math.trunc(this.width / 2) + 110;
    const rel = y - this.top - this.headerPadding + Math.trunc(this.amountScrolled) - 4;
    const i = Math.trunc(rel / this.slotHeight);
    return x >= x0 && x <= x1 && i >= 0 && rel >= 0 && i < this.getSize() ? i : -1;
  }

  registerScrollButtons(_buttons: GuiButton[], up: number, down: number): void {
    this.scrollUpButtonID = up;
    this.scrollDownButtonID = down;
  }

  private bindAmountScrolled(): void {
    let max = this.getMaxScroll();
    if (max < 0) max = Math.trunc(max / 2);
    if (this.amountScrolled < 0) this.amountScrolled = 0;
    if (this.amountScrolled > max) this.amountScrolled = max;
  }

  /** func_77209_d */
  getMaxScroll(): number {
    return this.getContentHeight() - (this.bottom - this.top - 4);
  }

  /** func_77208_b */
  scrollBy(n: number): void {
    this.amountScrolled = f(this.amountScrolled + n);
    this.bindAmountScrolled();
    this.initialClickY = -2;
  }

  actionPerformed(b: GuiButton): void {
    if (!b.enabled) return;
    const step = Math.trunc((this.slotHeight * 2) / 3);
    if (b.id === this.scrollUpButtonID) {
      this.amountScrolled = f(this.amountScrolled - step);
      this.initialClickY = -2;
      this.bindAmountScrolled();
    } else if (b.id === this.scrollDownButtonID) {
      this.amountScrolled = f(this.amountScrolled + step);
      this.initialClickY = -2;
      this.bindAmountScrolled();
    }
  }

  drawScreen(mx: number, my: number, _pt: number): void {
    this.mouseX = mx;
    this.mouseY = my;
    this.drawBackground();
    const size = this.getSize();
    const barX0 = this.getScrollBarX();
    const barX1 = barX0 + 6;
    this.handleInput(mx, my, size, barX0, barX1);
    this.bindAmountScrolled();
    GL.disable(GL.LIGHTING);
    GL.disable(GL.FOG);
    const t = Tessellator.instance;
    const scroll = Math.trunc(this.amountScrolled);
    this.mc.renderEngine.bindTexture('/gui/background.png');
    GL.color(1, 1, 1, 1);
    const k = 32;
    t.startDrawingQuads();
    t.setColorOpaque_I(0x202020);
    t.addVertexWithUV(this.left, this.bottom, 0, f(this.left / k), f((this.bottom + scroll) / k));
    t.addVertexWithUV(this.right, this.bottom, 0, f(this.right / k), f((this.bottom + scroll) / k));
    t.addVertexWithUV(this.right, this.top, 0, f(this.right / k), f((this.top + scroll) / k));
    t.addVertexWithUV(this.left, this.top, 0, f(this.left / k), f((this.top + scroll) / k));
    t.draw();
    const rowX = Math.trunc(this.width / 2) - 92 - 16;
    const rowY = this.top + 4 - scroll;
    if (this.hasListHeader) this.drawListHeader(rowX, rowY, t);
    for (let i = 0; i < size; i++) {
      const y = rowY + i * this.slotHeight + this.headerPadding;
      const h = this.slotHeight - 4;
      if (y > this.bottom || y + h < this.top) continue;
      if (this.showSelectionBox && this.isSelected(i)) this.drawSelectionBox(y, h, t);
      this.drawSlot(i, rowX, y, h, t);
    }
    GL.disable(GL.DEPTH_TEST);
    const fade = 4;
    this.overlayBackground(0, this.top, 255, 255);
    this.overlayBackground(this.bottom, this.height, 255, 255);
    GL.enable(GL.BLEND);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    GL.disable(GL.ALPHA_TEST);
    GL.shadeModel(GL.SMOOTH);
    GL.disable(GL.TEXTURE_2D);
    this.gradientQuad(t, this.top + fade, this.top, 0, 255);
    this.gradientQuad(t, this.bottom, this.bottom - fade, 255, 0);
    const max = this.getMaxScroll();
    if (max > 0) {
      const range = this.bottom - this.top;
      const thumb = Math.min(range - 8, Math.max(32, Math.trunc((range * range) / this.getContentHeight())));
      const thumbY = Math.max(this.top, Math.trunc((scroll * (range - thumb)) / max) + this.top);
      this.flatQuad(t, barX0, barX1, this.top, this.bottom, 0x000000);
      this.flatQuad(t, barX0, barX1, thumbY, thumbY + thumb, 0x808080);
      this.flatQuad(t, barX0, barX1 - 1, thumbY, thumbY + thumb - 1, 0xc0c0c0);
    }
    this.drawOverlay(mx, my);
    GL.enable(GL.TEXTURE_2D);
    GL.shadeModel(GL.FLAT);
    GL.enable(GL.ALPHA_TEST);
    GL.disable(GL.BLEND);
  }

  /** Press inside the list selects (double-click within 250 ms), on the bar drags it; the wheel scrolls. */
  private handleInput(mx: number, my: number, size: number, barX0: number, barX1: number): void {
    if (!Mouse.isButtonDown(0)) {
      // The original drained every queued mouse event here for the wheel. Browser button events
      // are queued the moment they happen, so a quick click could be swallowed before the screen
      // sees it: only wheel events are taken.
      if (!this.mc.gameSettings.touchscreen) {
        const rest = Mouse.queue.filter((e) => {
          if (e.button !== -1 || e.dWheel === 0) return true;
          this.amountScrolled = f(this.amountScrolled + Math.trunc(((e.dWheel > 0 ? -1 : 1) * this.slotHeight) / 2));
          return false;
        });
        Mouse.queue.length = 0;
        Mouse.queue.push(...rest);
      }
      this.initialClickY = -1;
      return;
    }
    if (this.initialClickY >= 0) {
      this.amountScrolled = f(this.amountScrolled - f(f(my - this.initialClickY) * this.scrollMultiplier));
      this.initialClickY = my;
      return;
    }
    if (this.initialClickY !== -1) return;
    if (my < this.top || my > this.bottom) {
      this.initialClickY = -2;
      return;
    }
    let drag = true;
    const x0 = Math.trunc(this.width / 2) - 110;
    const x1 = Math.trunc(this.width / 2) + 110;
    const rel = my - this.top - this.headerPadding + Math.trunc(this.amountScrolled) - 4;
    const index = Math.trunc(rel / this.slotHeight);
    if (mx >= x0 && mx <= x1 && index >= 0 && rel >= 0 && index < size) {
      const now = performance.now();
      this.elementClicked(index, index === this.selectedElement && now - this.lastClicked < 250);
      this.selectedElement = index;
      this.lastClicked = now;
    } else if (mx >= x0 && mx <= x1 && rel < 0) {
      this.headerClicked(mx - x0, my - this.top + Math.trunc(this.amountScrolled) - 4);
      drag = false;
    }
    if (mx >= barX0 && mx <= barX1) {
      const max = Math.max(1, this.getMaxScroll());
      const range = this.bottom - this.top;
      const thumb = Math.min(range - 8, Math.max(32, Math.trunc(f(f(range * range) / this.getContentHeight()))));
      this.scrollMultiplier = f(-1 / f(f(range - thumb) / max));
    } else {
      this.scrollMultiplier = 1;
    }
    this.initialClickY = drag ? my : -2;
  }

  private drawSelectionBox(y: number, h: number, t: Tessellator): void {
    const x0 = Math.trunc(this.width / 2) - 110;
    const x1 = Math.trunc(this.width / 2) + 110;
    GL.color(1, 1, 1, 1);
    GL.disable(GL.TEXTURE_2D);
    t.startDrawingQuads();
    t.setColorOpaque_I(0x808080);
    t.addVertexWithUV(x0, y + h + 2, 0, 0, 1);
    t.addVertexWithUV(x1, y + h + 2, 0, 1, 1);
    t.addVertexWithUV(x1, y - 2, 0, 1, 0);
    t.addVertexWithUV(x0, y - 2, 0, 0, 0);
    t.setColorOpaque_I(0x000000);
    t.addVertexWithUV(x0 + 1, y + h + 1, 0, 0, 1);
    t.addVertexWithUV(x1 - 1, y + h + 1, 0, 1, 1);
    t.addVertexWithUV(x1 - 1, y - 1, 0, 1, 0);
    t.addVertexWithUV(x0 + 1, y - 1, 0, 0, 0);
    t.draw();
    GL.enable(GL.TEXTURE_2D);
  }

  /** A black band fading from alpha `a0` at y0 to `a1` at y1 (the list's soft edges). */
  private gradientQuad(t: Tessellator, y0: number, y1: number, a0: number, a1: number): void {
    t.startDrawingQuads();
    t.setColorRGBA_I(0, a0);
    t.addVertexWithUV(this.left, y0, 0, 0, 1);
    t.addVertexWithUV(this.right, y0, 0, 1, 1);
    t.setColorRGBA_I(0, a1);
    t.addVertexWithUV(this.right, y1, 0, 1, 0);
    t.addVertexWithUV(this.left, y1, 0, 0, 0);
    t.draw();
  }

  private flatQuad(t: Tessellator, x0: number, x1: number, y0: number, y1: number, rgb: number): void {
    t.startDrawingQuads();
    t.setColorRGBA_I(rgb, 255);
    t.addVertexWithUV(x0, y1, 0, 0, 1);
    t.addVertexWithUV(x1, y1, 0, 1, 1);
    t.addVertexWithUV(x1, y0, 0, 1, 0);
    t.addVertexWithUV(x0, y0, 0, 0, 0);
    t.draw();
  }

  protected getScrollBarX(): number {
    return Math.trunc(this.width / 2) + 124;
  }

  /** The dirt strips above and below the list. */
  private overlayBackground(y0: number, y1: number, a0: number, a1: number): void {
    const t = Tessellator.instance;
    this.mc.renderEngine.bindTexture('/gui/background.png');
    GL.color(1, 1, 1, 1);
    const k = 32;
    t.startDrawingQuads();
    t.setColorRGBA_I(0x404040, a1);
    t.addVertexWithUV(0, y1, 0, 0, f(y1 / k));
    t.addVertexWithUV(this.width, y1, 0, f(this.width / k), f(y1 / k));
    t.setColorRGBA_I(0x404040, a0);
    t.addVertexWithUV(this.width, y0, 0, f(this.width / k), f(y0 / k));
    t.addVertexWithUV(0, y0, 0, 0, f(y0 / k));
    t.draw();
  }
}
