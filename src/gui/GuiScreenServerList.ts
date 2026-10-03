import { Keyboard, Keys } from '../client/Keyboard';
import { I18n } from '../core/I18n';
import { GuiButton } from './GuiButton';
import type { ServerData } from './GuiMultiplayer';
import { GuiScreen } from './GuiScreen';
import { GuiTextField } from './GuiTextField';
import { javaSplitColon } from '../net/connect/ServerAddress';

/**
 * "Direct Connect" (GuiScreenServerList): one server address (host[:port]), remembered as
 * lastServer; Join Server connects to it (GuiConnecting).
 */
export class GuiScreenServerList extends GuiScreen {
  private serverTextField!: GuiTextField;

  constructor(
    private readonly guiScreen: GuiScreen,
    private readonly theServerData: ServerData,
  ) {
    super();
  }

  override updateScreen(): void {
    this.serverTextField.updateCursorCounter();
  }

  override initGui(): void {
    const t = (k: string) => I18n.translateToLocal(k);
    Keyboard.enableRepeatEvents(true);
    this.buttonList = [];
    const cx = Math.trunc(this.width / 2);
    const h4 = Math.trunc(this.height / 4);
    this.buttonList.push(new GuiButton(0, cx - 100, h4 + 96 + 12, t('selectServer.select')));
    this.buttonList.push(new GuiButton(1, cx - 100, h4 + 120 + 12, t('gui.cancel')));
    this.serverTextField = new GuiTextField(this.fontRenderer, cx - 100, 116, 200, 20);
    this.serverTextField.setMaxStringLength(128);
    this.serverTextField.setFocused(true);
    this.serverTextField.setText(this.mc.gameSettings.lastServer);
    this.updateButton();
  }

  private updateButton(): void {
    const s = this.serverTextField.getText();
    this.buttonList[0].enabled = s.length > 0 && javaSplitColon(s).length > 0;
  }

  override onGuiClosed(): void {
    Keyboard.enableRepeatEvents(false);
    this.mc.gameSettings.lastServer = this.serverTextField.getText();
    this.mc.gameSettings.saveOptions();
  }

  protected override actionPerformed(b: GuiButton): void {
    if (!b.enabled) return;
    if (b.id === 1) this.guiScreen.confirmClicked(false, 0);
    else if (b.id === 0) {
      this.theServerData.serverIP = this.serverTextField.getText();
      this.guiScreen.confirmClicked(true, 0);
    }
  }

  protected override keyTyped(ch: string, key: number): void {
    if (this.serverTextField.textboxKeyTyped(ch, key)) this.updateButton();
    else if (key === Keys.RETURN) this.actionPerformed(this.buttonList[0]);
  }

  protected override mouseClicked(x: number, y: number, button: number): void {
    super.mouseClicked(x, y, button);
    this.serverTextField.mouseClicked(x, y, button);
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    const t = (k: string) => I18n.translateToLocal(k);
    const cx = Math.trunc(this.width / 2);
    this.drawDefaultBackground();
    this.drawCenteredString(this.fontRenderer, t('selectServer.direct'), cx, Math.trunc(this.height / 4) - 60 + 20, 0xffffff);
    this.drawString(this.fontRenderer, t('addServer.enterIp'), cx - 100, 100, 0xa0a0a0);
    this.serverTextField.drawTextBox();
    super.drawScreen(mx, my, pt);
  }
}
