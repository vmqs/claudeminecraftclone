import { I18n } from '../core/I18n';
import type { GuiButton } from './GuiButton';
import { GuiSmallButton } from './GuiButton';
import { GuiScreen } from './GuiScreen';

/**
 * A two-line question with two buttons (GuiYesNo). The parent's confirmClicked receives
 * whether the first button was pressed and the id given here.
 */
export class GuiYesNo extends GuiScreen {
  protected buttonText1: string;
  protected buttonText2: string;

  constructor(
    protected readonly parentScreen: GuiScreen,
    protected message1: string,
    private readonly message2: string,
    buttonText1OrId: string | number,
    buttonText2?: string,
    protected worldNumber = 0,
  ) {
    super();
    if (typeof buttonText1OrId === 'number') {
      this.worldNumber = buttonText1OrId;
      this.buttonText1 = I18n.translateToLocal('gui.yes');
      this.buttonText2 = I18n.translateToLocal('gui.no');
    } else {
      this.buttonText1 = buttonText1OrId;
      this.buttonText2 = buttonText2 ?? I18n.translateToLocal('gui.no');
    }
  }

  override initGui(): void {
    const cx = Math.trunc(this.width / 2);
    const y = Math.trunc(this.height / 6) + 96;
    this.buttonList.push(new GuiSmallButton(0, cx - 155, y, null, this.buttonText1));
    this.buttonList.push(new GuiSmallButton(1, cx - 155 + 160, y, null, this.buttonText2));
  }

  protected override actionPerformed(b: GuiButton): void {
    this.parentScreen.confirmClicked(b.id === 0, this.worldNumber);
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.drawDefaultBackground();
    const cx = Math.trunc(this.width / 2);
    this.drawCenteredString(this.fontRenderer, this.message1, cx, 70, 0xffffff);
    this.drawCenteredString(this.fontRenderer, this.message2, cx, 90, 0xffffff);
    super.drawScreen(mx, my, pt);
  }
}
