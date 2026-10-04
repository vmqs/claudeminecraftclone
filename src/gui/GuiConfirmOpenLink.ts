import { I18n } from '../core/I18n';
import { GuiButton } from './GuiButton';
import type { GuiScreen } from './GuiScreen';
import { GuiScreen as Screen } from './GuiScreen';
import { GuiYesNo } from './GuiYesNo';

/** "Are you sure you want to open the following website?" with Yes / Copy to Clipboard / No (GuiConfirmOpenLink). */
export class GuiConfirmOpenLink extends GuiYesNo {
  private readonly openLinkWarning: string;
  private readonly copyLinkButtonText: string;
  private showWarning = true;

  constructor(
    parent: GuiScreen,
    private readonly link: string,
    id: number,
    trusted: boolean,
  ) {
    super(parent, I18n.translateToLocal(trusted ? 'chat.link.confirmTrusted' : 'chat.link.confirm'), link, id);
    this.buttonText1 = I18n.translateToLocal(trusted ? 'chat.link.open' : 'gui.yes');
    this.buttonText2 = I18n.translateToLocal(trusted ? 'gui.cancel' : 'gui.no');
    this.copyLinkButtonText = I18n.translateToLocal('chat.copy');
    this.openLinkWarning = I18n.translateToLocal('chat.link.warning');
  }

  override initGui(): void {
    const x = Math.trunc(this.width / 3) - 83;
    const y = Math.trunc(this.height / 6) + 96;
    this.buttonList.push(new GuiButton(0, x, y, 100, 20, this.buttonText1));
    this.buttonList.push(new GuiButton(2, x + 105, y, 100, 20, this.copyLinkButtonText));
    this.buttonList.push(new GuiButton(1, x + 210, y, 100, 20, this.buttonText2));
  }

  protected override actionPerformed(b: GuiButton): void {
    if (b.id === 2) this.copyLinkToClipboard();
    this.parentScreen.confirmClicked(b.id === 0, this.worldNumber);
  }

  copyLinkToClipboard(): void {
    Screen.setClipboardString(this.link);
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    super.drawScreen(mx, my, pt);
    if (this.showWarning) this.drawCenteredString(this.fontRenderer, this.openLinkWarning, Math.trunc(this.width / 2), 110, 0xffcccc);
  }

  /** func_92026_h: hides the warning line (trusted links). */
  hideWarning(): void {
    this.showWarning = false;
  }
}
