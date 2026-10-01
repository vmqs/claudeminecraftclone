import { Keys } from '../client/Keyboard';
import { FontRenderer } from './FontRenderer';
import { Gui } from './Gui';
import { GuiScreen } from './GuiScreen';

/** Single-line text input (GuiTextField): typing, backspace/delete, home/end, cursor keys, paste. */
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
    this.setCursorPosition(this.text.length);
  }

  getText(): string {
    return this.text;
  }

  setMaxStringLength(n: number): void {
    this.maxStringLength = n;
    if (this.text.length > n) this.text = this.text.slice(0, n);
  }

  getMaxStringLength(): number {
    return this.maxStringLength;
  }

  writeText(s: string): void {
    const filtered = [...s].filter((c) => FontRenderer.allowedCharacters.includes(c) || (c > ' ' && c !== '§')).join('');
    const room = this.maxStringLength - this.text.length;
    const ins = filtered.slice(0, Math.max(0, room));
    this.text = this.text.slice(0, this.cursorPosition) + ins + this.text.slice(this.cursorPosition);
    this.setCursorPosition(this.cursorPosition + ins.length);
  }

  private deleteFromCursor(n: number): void {
    if (this.text.length === 0) return;
    const a = n < 0 ? this.cursorPosition + n : this.cursorPosition;
    const b = n < 0 ? this.cursorPosition : this.cursorPosition + n;
    if (a < 0 || b > this.text.length) return;
    this.text = this.text.slice(0, a) + this.text.slice(b);
    if (n < 0) this.setCursorPosition(a);
  }

  setCursorPosition(p: number): void {
    this.cursorPosition = Math.max(0, Math.min(this.text.length, p));
    if (this.lineScrollOffset > this.text.length) this.lineScrollOffset = this.text.length;
    const w = this.getWidth();
    const visible = this.fontRenderer.trimStringToWidth(this.text.slice(this.lineScrollOffset), w);
    const end = visible.length + this.lineScrollOffset;
    if (this.cursorPosition === this.lineScrollOffset) this.lineScrollOffset -= this.fontRenderer.trimStringToWidth(this.text, w, true).length;
    if (this.cursorPosition > end) this.lineScrollOffset += this.cursorPosition - end;
    else if (this.cursorPosition <= this.lineScrollOffset) this.lineScrollOffset -= this.lineScrollOffset - this.cursorPosition;
    this.lineScrollOffset = Math.max(0, Math.min(this.text.length, this.lineScrollOffset));
  }

  textboxKeyTyped(ch: string, key: number): boolean {
    if (!this.isEnabled || !this.isFocused) return false;
    if (GuiScreen.isCtrlKeyDown() && key === Keys.V) {
      this.writeText(GuiScreen.getClipboardString());
      return true;
    }
    switch (key) {
      case Keys.BACK:
        this.deleteFromCursor(-1);
        return true;
      case Keys.HOME:
        this.setCursorPosition(0);
        return true;
      case Keys.LEFT:
        this.setCursorPosition(this.cursorPosition - 1);
        return true;
      case Keys.RIGHT:
        this.setCursorPosition(this.cursorPosition + 1);
        return true;
      case Keys.END:
        this.setCursorPosition(this.text.length);
        return true;
      case Keys.DELETE:
        this.deleteFromCursor(1);
        return true;
      default:
        if (ch.length === 1 && ch !== '\0' && ch !== '§' && (FontRenderer.allowedCharacters.includes(ch) || ch > ' ')) {
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
  }

  getWidth(): number {
    return this.enableBackgroundDrawing ? this.width - 8 : this.width;
  }

  setFocused(v: boolean): void {
    if (v && !this.isFocused) this.cursorCounter = 0;
    this.isFocused = v;
  }

  setEnabled(v: boolean): void {
    this.isEnabled = v;
  }

  setVisible(v: boolean): void {
    this.visible = v;
  }
}
