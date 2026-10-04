import { Keys } from '../client/Keyboard';
import { JavaRandom } from '../core/JavaRandom';
import { GL } from '../render/gl/GL';
import { Tessellator } from '../render/gl/Tessellator';
import { GuiScreen } from './GuiScreen';

const f = Math.fround;
const WIDTH = 274;
/** The colour codes win.txt marks scrambled words with (white, obfuscated, green, aqua). */
const MARKER = '§f§k§a§b';

/** win.txt and credits.txt, read from the game's own files (not the texture pack) once. */
let texts: Promise<[string, string]> | null = null;

/**
 * The end poem and the credits after the exit portal (GuiWinGame): the logo, then win.txt
 * (PLAYERNAME replaced, the marked words scrambled as obfuscated text) and credits.txt rolling
 * up over a darkened, slowly scrolling background under the vignette, the last line stopping in
 * the middle. Escape or the end of the text respawns the player (Packet205ClientCommand 1).
 */
export class GuiWinGame extends GuiScreen {
  /** Opaque: nothing of the world shows through, so the world is not drawn behind it. */
  readonly coversWorld = true;
  private updateCounter = 0;
  private lines: string[] | null = null;
  /** field_73989_c: the height of all lines (12 each). */
  private textHeight = 0;
  private readonly scrollSpeed = f(0.5);
  private loading = false;

  override updateScreen(): void {
    if (!this.lines) return;
    this.updateCounter++;
    const end = f(f(this.textHeight + this.height + this.height + 24) / this.scrollSpeed);
    if (this.updateCounter > end) this.respawnPlayer();
  }

  protected override keyTyped(_ch: string, key: number): void {
    if (key === Keys.ESCAPE) this.respawnPlayer();
  }

  private respawnPlayer(): void {
    this.mc.displayGuiScreen(null);
    this.mc.thePlayer?.respawnPlayer();
  }

  override doesGuiPauseGame(): boolean {
    return true;
  }

  override initGui(): void {
    if (this.lines || this.loading) return;
    this.loading = true;
    texts ??= Promise.all([this.mc.resources.getText('title/win.txt', 'vanilla'), this.mc.resources.getText('title/credits.txt', 'vanilla')]).then(([w, c]) => [w ?? '', c ?? '']);
    void texts.then(([win, credits]) => this.buildLines(win, credits));
  }

  private buildLines(win: string, credits: string): void {
    const fr = this.fontRenderer;
    const name = this.mc.username;
    const lines: string[] = [];
    const rand = new JavaRandom(8124371n);
    for (let line of splitLines(win)) {
      line = line.split('PLAYERNAME').join(name);
      let at: number;
      while ((at = line.indexOf(MARKER)) >= 0) {
        line = line.substring(0, at) + '§f§k' + 'XXXXXXXX'.substring(0, rand.nextInt(4) + 3) + line.substring(at + MARKER.length);
      }
      lines.push(...fr.listFormattedStringToWidth(line, WIDTH));
      lines.push('');
    }
    for (let i = 0; i < 8; i++) lines.push('');
    for (let line of splitLines(credits)) {
      line = line.split('PLAYERNAME').join(name).split('\t').join('    ');
      lines.push(...fr.listFormattedStringToWidth(line, WIDTH));
      lines.push('');
    }
    this.textHeight = lines.length * 12;
    this.lines = lines;
  }

  /** The dirt background scrolling with the text, fading in and out. */
  private drawBackgroundLayer(pt: number): void {
    const t = Tessellator.instance;
    this.mc.renderEngine.bindTexture('%blur%/gui/background.png');
    t.startDrawingQuads();
    t.setColorRGBA_F(1, 1, 1, 1);
    const w = this.width;
    const time = f(this.updateCounter + pt);
    const v0 = f(0 - f(f(time * f(0.5)) * this.scrollSpeed));
    const v1 = f(this.height - f(f(time * f(0.5)) * this.scrollSpeed));
    const s = f(0.015625);
    let light = f(f(time - 0) * f(0.02));
    const end = f(f(this.textHeight + this.height + this.height + 24) / this.scrollSpeed);
    const fadeOut = f(f(f(end - 20) - time) * f(0.005));
    if (fadeOut < light) light = fadeOut;
    if (light > 1) light = 1;
    light = f(light * light);
    light = f(f(light * 96) / 255);
    t.setColorOpaque_F(light, light, light);
    t.addVertexWithUV(0, this.height, this.zLevel, 0, f(v0 * s));
    t.addVertexWithUV(w, this.height, this.zLevel, f(w * s), f(v0 * s));
    t.addVertexWithUV(w, 0, this.zLevel, f(w * s), f(v1 * s));
    t.addVertexWithUV(0, 0, this.zLevel, 0, f(v1 * s));
    t.draw();
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.drawBackgroundLayer(pt);
    const t = Tessellator.instance;
    const left = Math.trunc(this.width / 2) - Math.trunc(WIDTH / 2);
    const top = this.height + 50;
    const scroll = f(-f(this.updateCounter + pt) * this.scrollSpeed);
    GL.pushMatrix();
    GL.translate(0, scroll, 0);
    this.mc.renderEngine.bindTexture('/title/mclogo.png');
    GL.color(1, 1, 1, 1);
    this.drawTexturedModalRect(left, top, 0, 0, 155, 44);
    this.drawTexturedModalRect(left + 155, top, 0, 45, 155, 44);
    const lines = this.lines ?? [];
    const fr = this.fontRenderer;
    let y = top + 200;
    for (let i = 0; i < lines.length; i++) {
      if (i === lines.length - 1) {
        const over = f(f(y + scroll) - (Math.trunc(this.height / 2) - 6));
        if (over < 0) GL.translate(0, -over, 0);
      }
      if (f(f(f(y + scroll) + 12) + 8) > 0 && f(y + scroll) < this.height) {
        const line = lines[i];
        if (line.startsWith('[C]')) {
          const text = line.substring(3);
          fr.drawStringWithShadow(text, left + Math.trunc((WIDTH - fr.getStringWidth(text)) / 2), y, 0xffffff);
        } else {
          fr.fontRandom.setSeed(BigInt(i) * 4238972211n + BigInt(Math.trunc(this.updateCounter / 4)));
          fr.drawStringWithShadow(line, left, y, 0xffffff);
        }
      }
      y += 12;
    }
    GL.popMatrix();
    this.mc.renderEngine.bindTexture('%blur%/misc/vignette.png');
    GL.enable(GL.BLEND);
    GL.blendFunc(GL.ZERO, GL.ONE_MINUS_SRC_COLOR);
    t.startDrawingQuads();
    t.setColorRGBA_F(1, 1, 1, 1);
    t.addVertexWithUV(0, this.height, this.zLevel, 0, 1);
    t.addVertexWithUV(this.width, this.height, this.zLevel, 1, 1);
    t.addVertexWithUV(this.width, 0, this.zLevel, 1, 0);
    t.addVertexWithUV(0, 0, this.zLevel, 0, 0);
    t.draw();
    GL.disable(GL.BLEND);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    super.drawScreen(mx, my, pt);
  }
}

/** BufferedReader.readLine over a whole file: \n, \r\n or \r line ends, no trailing empty line. */
function splitLines(text: string): string[] {
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}
