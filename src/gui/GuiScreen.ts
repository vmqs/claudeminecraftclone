import type { Minecraft } from '../client/Minecraft';
import { Keyboard, Keys, Mouse } from '../client/Keyboard';
import { GL } from '../render/gl/GL';
import { Tessellator } from '../render/gl/Tessellator';
import type { FontRenderer } from './FontRenderer';
import { Gui } from './Gui';
import type { GuiButton } from './GuiButton';

/** Base screen: buttons, input dispatch, backgrounds (GuiScreen). */
export class GuiScreen extends Gui {
  mc!: Minecraft;
  width = 0;
  height = 0;
  protected buttonList: GuiButton[] = [];
  allowUserInput = false;
  protected fontRenderer!: FontRenderer;
  private selectedButton: GuiButton | null = null;
  private eventButton = 0;
  private lastMouseEvent = 0;

  drawScreen(mx: number, my: number, _pt: number): void {
    for (const b of this.buttonList) b.drawButtonOn(this.mc, mx, my);
  }

  protected keyTyped(_ch: string, key: number): void {
    if (key === Keys.ESCAPE) {
      this.mc.displayGuiScreen(null);
      this.mc.setIngameFocus();
    }
  }

  static getClipboardString(): string {
    return GuiScreen.clipboard;
  }

  static setClipboardString(s: string): void {
    GuiScreen.clipboard = s;
    void navigator.clipboard?.writeText(s).catch(() => undefined);
  }

  /** Last text pasted into the page (filled from paste events). */
  static clipboard = '';

  protected mouseClicked(x: number, y: number, button: number): void {
    if (button !== 0) return;
    for (const b of this.buttonList) {
      if (b.mousePressed(this.mc, x, y)) {
        this.selectedButton = b;
        this.mc.sndManager.playSoundFX('random.click', 1, 1);
        this.actionPerformed(b);
      }
    }
  }

  protected mouseMovedOrUp(x: number, y: number, button: number): void {
    if (this.selectedButton && button === 0) {
      this.selectedButton.mouseReleased(x, y);
      this.selectedButton = null;
    }
  }

  protected mouseClickMove(_x: number, _y: number, _button: number, _held: number): void {}

  protected actionPerformed(_b: GuiButton): void {}

  setWorldAndResolution(mc: Minecraft, w: number, h: number): void {
    this.mc = mc;
    this.fontRenderer = mc.fontRenderer;
    this.width = w;
    this.height = h;
    this.buttonList = [];
    this.initGui();
  }

  initGui(): void {}

  handleInput(): void {
    while (Mouse.next()) this.handleMouseInput();
    while (Keyboard.next()) this.handleKeyboardInput();
  }

  handleMouseInput(): void {
    const x = Math.trunc((Mouse.getEventX() * this.width) / this.mc.displayWidth);
    const y = this.height - Math.trunc((Mouse.getEventY() * this.height) / this.mc.displayHeight) - 1;
    if (Mouse.getEventButtonState()) {
      this.eventButton = Mouse.getEventButton();
      this.lastMouseEvent = performance.now();
      this.mouseClicked(x, y, this.eventButton);
    } else if (Mouse.getEventButton() !== -1) {
      this.eventButton = -1;
      this.mouseMovedOrUp(x, y, Mouse.getEventButton());
    } else if (this.eventButton !== -1 && this.lastMouseEvent > 0) {
      this.mouseClickMove(x, y, this.eventButton, performance.now() - this.lastMouseEvent);
    }
  }

  handleKeyboardInput(): void {
    if (!Keyboard.getEventKeyState()) return;
    const key = Keyboard.getEventKey();
    if (key === Keys.F11) {
      this.mc.toggleFullscreen();
      return;
    }
    this.keyTyped(Keyboard.getEventCharacter(), key);
  }

  updateScreen(): void {}

  onGuiClosed(): void {}

  drawDefaultBackground(): void {
    this.drawWorldBackground(0);
  }

  drawWorldBackground(scroll: number): void {
    if (this.mc.theWorld) this.drawGradientRect(0, 0, this.width, this.height, -1072689136, -804253680);
    else this.drawBackground(scroll);
  }

  /** The tiled dirt background of menus without a world. */
  drawBackground(scroll: number): void {
    GL.disable(GL.LIGHTING);
    GL.disable(GL.FOG);
    const t = Tessellator.instance;
    this.mc.renderEngine.bindTexture('/gui/background.png');
    GL.color(1, 1, 1, 1);
    const s = 32;
    t.startDrawingQuads();
    t.setColorOpaque_I(0x404040);
    t.addVertexWithUV(0, this.height, 0, 0, this.height / s + scroll);
    t.addVertexWithUV(this.width, this.height, 0, this.width / s, this.height / s + scroll);
    t.addVertexWithUV(this.width, 0, 0, this.width / s, scroll);
    t.addVertexWithUV(0, 0, 0, 0, scroll);
    t.draw();
  }

  doesGuiPauseGame(): boolean {
    return true;
  }

  confirmClicked(_ok: boolean, _id: number): void {}

  static isCtrlKeyDown(): boolean {
    return Keyboard.isKeyDown(Keys.LCONTROL) || Keyboard.isKeyDown(Keys.RCONTROL) || Keyboard.isKeyDown(Keys.LMETA) || Keyboard.isKeyDown(Keys.RMETA);
  }

  static isShiftKeyDown(): boolean {
    return Keyboard.isKeyDown(Keys.LSHIFT) || Keyboard.isKeyDown(Keys.RSHIFT);
  }
}
