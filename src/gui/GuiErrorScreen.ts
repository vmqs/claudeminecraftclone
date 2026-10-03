import { I18n } from '../core/I18n';
import { GuiButton } from './GuiButton';
import { GuiScreen } from './GuiScreen';

/**
 * GuiErrorScreen: two centred lines on the red-brown gradient and Cancel. Here it reports save
 * problems (a world that cannot be opened, imported or written); a long second line wraps.
 * Cancel goes back to `parent` (the title screen when null, as displayGuiScreen(null) does
 * without a world).
 */
export class GuiErrorScreen extends GuiScreen {
  private lines: string[] = [];

  constructor(
    private readonly message1: string,
    private readonly message2: string,
    private readonly parent: GuiScreen | null = null,
  ) {
    super();
  }

  override initGui(): void {
    super.initGui();
    this.buttonList.push(new GuiButton(0, Math.trunc(this.width / 2) - 100, 140, I18n.translateToLocal('gui.cancel')));
    this.lines = this.fontRenderer.listFormattedStringToWidth(this.message2, this.width - 40);
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.drawGradientRect(0, 0, this.width, this.height, -12574688, -11530224);
    const cx = Math.trunc(this.width / 2);
    this.drawCenteredString(this.fontRenderer, this.message1, cx, 90, 0xffffff);
    let y = 110;
    for (const l of this.lines.slice(0, 2)) {
      this.drawCenteredString(this.fontRenderer, l, cx, y, 0xffffff);
      y += this.fontRenderer.FONT_HEIGHT + 1;
    }
    super.drawScreen(mx, my, pt);
  }

  protected override keyTyped(): void {}

  protected override actionPerformed(_b: GuiButton): void {
    this.mc.displayGuiScreen(this.parent);
  }
}
