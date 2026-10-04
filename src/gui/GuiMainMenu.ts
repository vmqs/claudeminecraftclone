import { JavaRandom } from '../core/JavaRandom';
import { I18n } from '../core/I18n';
import { MathHelper } from '../core/MathHelper';
import { GL } from '../render/gl/GL';
import { Tessellator } from '../render/gl/Tessellator';
import { GuiAccountManager } from './GuiAccountManager';
import { GuiButton } from './GuiButton';
import { GuiLanguage } from './GuiLanguage';
import { GuiMultiplayer } from './GuiMultiplayer';
import { GuiOptions } from './GuiOptions';
import { GuiScreen } from './GuiScreen';
import { GuiSelectWorld } from './GuiSelectWorld';

const f = Math.fround;
const rand = new JavaRandom();
const PANORAMA = [0, 1, 2, 3, 4, 5].map((i) => `/title/bg/panorama${i}.png`);

/** The language button: a 20x20 globe from gui.png. */
class GuiButtonLanguage extends GuiButton {
  constructor(id: number, x: number, y: number) {
    super(id, x, y, 20, 20, '');
  }

  override drawButtonOn(mc: GuiScreen['mc'], mx: number, my: number): void {
    if (!this.drawButton) return;
    mc.renderEngine.bindTexture('/gui/gui.png');
    GL.color(1, 1, 1, 1);
    const hover = mx >= this.xPosition && my >= this.yPosition && mx < this.xPosition + this.width && my < this.yPosition + this.height;
    this.drawTexturedModalRect(this.xPosition, this.yPosition, 0, 106 + (hover ? this.height : 0), this.width, this.height);
  }
}

/** Title screen: blurred rotating panorama, logo, splash text and the main buttons. */
export class GuiMainMenu extends GuiScreen {
  static splashes: string[] = [];
  private readonly updateCounter = rand.nextFloat();
  private splashText = 'missingno';
  private panoramaTimer = 0;
  private viewportTexture: WebGLTexture | null = null;

  constructor() {
    super();
    if (GuiMainMenu.splashes.length > 0) {
      do {
        this.splashText = GuiMainMenu.splashes[rand.nextInt(GuiMainMenu.splashes.length)];
      } while (this.splashText === 'This message will never appear on the splash screen, isn\'t that weird?');
    }
  }

  override updateScreen(): void {
    this.panoramaTimer++;
  }

  override doesGuiPauseGame(): boolean {
    return false;
  }

  protected override keyTyped(): void {}

  override initGui(): void {
    this.viewportTexture ??= this.mc.renderEngine.allocateTexture(256, 256, true);
    const d = new Date();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    if (m === 11 && day === 9) this.splashText = 'Happy birthday, ez!';
    else if (m === 6 && day === 1) this.splashText = 'Happy birthday, Notch!';
    else if (m === 12 && day === 24) this.splashText = 'Merry X-mas!';
    else if (m === 1 && day === 1) this.splashText = 'Happy new year!';
    else if (m === 10 && day === 31) this.splashText = 'OOoooOOOoooo! Spooky!';
    const t = (k: string) => I18n.translateToLocal(k);
    const y = Math.trunc(this.height / 4) + 48;
    this.buttonList.push(new GuiButton(1, Math.trunc(this.width / 2) - 100, y, t('menu.singleplayer')));
    this.buttonList.push(new GuiButton(2, Math.trunc(this.width / 2) - 100, y + 24, t('menu.multiplayer')));
    // Where 1.5.2 put its third row (Minecraft Realms, when offered): the Account Manager.
    this.buttonList.push(new GuiButton(6, Math.trunc(this.width / 2) - 100, y + 48, 'Account Manager'));
    this.buttonList.push(new GuiButton(0, Math.trunc(this.width / 2) - 100, y + 72 + 12, 98, 20, t('menu.options')));
    this.buttonList.push(new GuiButton(4, Math.trunc(this.width / 2) + 2, y + 72 + 12, 98, 20, t('menu.quit')));
    this.buttonList.push(new GuiButtonLanguage(5, Math.trunc(this.width / 2) - 124, y + 72 + 12));
  }

  protected override actionPerformed(b: GuiButton): void {
    if (b.id === 0) this.mc.displayGuiScreen(new GuiOptions(this, this.mc.gameSettings));
    if (b.id === 5) this.mc.displayGuiScreen(new GuiLanguage(this, this.mc.gameSettings));
    if (b.id === 1) this.mc.displayGuiScreen(new GuiSelectWorld(this));
    if (b.id === 2) this.mc.displayGuiScreen(new GuiMultiplayer(this));
    if (b.id === 6) this.mc.displayGuiScreen(new GuiAccountManager(this));
    if (b.id === 4) this.mc.shutdown();
  }

  private drawPanorama(pt: number): void {
    const t = Tessellator.instance;
    GL.matrixMode(GL.PROJECTION);
    GL.pushMatrix();
    GL.loadIdentity();
    GL.perspective(120, 1, f(0.05), 10);
    GL.matrixMode(GL.MODELVIEW);
    GL.pushMatrix();
    GL.loadIdentity();
    GL.color(1, 1, 1, 1);
    GL.rotate(180, 1, 0, 0);
    GL.enable(GL.BLEND);
    GL.disable(GL.ALPHA_TEST);
    GL.disable(GL.CULL_FACE);
    GL.depthMask(false);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    const n = 8;
    for (let i = 0; i < n * n; i++) {
      GL.pushMatrix();
      const ox = f(f(f((i % n) / n) - f(0.5)) / 64);
      const oy = f(f(f(Math.trunc(i / n) / n) - f(0.5)) / 64);
      GL.translate(ox, oy, 0);
      GL.rotate(f(f(MathHelper.sin(f(f(this.panoramaTimer + pt) / 400)) * 25) + 20), 1, 0, 0);
      GL.rotate(f(-(this.panoramaTimer + pt) * f(0.1)), 0, 1, 0);
      for (let side = 0; side < 6; side++) {
        GL.pushMatrix();
        if (side === 1) GL.rotate(90, 0, 1, 0);
        if (side === 2) GL.rotate(180, 0, 1, 0);
        if (side === 3) GL.rotate(-90, 0, 1, 0);
        if (side === 4) GL.rotate(90, 1, 0, 0);
        if (side === 5) GL.rotate(-90, 1, 0, 0);
        this.mc.renderEngine.bindTexture(PANORAMA[side]);
        t.startDrawingQuads();
        t.setColorRGBA_I(0xffffff, Math.trunc(255 / (i + 1)));
        t.addVertexWithUV(-1, -1, 1, 0, 0);
        t.addVertexWithUV(1, -1, 1, 1, 0);
        t.addVertexWithUV(1, 1, 1, 1, 1);
        t.addVertexWithUV(-1, 1, 1, 0, 1);
        t.draw();
        GL.popMatrix();
      }
      GL.popMatrix();
    }
    GL.matrixMode(GL.PROJECTION);
    GL.popMatrix();
    GL.matrixMode(GL.MODELVIEW);
    GL.popMatrix();
    GL.depthMask(true);
    GL.enable(GL.CULL_FACE);
    GL.enable(GL.ALPHA_TEST);
    GL.enable(GL.DEPTH_TEST);
  }

  private rotateAndBlurSkybox(): void {
    GL.bindTexture(this.viewportTexture);
    GL.copyFramebufferToTexture(256, 256);
    GL.enable(GL.BLEND);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    const t = Tessellator.instance;
    t.startDrawingQuads();
    const n = 3;
    for (let i = 0; i < n; i++) {
      t.setColorRGBA_F(1, 1, 1, f(1 / (i + 1)));
      const o = f((i - Math.trunc(n / 2)) / 256);
      t.addVertexWithUV(this.width, this.height, this.zLevel, 0 + o, 0);
      t.addVertexWithUV(this.width, 0, this.zLevel, 1 + o, 0);
      t.addVertexWithUV(0, 0, this.zLevel, 1 + o, 1);
      t.addVertexWithUV(0, this.height, this.zLevel, 0 + o, 1);
    }
    t.draw();
    this.mc.renderEngine.resetBoundTexture();
  }

  private renderSkybox(pt: number): void {
    GL.viewport(0, 0, 256, 256);
    this.drawPanorama(pt);
    for (let i = 0; i < 8; i++) this.rotateAndBlurSkybox();
    GL.viewport(0, 0, this.mc.displayWidth, this.mc.displayHeight);
    const t = Tessellator.instance;
    t.startDrawingQuads();
    const k = this.width > this.height ? f(120 / this.width) : f(120 / this.height);
    const v = f(f(this.height * k) / 256);
    const u = f(f(this.width * k) / 256);
    GL.bindTexture(this.viewportTexture);
    t.setColorRGBA_F(1, 1, 1, 1);
    t.addVertexWithUV(0, this.height, this.zLevel, f(0.5 - v), f(0.5 + u));
    t.addVertexWithUV(this.width, this.height, this.zLevel, f(0.5 - v), f(0.5 - u));
    t.addVertexWithUV(this.width, 0, this.zLevel, f(0.5 + v), f(0.5 - u));
    t.addVertexWithUV(0, 0, this.zLevel, f(0.5 + v), f(0.5 + u));
    t.draw();
    this.mc.renderEngine.resetBoundTexture();
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.renderSkybox(pt);
    const logoW = 274;
    const x = Math.trunc(this.width / 2) - Math.trunc(logoW / 2);
    const y = 30;
    this.drawGradientRect(0, 0, this.width, this.height, -2130706433, 0xffffff);
    this.drawGradientRect(0, 0, this.width, this.height, 0, -2147483648);
    this.mc.renderEngine.bindTexture('/title/mclogo.png');
    GL.color(1, 1, 1, 1);
    if (this.updateCounter < 1.0e-4) {
      this.drawTexturedModalRect(x + 0, y + 0, 0, 0, 99, 44);
      this.drawTexturedModalRect(x + 99, y + 0, 129, 0, 27, 44);
      this.drawTexturedModalRect(x + 99 + 26, y + 0, 126, 0, 3, 44);
      this.drawTexturedModalRect(x + 99 + 26 + 3, y + 0, 99, 0, 26, 44);
      this.drawTexturedModalRect(x + 155, y + 0, 0, 45, 155, 44);
    } else {
      this.drawTexturedModalRect(x + 0, y + 0, 0, 0, 155, 44);
      this.drawTexturedModalRect(x + 155, y + 0, 0, 45, 155, 44);
    }
    GL.pushMatrix();
    GL.translate(Math.trunc(this.width / 2) + 90, 70, 0);
    GL.rotate(-20, 0, 0, 1);
    let s = f(f(1.8) - MathHelper.abs(f(MathHelper.sin(f(f(f((Date.now() % 1000) / 1000) * f(Math.PI)) * 2)) * f(0.1))));
    s = f(f(s * 100) / (this.fontRenderer.getStringWidth(this.splashText) + 32));
    GL.scale(s, s, s);
    this.drawCenteredString(this.fontRenderer, this.splashText, 0, -8, 0xffff00);
    GL.popMatrix();
    this.drawString(this.fontRenderer, 'Minecraft 1.5.2', 2, this.height - 10, 0xffffff);
    const c = 'Copyright Mojang AB. Do not distribute!';
    this.drawString(this.fontRenderer, c, this.width - this.fontRenderer.getStringWidth(c) - 2, this.height - 10, 0xffffff);
    super.drawScreen(mx, my, pt);
  }
}
