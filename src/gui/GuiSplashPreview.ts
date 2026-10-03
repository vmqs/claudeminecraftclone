import { drawStretched, loadSplashTexture } from '../client/BootSplash';
import { deleteTexture } from '../render/entity/SkinTextures';
import { GL } from '../render/gl/GL';
import { GuiScreen } from './GuiScreen';

/**
 * The boot splash as a screen (`mc.dev.screen('splash1')` / `'splash2'`), drawn the same way as
 * at start-up, stretched over the window, so screenshots can show it after the game has loaded.
 * Any key or click goes back to the title screen.
 */
export class GuiSplashPreview extends GuiScreen {
  private tex: WebGLTexture | null = null;
  private loading = false;

  constructor(private readonly index: number) {
    super();
  }

  override initGui(): void {
    if (this.tex || this.loading) return;
    this.loading = true;
    void loadSplashTexture(this.mc.renderEngine, this.index).then((t) => {
      this.tex = t;
      this.loading = false;
    });
  }

  /** True once the picture is up (automation waits for it). */
  get ready(): boolean {
    return this.tex !== null;
  }

  override drawScreen(): void {
    GL.clearColor(0, 0, 0, 1);
    GL.clear(GL.COLOR_BUFFER_BIT);
    if (!this.tex) return;
    GL.disable(GL.DEPTH_TEST);
    drawStretched(this.tex, this.width, this.height);
    GL.enable(GL.DEPTH_TEST);
  }

  protected override keyTyped(): void {
    this.mc.displayGuiScreen(null);
  }

  protected override mouseClicked(): void {
    this.mc.displayGuiScreen(null);
  }

  override onGuiClosed(): void {
    if (this.tex) deleteTexture(this.tex);
    this.tex = null;
  }

  override doesGuiPauseGame(): boolean {
    return false;
  }
}
