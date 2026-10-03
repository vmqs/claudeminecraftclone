import { I18n } from '../core/I18n';
import { GuiButton } from './GuiButton';
import { GuiScreen } from './GuiScreen';

/** A failed connection or a kick (GuiDisconnected): title, wrapped reason and "Back to title screen". */
export class GuiDisconnected extends GuiScreen {
  private readonly errorMessage: string;
  private lines: string[] = [];
  private readonly args: unknown[] | null;

  constructor(
    private readonly parent: GuiScreen,
    messageKey: string,
    private readonly errorDetail: string,
    ...args: unknown[]
  ) {
    super();
    this.errorMessage = I18n.translateToLocal(messageKey);
    this.args = args.length > 0 ? args : null;
  }

  protected override keyTyped(): void {}

  override initGui(): void {
    this.buttonList = [];
    this.buttonList.push(new GuiButton(0, Math.trunc(this.width / 2) - 100, Math.trunc(this.height / 4) + 120 + 12, I18n.translateToLocal('gui.toMenu')));
    const text = this.args ? I18n.translateToLocalFormatted(this.errorDetail, ...this.args) : I18n.translateToLocal(this.errorDetail);
    this.lines = this.fontRenderer.listFormattedStringToWidth(text, this.width - 50);
  }

  protected override actionPerformed(b: GuiButton): void {
    if (b.id === 0) this.mc.displayGuiScreen(this.parent);
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.drawDefaultBackground();
    const cx = Math.trunc(this.width / 2);
    this.drawCenteredString(this.fontRenderer, this.errorMessage, cx, Math.trunc(this.height / 2) - 50, 0xaaaaaa);
    let y = Math.trunc(this.height / 2) - 30;
    for (const l of this.lines) {
      this.drawCenteredString(this.fontRenderer, l, cx, y, 0xffffff);
      y += this.fontRenderer.FONT_HEIGHT;
    }
    super.drawScreen(mx, my, pt);
  }
}
