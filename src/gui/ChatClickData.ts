import type { ChatLine } from './ChatLine';
import type { FontRenderer } from './FontRenderer';
import { stripControlCodes } from './GuiNewChat';

/** What a click into the open chat hit: the word under the pointer and the URL it may be (ChatClickData). */
export class ChatClickData {
  static readonly pattern = /^(?:(https?):\/\/)?([-\w_.]{2,}\.[a-z]{2,4})(\/\S*)?$/;
  /** The line's text up to the clicked column. */
  private readonly trimmed: string;
  private readonly clickedUrl: string;

  constructor(
    fontRenderer: FontRenderer,
    private readonly line: ChatLine,
    x: number,
    readonly y: number,
  ) {
    this.trimmed = fontRenderer.trimStringToWidth(line.getChatLineString(), x);
    this.clickedUrl = this.findClickedUrl();
  }

  getClickedUrl(): string {
    return this.clickedUrl;
  }

  /** The URL of the clicked word, with http:// added when it has no scheme; null when it is not one. */
  getURI(): string | null {
    const m = ChatClickData.pattern.exec(this.clickedUrl);
    if (!m) return null;
    const s = m[1] === undefined ? 'http://' + m[0] : m[0];
    try {
      return new URL(s).href === undefined ? null : s;
    } catch {
      return null;
    }
  }

  private findClickedUrl(): string {
    const text = this.line.getChatLineString();
    const start = this.trimmed.lastIndexOf(' ', this.trimmed.length) + 1;
    let end = text.indexOf(' ', start);
    if (end < 0) end = text.length;
    return stripControlCodes(text.substring(start, end));
  }
}
