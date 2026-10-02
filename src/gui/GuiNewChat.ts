import type { Minecraft } from '../client/Minecraft';
import { I18n } from '../core/I18n';
import { MathHelper } from '../core/MathHelper';
import { GL } from '../render/gl/GL';
import { ChatLine } from './ChatLine';
import { Gui } from './Gui';
import { GuiChat } from './GuiChat';

/** StringUtils.stripControlCodes */
export function stripControlCodes(s: string): string {
  return s.replace(/§[0-9a-fk-or]/gi, '');
}

/**
 * The chat lines above the hotbar (GuiNewChat): messages fade out after 10 seconds unless the
 * chat screen is open, wrap to the chat width setting, and scroll with the wheel or Page Up/Down.
 */
export class GuiNewChat extends Gui {
  private readonly sentMessages: string[] = [];
  /** Whole messages, newest first (for re-wrapping when the chat settings change). */
  private readonly chatLines: ChatLine[] = [];
  /** Wrapped lines, newest first (field_96134_d). */
  private readonly drawnChatLines: ChatLine[] = [];
  private scrollPos = 0;
  private isScrolled = false;

  constructor(private readonly mc: Minecraft) {
    super();
  }

  drawChat(updateCounter: number): void {
    const gs = this.mc.gameSettings;
    if (gs.chatVisibility === 2) return;
    const maxLines = this.getLineCount();
    const total = this.drawnChatLines.length;
    if (total === 0) return;
    const open = this.getChatOpen();
    let drawn = 0;
    const opacity = Math.fround(Math.fround(gs.chatOpacity * Math.fround(0.9)) + Math.fround(0.1));
    const scale = this.getChatScale();
    const width = MathHelper.ceiling_float_int(Math.fround(this.getChatWidth() / scale));
    GL.pushMatrix();
    GL.translate(2, 20, 0);
    GL.scale(scale, scale, 1);
    for (let i = 0; i + this.scrollPos < this.drawnChatLines.length && i < maxLines; i++) {
      const line = this.drawnChatLines[i + this.scrollPos];
      const age = updateCounter - line.getUpdatedCounter();
      if (age >= 200 && !open) continue;
      let fade = 1 - age / 200;
      fade *= 10;
      fade = Math.min(1, Math.max(0, fade));
      fade *= fade;
      let alpha = open ? 255 : Math.trunc(255 * fade);
      alpha = Math.trunc(alpha * opacity);
      drawn++;
      if (alpha <= 3) continue;
      const y = -i * 9;
      Gui.drawRect(0, y - 9, width + 4, y, (alpha >> 1) << 24);
      GL.enable(GL.BLEND);
      const text = gs.chatColours ? line.getChatLineString() : stripControlCodes(line.getChatLineString());
      this.mc.fontRenderer.drawStringWithShadow(text, 0, y - 8, (0xffffff + (alpha << 24)) | 0);
    }
    if (open) {
      const fh = this.mc.fontRenderer.FONT_HEIGHT;
      GL.translate(-3, 0, 0);
      const fullHeight = total * fh + total;
      const shownHeight = drawn * fh + drawn;
      const barY = Math.trunc((this.scrollPos * shownHeight) / total);
      const barH = Math.trunc((shownHeight * shownHeight) / fullHeight);
      if (fullHeight !== shownHeight) {
        const a = barY > 0 ? 170 : 96;
        const c = this.isScrolled ? 0xcc3333 : 0x3333aa;
        Gui.drawRect(0, -barY, 2, -barY - barH, (c + (a << 24)) | 0);
        Gui.drawRect(2, -barY, 1, -barY - barH, (0xcccccc + (a << 24)) | 0);
      }
    }
    GL.popMatrix();
  }

  clearChatMessages(): void {
    this.drawnChatLines.length = 0;
    this.chatLines.length = 0;
    this.sentMessages.length = 0;
  }

  printChatMessage(msg: string): void {
    this.printChatMessageWithOptionalDeletion(msg, 0);
  }

  /** Prints a message; a non-zero id first removes the earlier line with that id. */
  printChatMessageWithOptionalDeletion(msg: string, id: number): void {
    this.setChatLine(msg, id, this.mc.ingameGUI.getUpdateCounter(), false);
    console.info('[CHAT] ' + msg);
  }

  /** func_96129_a */
  private setChatLine(msg: string, id: number, counter: number, refreshing: boolean): void {
    const open = this.getChatOpen();
    let first = true;
    if (id !== 0) this.deleteChatLine(id);
    const wrapWidth = MathHelper.floor_float(Math.fround(this.getChatWidth() / this.getChatScale()));
    for (let part of this.mc.fontRenderer.listFormattedStringToWidth(msg, wrapWidth)) {
      if (open && this.scrollPos > 0) {
        this.isScrolled = true;
        this.scroll(1);
      }
      if (!first) part = ' ' + part;
      first = false;
      this.drawnChatLines.unshift(new ChatLine(counter, part, id));
    }
    while (this.drawnChatLines.length > 100) this.drawnChatLines.pop();
    if (!refreshing) {
      this.chatLines.unshift(new ChatLine(counter, msg.trim(), id));
      while (this.chatLines.length > 100) this.chatLines.pop();
    }
  }

  /** func_96132_b: re-wraps every message after a chat setting changed. */
  refreshChat(): void {
    this.drawnChatLines.length = 0;
    this.resetScroll();
    for (let i = this.chatLines.length - 1; i >= 0; i--) {
      const l = this.chatLines[i];
      this.setChatLine(l.getChatLineString(), l.getChatLineID(), l.getUpdatedCounter(), true);
    }
  }

  getSentMessages(): string[] {
    return this.sentMessages;
  }

  addToSentMessages(msg: string): void {
    if (this.sentMessages.length === 0 || this.sentMessages[this.sentMessages.length - 1] !== msg) this.sentMessages.push(msg);
  }

  resetScroll(): void {
    this.scrollPos = 0;
    this.isScrolled = false;
  }

  scroll(n: number): void {
    this.scrollPos += n;
    const max = this.drawnChatLines.length - this.getLineCount();
    if (this.scrollPos > max) this.scrollPos = max;
    if (this.scrollPos <= 0) {
      this.scrollPos = 0;
      this.isScrolled = false;
    }
  }

  addTranslatedMessage(key: string, ...args: unknown[]): void {
    this.printChatMessage(I18n.translateToLocalFormatted(key, ...args));
  }

  getChatOpen(): boolean {
    return this.mc.currentScreen instanceof GuiChat;
  }

  deleteChatLine(id: number): void {
    let i = this.drawnChatLines.findIndex((l) => l.getChatLineID() === id);
    if (i >= 0) {
      this.drawnChatLines.splice(i, 1);
      return;
    }
    i = this.chatLines.findIndex((l) => l.getChatLineID() === id);
    if (i >= 0) this.chatLines.splice(i, 1);
  }

  /** func_96126_f */
  getChatWidth(): number {
    return GuiNewChat.calculateChatboxWidth(this.mc.gameSettings.chatWidth);
  }

  /** func_96133_g */
  getChatHeight(): number {
    const gs = this.mc.gameSettings;
    return GuiNewChat.calculateChatboxHeight(this.getChatOpen() ? gs.chatHeightFocused : gs.chatHeightUnfocused);
  }

  /** func_96131_h */
  getChatScale(): number {
    return this.mc.gameSettings.chatScale;
  }

  /** func_96128_a: 40..320 pixels. */
  static calculateChatboxWidth(v: number): number {
    return MathHelper.floor_float(Math.fround(Math.fround(v * 280) + 40));
  }

  /** func_96130_b: 20..180 pixels. */
  static calculateChatboxHeight(v: number): number {
    return MathHelper.floor_float(Math.fround(Math.fround(v * 160) + 20));
  }

  /** func_96127_i */
  getLineCount(): number {
    return Math.trunc(this.getChatHeight() / 9);
  }
}
