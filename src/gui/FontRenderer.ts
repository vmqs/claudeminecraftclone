import type { ResourceManager } from '../assets/ResourceManager';
import { JavaRandom } from '../core/JavaRandom';
import { GL } from '../render/gl/GL';
import { Tessellator } from '../render/gl/Tessellator';
import type { TextureManager } from '../render/texture/TextureManager';

const f = Math.fround;

/**
 * The bitmap font (FontRenderer). Glyph widths come from the vanilla 128x128 font exactly as
 * the original measured them; the texture itself comes from the selected pack, so HD fonts
 * draw at the same layout. Characters outside font.txt use the unicode glyph pages.
 */
export class FontRenderer {
  private readonly charWidth = new Int32Array(256);
  readonly FONT_HEIGHT = 9;
  readonly fontRandom = new JavaRandom();
  private glyphWidth = new Uint8Array(65536);
  private readonly colorCode = new Int32Array(32);
  private posX = 0;
  private posY = 0;
  private unicodeFlag = false;
  private red = 1;
  private green = 1;
  private blue = 1;
  private alpha = 1;
  private randomStyle = false;
  private boldStyle = false;
  private italicStyle = false;
  private underlineStyle = false;
  private strikethroughStyle = false;
  private currentTexture = '';
  private r8 = 255;
  private g8 = 255;
  private b8 = 255;
  private a8 = 255;
  static allowedCharacters = '';

  constructor(
    readonly fontTextureName: string,
    private readonly renderEngine: TextureManager,
    unicode: boolean,
  ) {
    this.unicodeFlag = unicode;
    for (let i = 0; i < 32; i++) {
      const k = ((i >> 3) & 1) * 85;
      let r = ((i >> 2) & 1) * 170 + k;
      let g = ((i >> 1) & 1) * 170 + k;
      let b = ((i >> 0) & 1) * 170 + k;
      if (i === 6) r += 85;
      if (i >= 16) {
        r = Math.trunc(r / 4);
        g = Math.trunc(g / 4);
        b = Math.trunc(b / 4);
      }
      this.colorCode[i] = ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
    }
  }

  /** Loads font.txt, glyph_sizes.bin and measures the vanilla font image. */
  async readFontData(rm: ResourceManager): Promise<void> {
    const txt = (await rm.getText('font.txt', 'vanilla')) ?? '';
    FontRenderer.allowedCharacters = txt
      .split(/\r?\n/)
      .filter((l) => !l.startsWith('#'))
      .join('');
    const bin = await rm.getArrayBuffer('font/glyph_sizes.bin', 'vanilla');
    if (bin) this.glyphWidth = new Uint8Array(bin);
    const img = await rm.getImage(this.fontTextureName.replace(/^\//, ''), 'vanilla');
    if (!img) return;
    const w = img.width;
    for (let c = 0; c < 256; c++) {
      const cx = c % 16;
      const cy = Math.trunc(c / 16);
      let col = 7;
      for (; col >= 0; col--) {
        const x = cx * 8 + col;
        let empty = true;
        for (let row = 0; row < 8 && empty; row++) {
          const i = ((cy * 8 + row) * w + x) * 4;
          if (img.data[i + 2] > 0) empty = false;
        }
        if (!empty) break;
      }
      if (c === 32) col = 2;
      this.charWidth[c] = col + 2;
    }
  }

  private bind(tex: string): void {
    if (this.currentTexture !== tex) {
      this.flush();
      this.currentTexture = tex;
    }
  }

  private flush(): void {
    const t = Tessellator.instance;
    if (t.isDrawing) {
      if (this.currentTexture) this.renderEngine.bindTexture(this.currentTexture);
      t.draw();
    }
  }

  private begin(): void {
    const t = Tessellator.instance;
    if (!t.isDrawing) t.startDrawingQuads();
  }

  private quad(x0: number, y0: number, x1: number, y1: number, u0: number, v0: number, u1: number, v1: number, slant: number): void {
    this.begin();
    const t = Tessellator.instance;
    t.setColorRGBA(this.r8, this.g8, this.b8, this.a8);
    t.addVertexWithUV(x0 + slant, y0, 0, u0, v0);
    t.addVertexWithUV(x0 - slant, y1, 0, u0, v1);
    t.addVertexWithUV(x1 - slant, y1, 0, u1, v1);
    t.addVertexWithUV(x1 + slant, y0, 0, u1, v0);
  }

  private renderCharAtPos(index: number, ch: string, italic: boolean): number {
    if (ch === ' ') return 4;
    return index > 0 && !this.unicodeFlag ? this.renderDefaultChar(index + 32, italic) : this.renderUnicodeChar(ch.charCodeAt(0), italic);
  }

  private renderDefaultChar(c: number, italic: boolean): number {
    const tx = (c % 16) * 8;
    const ty = Math.trunc(c / 16) * 8;
    const slant = italic ? 1 : 0;
    this.bind(this.fontTextureName);
    const w = f(this.charWidth[c] - f(0.01));
    const h = f(7.99);
    this.quad(this.posX, this.posY, this.posX + w, this.posY + h, tx / 128, ty / 128, (tx + w) / 128, (ty + h) / 128, slant);
    return this.charWidth[c];
  }

  private renderUnicodeChar(code: number, italic: boolean): number {
    if (this.glyphWidth[code] === 0) return 0;
    const page = Math.trunc(code / 256);
    this.bind(`/font/glyph_${page.toString(16).toUpperCase().padStart(2, '0')}.png`);
    const start = this.glyphWidth[code] >>> 4;
    const end = (this.glyphWidth[code] & 15) + 1;
    const tx = (code % 16) * 16 + start;
    const ty = Math.trunc((code & 255) / 16) * 16;
    const w = f(end - start - f(0.02));
    const slant = italic ? 1 : 0;
    this.quad(this.posX, this.posY, this.posX + w / 2, this.posY + f(7.99), tx / 256, ty / 256, (tx + w) / 256, (ty + f(15.98)) / 256, slant);
    return (end - start) / 2 + 1;
  }

  drawStringWithShadow(s: string, x: number, y: number, color: number): number {
    return this.drawString(s, x, y, color, true);
  }

  drawString(s: string, x: number, y: number, color: number, shadow = false): number {
    this.resetStyles();
    let w: number;
    if (shadow) {
      w = this.renderString(s, x + 1, y + 1, color, true);
      w = Math.max(w, this.renderString(s, x, y, color, false));
    } else {
      w = this.renderString(s, x, y, color, false);
    }
    return w;
  }

  private resetStyles(): void {
    this.randomStyle = false;
    this.boldStyle = false;
    this.italicStyle = false;
    this.underlineStyle = false;
    this.strikethroughStyle = false;
  }

  private setColor(r: number, g: number, b: number, a: number): void {
    this.r8 = Math.trunc(r * 255);
    this.g8 = Math.trunc(g * 255);
    this.b8 = Math.trunc(b * 255);
    this.a8 = Math.trunc(a * 255);
  }

  private line(x0: number, y0: number, x1: number, y1: number): void {
    this.flush();
    const t = Tessellator.instance;
    GL.disable(GL.TEXTURE_2D);
    t.startDrawingQuads();
    t.setColorRGBA(this.r8, this.g8, this.b8, this.a8);
    t.addVertex(x0, y1, 0);
    t.addVertex(x1, y1, 0);
    t.addVertex(x1, y0, 0);
    t.addVertex(x0, y0, 0);
    t.draw();
    GL.enable(GL.TEXTURE_2D);
  }

  private renderStringAtPos(s: string, shadow: boolean): void {
    const allowed = FontRenderer.allowedCharacters;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charAt(i);
      if (ch === '§' && i + 1 < s.length) {
        let code = '0123456789abcdefklmnor'.indexOf(s.charAt(i + 1).toLowerCase());
        if (code < 16) {
          this.randomStyle = this.boldStyle = this.strikethroughStyle = this.underlineStyle = this.italicStyle = false;
          if (code < 0 || code > 15) code = 15;
          if (shadow) code += 16;
          const c = this.colorCode[code];
          this.setColor((c >> 16) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255, this.alpha);
        } else if (code === 16) this.randomStyle = true;
        else if (code === 17) this.boldStyle = true;
        else if (code === 18) this.strikethroughStyle = true;
        else if (code === 19) this.underlineStyle = true;
        else if (code === 20) this.italicStyle = true;
        else if (code === 21) {
          this.randomStyle = this.boldStyle = this.strikethroughStyle = this.underlineStyle = this.italicStyle = false;
          this.setColor(this.red, this.green, this.blue, this.alpha);
        }
        i++;
        continue;
      }
      let index = allowed.indexOf(ch);
      if (this.randomStyle && index > 0) {
        let r: number;
        do {
          r = this.fontRandom.nextInt(allowed.length);
        } while (this.charWidth[index + 32] !== this.charWidth[r + 32]);
        index = r;
      }
      const off = this.unicodeFlag ? 0.5 : 1;
      const nudge = (index <= 0 || this.unicodeFlag) && shadow;
      if (nudge) {
        this.posX -= off;
        this.posY -= off;
      }
      let adv = this.renderCharAtPos(index, index > 0 ? allowed.charAt(index) : ch, this.italicStyle);
      if (nudge) {
        this.posX += off;
        this.posY += off;
      }
      if (this.boldStyle) {
        this.posX += off;
        if (nudge) {
          this.posX -= off;
          this.posY -= off;
        }
        this.renderCharAtPos(index, index > 0 ? allowed.charAt(index) : ch, this.italicStyle);
        this.posX -= off;
        if (nudge) {
          this.posX += off;
          this.posY += off;
        }
        adv++;
      }
      const half = Math.trunc(this.FONT_HEIGHT / 2);
      if (this.strikethroughStyle) this.line(this.posX, this.posY + half - 1, this.posX + adv, this.posY + half);
      if (this.underlineStyle) this.line(this.posX - 1, this.posY + this.FONT_HEIGHT - 1, this.posX + adv, this.posY + this.FONT_HEIGHT);
      this.posX += Math.trunc(adv);
    }
    this.flush();
  }

  private renderString(s: string, x: number, y: number, color: number, shadow: boolean): number {
    if (s === null || s === undefined) return 0;
    if ((color & 0xfc000000) === 0) color |= 0xff000000;
    if (shadow) color = ((color & 0xfcfcfc) >> 2) | (color & 0xff000000);
    this.red = ((color >> 16) & 255) / 255;
    this.green = ((color >> 8) & 255) / 255;
    this.blue = (color & 255) / 255;
    this.alpha = ((color >>> 24) & 255) / 255;
    this.setColor(this.red, this.green, this.blue, this.alpha);
    GL.color(1, 1, 1, 1);
    this.posX = x;
    this.posY = y;
    this.currentTexture = '';
    this.renderStringAtPos(s, shadow);
    return Math.trunc(this.posX);
  }

  getStringWidth(s: string | null): number {
    if (s === null) return 0;
    let w = 0;
    let bold = false;
    for (let i = 0; i < s.length; i++) {
      let ch = s.charAt(i);
      let cw = this.getCharWidth(ch);
      if (cw < 0 && i < s.length - 1) {
        ch = s.charAt(++i);
        if (ch === 'l' || ch === 'L') bold = true;
        else if (ch === 'r' || ch === 'R') bold = false;
        cw = 0;
      }
      w += cw;
      if (bold) w++;
    }
    return w;
  }

  getCharWidth(ch: string): number {
    if (ch === '§') return -1;
    if (ch === ' ') return 4;
    const i = FontRenderer.allowedCharacters.indexOf(ch);
    if (i >= 0 && !this.unicodeFlag) return this.charWidth[i + 32];
    const code = ch.charCodeAt(0);
    if (this.glyphWidth[code] !== 0) {
      let start = this.glyphWidth[code] >>> 4;
      let end = this.glyphWidth[code] & 15;
      if (end > 7) {
        end = 15;
        start = 0;
      }
      end++;
      return Math.trunc((end - start) / 2) + 1;
    }
    return 0;
  }

  trimStringToWidth(s: string, width: number, reverse = false): string {
    let out = '';
    let w = 0;
    const start = reverse ? s.length - 1 : 0;
    const step = reverse ? -1 : 1;
    let fmt = false;
    let bold = false;
    for (let i = start; i >= 0 && i < s.length && w < width; i += step) {
      const ch = s.charAt(i);
      const cw = this.getCharWidth(ch);
      if (fmt) {
        fmt = false;
        if (ch === 'l' || ch === 'L') bold = true;
        else if (ch === 'r' || ch === 'R') bold = false;
      } else if (cw < 0) {
        fmt = true;
      } else {
        w += cw;
        if (bold) w++;
      }
      if (w > width) break;
      out = reverse ? ch + out : out + ch;
    }
    return out;
  }

  drawSplitString(s: string, x: number, y: number, width: number, color: number): void {
    this.resetStyles();
    while (s.endsWith('\n')) s = s.slice(0, -1);
    for (const line of this.listFormattedStringToWidth(s, width)) {
      this.renderString(line, x, y, color, false);
      y += this.FONT_HEIGHT;
    }
  }

  splitStringWidth(s: string, width: number): number {
    return this.FONT_HEIGHT * this.listFormattedStringToWidth(s, width).length;
  }

  setUnicodeFlag(v: boolean): void {
    this.unicodeFlag = v;
  }

  getUnicodeFlag(): boolean {
    return this.unicodeFlag;
  }

  listFormattedStringToWidth(s: string, width: number): string[] {
    return this.wrapFormattedStringToWidth(s, width).split('\n');
  }

  private wrapFormattedStringToWidth(s: string, width: number): string {
    const n = this.sizeStringToWidth(s, width);
    if (s.length <= n) return s;
    const head = s.slice(0, n);
    const ch = s.charAt(n);
    const skip = ch === ' ' || ch === '\n';
    const rest = FontRenderer.getFormatFromString(head) + s.slice(n + (skip ? 1 : 0));
    return head + '\n' + this.wrapFormattedStringToWidth(rest, width);
  }

  private sizeStringToWidth(s: string, width: number): number {
    const len = s.length;
    let w = 0;
    let i = 0;
    let lastSpace = -1;
    let bold = false;
    for (; i < len; i++) {
      const ch = s.charAt(i);
      if (ch === '\n') {
        i--;
      } else if (ch === '§') {
        if (i < len - 1) {
          const c2 = s.charAt(++i);
          if (c2 === 'l' || c2 === 'L') bold = true;
          else if (c2 === 'r' || c2 === 'R' || FontRenderer.isFormatColor(c2)) bold = false;
        }
      } else {
        if (ch === ' ') lastSpace = i;
        w += this.getCharWidth(ch);
        if (bold) w++;
      }
      if (ch === '\n') {
        lastSpace = ++i;
        break;
      }
      if (w > width) break;
    }
    return i !== len && lastSpace !== -1 && lastSpace < i ? lastSpace : i;
  }

  private static isFormatColor(c: string): boolean {
    return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
  }

  private static isFormatSpecial(c: string): boolean {
    return (c >= 'k' && c <= 'o') || (c >= 'K' && c <= 'O') || c === 'r' || c === 'R';
  }

  static getFormatFromString(s: string): string {
    let out = '';
    let i = -1;
    while ((i = s.indexOf('§', i + 1)) !== -1) {
      if (i < s.length - 1) {
        const c = s.charAt(i + 1);
        if (FontRenderer.isFormatColor(c)) out = '§' + c;
        else if (FontRenderer.isFormatSpecial(c)) out += '§' + c;
      }
    }
    return out;
  }
}
