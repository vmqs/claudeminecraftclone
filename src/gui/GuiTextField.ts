import { Keys } from '../client/Keyboard';
import { GL } from '../render/gl/GL';
import { Tessellator } from '../render/gl/Tessellator';
import { FontRenderer } from './FontRenderer';
import { Gui } from './Gui';
import { GuiScreen } from './GuiScreen';

/** ChatAllowedCharacters.isAllowedCharacter: anything above space from font.txt, never '§'. */
export function isAllowedCharacter(c: string): boolean {
  return c !== '§' && (FontRenderer.allowedCharacters.includes(c) || c > ' ');
}

export function filterAllowedCharacters(s: string): string {
  let out = '';
  for (const c of s) if (isAllowedCharacter(c)) out += c;
  return out;
}

/**
 * Single-line text input (GuiTextField): a cursor plus a selection end, word jumps with Ctrl,
 * selection with Shift, and the control characters LWJGL delivers for Ctrl+A/C/V/X
 * (select all, copy, paste, cut).
 */
export class GuiTextField extends Gui {
  private text = '';
  private maxStringLength = 32;
  private cursorCounter = 0;
  private enableBackgroundDrawing = true;
  private canLoseFocus = true;
  isFocused = false;
  private isEnabled = true;
  private lineScrollOffset = 0;
  private cursorPosition = 0;
  /** The other end of the selection (equal to cursorPosition when nothing is selected). */
  private selectionEnd = 0;
  private enabledColor = 0xe0e0e0;
  private disabledColor = 0x707070;
  private visible = true;

  constructor(
    private readonly fontRenderer: FontRenderer,
    readonly xPos: number,
    readonly yPos: number,
    readonly width: number,
    readonly height: number,
  ) {
    super();
  }

  updateCursorCounter(): void {
    this.cursorCounter++;
  }

  setText(s: string): void {
    this.text = s.length > this.maxStringLength ? s.slice(0, this.maxStringLength) : s;
    this.setCursorPositionEnd();
  }

  getText(): string {
    return this.text;
  }

  getSelectedText(): string {
    const a = Math.min(this.cursorPosition, this.selectionEnd);
    const b = Math.max(this.cursorPosition, this.selectionEnd);
    return this.text.slice(a, b);
  }

  /** Replaces the selection (or inserts at the cursor) with the allowed characters of `s`. */
  writeText(s: string): void {
    const ins = filterAllowedCharacters(s);
    const a = Math.min(this.cursorPosition, this.selectionEnd);
    const b = Math.max(this.cursorPosition, this.selectionEnd);
    const room = this.maxStringLength - this.text.length - (a - this.selectionEnd);
    const added = ins.slice(0, Math.max(0, room));
    this.text = this.text.slice(0, a) + added + this.text.slice(b);
    this.moveCursorBy(a - this.selectionEnd + added.length);
  }

  /** Deletes whole words from the cursor (Ctrl+Backspace / Ctrl+Delete). */
  deleteWords(n: number): void {
    if (this.text.length === 0) return;
    if (this.selectionEnd !== this.cursorPosition) this.writeText('');
    else this.deleteFromCursor(this.getNthWordFromCursor(n) - this.cursorPosition);
  }

  /** Deletes `n` characters after the cursor (negative: before it), or the selection. */
  deleteFromCursor(n: number): void {
    if (this.text.length === 0) return;
    if (this.selectionEnd !== this.cursorPosition) {
      this.writeText('');
      return;
    }
    const back = n < 0;
    const a = back ? this.cursorPosition + n : this.cursorPosition;
    const b = back ? this.cursorPosition : this.cursorPosition + n;
    this.text = (a >= 0 ? this.text.slice(0, a) : '') + (b < this.text.length ? this.text.slice(b) : '');
    if (back) this.moveCursorBy(n);
  }

  getNthWordFromCursor(n: number): number {
    return this.getNthWordFromPos(n, this.cursorPosition);
  }

  /** Position `n` words away. Like 1.5.2 it always counts from the cursor, not from `_pos`. */
  getNthWordFromPos(n: number, _pos: number): number {
    return this.findWordBoundary(n, this.cursorPosition, true);
  }

  private findWordBoundary(n: number, from: number, skipSpaces: boolean): number {
    let p = from;
    for (let i = 0; i < Math.abs(n); i++) {
      if (n > 0) {
        p = this.text.indexOf(' ', p);
        if (p === -1) p = this.text.length;
        else while (skipSpaces && p < this.text.length && this.text[p] === ' ') p++;
      } else {
        while (skipSpaces && p > 0 && this.text[p - 1] === ' ') p--;
        while (p > 0 && this.text[p - 1] !== ' ') p--;
      }
    }
    return p;
  }

  /** Moves the cursor relative to the selection end and collapses the selection. */
  moveCursorBy(n: number): void {
    this.setCursorPosition(this.selectionEnd + n);
  }

  setCursorPosition(p: number): void {
    this.cursorPosition = Math.max(0, Math.min(this.text.length, p));
    this.setSelectionPos(this.cursorPosition);
  }

  setCursorPositionZero(): void {
    this.setCursorPosition(0);
  }

  setCursorPositionEnd(): void {
    this.setCursorPosition(this.text.length);
  }

  getCursorPosition(): number {
    return this.cursorPosition;
  }

  getSelectionEnd(): number {
    return this.selectionEnd;
  }

  /** Moves the selection end and scrolls so that it stays visible. */
  setSelectionPos(p: number): void {
    const len = this.text.length;
    p = Math.max(0, Math.min(len, p));
    this.selectionEnd = p;
    if (this.lineScrollOffset > len) this.lineScrollOffset = len;
    const w = this.getWidth();
    const end = this.fontRenderer.trimStringToWidth(this.text.slice(this.lineScrollOffset), w).length + this.lineScrollOffset;
    if (p === this.lineScrollOffset) this.lineScrollOffset -= this.fontRenderer.trimStringToWidth(this.text, w, true).length;
    if (p > end) this.lineScrollOffset += p - end;
    else if (p <= this.lineScrollOffset) this.lineScrollOffset = p;
    this.lineScrollOffset = Math.max(0, Math.min(len, this.lineScrollOffset));
  }

  setMaxStringLength(n: number): void {
    this.maxStringLength = n;
    if (this.text.length > n) this.text = this.text.slice(0, n);
  }

  getMaxStringLength(): number {
    return this.maxStringLength;
  }

  textboxKeyTyped(ch: string, key: number): boolean {
    if (!this.isEnabled || !this.isFocused) return false;
    const shift = GuiScreen.isShiftKeyDown();
    const ctrl = GuiScreen.isCtrlKeyDown();
    switch (ch) {
      case '\x01': // Ctrl+A
        this.setCursorPositionEnd();
        this.setSelectionPos(0);
        return true;
      case '\x03': // Ctrl+C
        GuiScreen.setClipboardString(this.getSelectedText());
        return true;
      case '\x16': // Ctrl+V
        this.writeText(GuiScreen.getClipboardString());
        return true;
      case '\x18': // Ctrl+X
        GuiScreen.setClipboardString(this.getSelectedText());
        this.writeText('');
        return true;
    }
    switch (key) {
      case Keys.BACK:
        if (ctrl) this.deleteWords(-1);
        else this.deleteFromCursor(-1);
        return true;
      case Keys.HOME:
        if (shift) this.setSelectionPos(0);
        else this.setCursorPositionZero();
        return true;
      case Keys.LEFT:
      case Keys.RIGHT: {
        const dir = key === Keys.LEFT ? -1 : 1;
        if (shift) this.setSelectionPos(ctrl ? this.getNthWordFromPos(dir, this.selectionEnd) : this.selectionEnd + dir);
        else if (ctrl) this.setCursorPosition(this.getNthWordFromCursor(dir));
        else this.moveCursorBy(dir);
        return true;
      }
      case Keys.END:
        if (shift) this.setSelectionPos(this.text.length);
        else this.setCursorPositionEnd();
        return true;
      case Keys.DELETE:
        if (ctrl) this.deleteWords(1);
        else this.deleteFromCursor(1);
        return true;
      default:
        if (ch.length === 1 && isAllowedCharacter(ch)) {
          this.writeText(ch);
          return true;
        }
        return false;
    }
  }

  mouseClicked(x: number, y: number, button: number): void {
    const inside = x >= this.xPos && x < this.xPos + this.width && y >= this.yPos && y < this.yPos + this.height;
    if (this.canLoseFocus) this.setFocused(this.isEnabled && inside);
    if (this.isFocused && button === 0) {
      let rel = x - this.xPos;
      if (this.enableBackgroundDrawing) rel -= 4;
      const visible = this.fontRenderer.trimStringToWidth(this.text.slice(this.lineScrollOffset), this.getWidth());
      this.setCursorPosition(this.fontRenderer.trimStringToWidth(visible, rel).length + this.lineScrollOffset);
    }
  }

  drawTextBox(): void {
    if (!this.visible) return;
    if (this.enableBackgroundDrawing) {
      Gui.drawRect(this.xPos - 1, this.yPos - 1, this.xPos + this.width + 1, this.yPos + this.height + 1, -6250336);
      Gui.drawRect(this.xPos, this.yPos, this.xPos + this.width, this.yPos + this.height, -16777216);
    }
    const color = this.isEnabled ? this.enabledColor : this.disabledColor;
    const cur = this.cursorPosition - this.lineScrollOffset;
    const shown = this.fontRenderer.trimStringToWidth(this.text.slice(this.lineScrollOffset), this.getWidth());
    const sel = Math.min(this.selectionEnd - this.lineScrollOffset, shown.length);
    const cursorInView = cur >= 0 && cur <= shown.length;
    const blink = this.isFocused && Math.trunc(this.cursorCounter / 6) % 2 === 0 && cursorInView;
    const x0 = this.enableBackgroundDrawing ? this.xPos + 4 : this.xPos;
    const y0 = this.enableBackgroundDrawing ? this.yPos + Math.trunc((this.height - 8) / 2) : this.yPos;
    let x = x0;
    if (shown.length > 0) x = this.fontRenderer.drawStringWithShadow(cursorInView ? shown.slice(0, cur) : shown, x0, y0, color);
    const insertMode = this.cursorPosition < this.text.length || this.text.length >= this.maxStringLength;
    let cx = x;
    if (!cursorInView) cx = cur > 0 ? x0 + this.width : x0;
    else if (insertMode) {
      cx = x - 1;
      x--;
    }
    if (shown.length > 0 && cursorInView && cur < shown.length) this.fontRenderer.drawStringWithShadow(shown.slice(cur), x, y0, color);
    if (blink) {
      if (insertMode) Gui.drawRect(cx, y0 - 1, cx + 1, y0 + 1 + this.fontRenderer.FONT_HEIGHT, -3092272);
      else this.fontRenderer.drawStringWithShadow('_', cx, y0, color);
    }
    if (sel !== cur) {
      const sx = x0 + this.fontRenderer.getStringWidth(shown.slice(0, Math.max(0, sel)));
      this.drawSelectionBox(cx, y0 - 1, sx - 1, y0 + 1 + this.fontRenderer.FONT_HEIGHT);
    }
  }

  /**
   * The selection highlight. The original draws blue with glLogicOp(GL_OR_REVERSE), which
   * turns red and green into their inverse and blue to full; WebGL has no logic ops, so two
   * blended passes produce the same colours.
   */
  private drawSelectionBox(x0: number, y0: number, x1: number, y1: number): void {
    if (x0 < x1) [x0, x1] = [x1, x0];
    if (y0 < y1) [y0, y1] = [y1, y0];
    const t = Tessellator.instance;
    const quad = () => {
      t.startDrawingQuads();
      t.addVertex(x0, y1, 0);
      t.addVertex(x1, y1, 0);
      t.addVertex(x1, y0, 0);
      t.addVertex(x0, y0, 0);
      t.draw();
    };
    GL.disable(GL.TEXTURE_2D);
    GL.enable(GL.BLEND);
    GL.blendFunc(GL.ONE_MINUS_DST_COLOR, GL.ZERO);
    GL.color(1, 1, 0, 1);
    quad();
    GL.blendFunc(GL.ONE, GL.ONE);
    GL.color(0, 0, 1, 1);
    quad();
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    GL.disable(GL.BLEND);
    GL.color(1, 1, 1, 1);
    GL.enable(GL.TEXTURE_2D);
  }

  getWidth(): number {
    return this.enableBackgroundDrawing ? this.width - 8 : this.width;
  }

  getEnableBackgroundDrawing(): boolean {
    return this.enableBackgroundDrawing;
  }

  setEnableBackgroundDrawing(v: boolean): void {
    this.enableBackgroundDrawing = v;
  }

  setTextColor(c: number): void {
    this.enabledColor = c;
  }

  setDisabledTextColour(c: number): void {
    this.disabledColor = c;
  }

  setFocused(v: boolean): void {
    if (v && !this.isFocused) this.cursorCounter = 0;
    this.isFocused = v;
  }

  setEnabled(v: boolean): void {
    this.isEnabled = v;
  }

  setCanLoseFocus(v: boolean): void {
    this.canLoseFocus = v;
  }

  getVisible(): boolean {
    return this.visible;
  }

  setVisible(v: boolean): void {
    this.visible = v;
  }
}
