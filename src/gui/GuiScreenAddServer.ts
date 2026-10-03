import { Keyboard } from '../client/Keyboard';
import { I18n } from '../core/I18n';
import { GuiButton } from './GuiButton';
import type { ServerData } from './GuiMultiplayer';
import { GuiScreen } from './GuiScreen';
import { GuiTextField } from './GuiTextField';
import { javaSplitColon } from '../net/connect/ServerAddress';

/** "Edit Server Info" (GuiScreenAddServer): name, address and the hide-address toggle. */
export class GuiScreenAddServer extends GuiScreen {
  private serverAddress!: GuiTextField;
  private serverName!: GuiTextField;

  constructor(
    private readonly parentGui: GuiScreen,
    private readonly newServerData: ServerData,
  ) {
    super();
  }

  override updateScreen(): void {
    this.serverName.updateCursorCounter();
    this.serverAddress.updateCursorCounter();
  }

  private hideLabel(): string {
    const t = (k: string) => I18n.translateToLocal(k);
    return t('addServer.hideAddress') + ': ' + (this.newServerData.isHidingAddress() ? t('gui.yes') : t('gui.no'));
  }

  override initGui(): void {
    const t = (k: string) => I18n.translateToLocal(k);
    Keyboard.enableRepeatEvents(true);
    this.buttonList = [];
    const cx = Math.trunc(this.width / 2);
    const h4 = Math.trunc(this.height / 4);
    this.buttonList.push(new GuiButton(0, cx - 100, h4 + 96 + 12, t('addServer.add')));
    this.buttonList.push(new GuiButton(1, cx - 100, h4 + 120 + 12, t('gui.cancel')));
    this.buttonList.push(new GuiButton(2, cx - 100, 142, this.hideLabel()));
    this.serverName = new GuiTextField(this.fontRenderer, cx - 100, 66, 200, 20);
    this.serverName.setFocused(true);
    this.serverName.setText(this.newServerData.serverName);
    this.serverAddress = new GuiTextField(this.fontRenderer, cx - 100, 106, 200, 20);
    this.serverAddress.setMaxStringLength(128);
    this.serverAddress.setText(this.newServerData.serverIP);
    this.updateAddButton();
  }

  private updateAddButton(): void {
    this.buttonList[0].enabled = this.serverAddress.getText().length > 0 && javaSplitColon(this.serverAddress.getText()).length > 0 && this.serverName.getText().length > 0;
  }

  override onGuiClosed(): void {
    Keyboard.enableRepeatEvents(false);
  }

  protected override actionPerformed(b: GuiButton): void {
    if (!b.enabled) return;
    if (b.id === 1) this.parentGui.confirmClicked(false, 0);
    else if (b.id === 0) {
      this.newServerData.serverName = this.serverName.getText();
      this.newServerData.serverIP = this.serverAddress.getText();
      this.parentGui.confirmClicked(true, 0);
    } else if (b.id === 2) {
      this.newServerData.setHideAddress(!this.newServerData.isHidingAddress());
      this.buttonList[2].displayString = this.hideLabel();
    }
  }

  protected override keyTyped(ch: string, key: number): void {
    this.serverName.textboxKeyTyped(ch, key);
    this.serverAddress.textboxKeyTyped(ch, key);
    if (ch === '\t') {
      const nameFocused = this.serverName.isFocused;
      this.serverName.setFocused(!nameFocused);
      this.serverAddress.setFocused(nameFocused);
    }
    if (ch === '\r') this.actionPerformed(this.buttonList[0]);
    this.updateAddButton();
  }

  protected override mouseClicked(x: number, y: number, button: number): void {
    super.mouseClicked(x, y, button);
    this.serverAddress.mouseClicked(x, y, button);
    this.serverName.mouseClicked(x, y, button);
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    const t = (k: string) => I18n.translateToLocal(k);
    const cx = Math.trunc(this.width / 2);
    this.drawDefaultBackground();
    this.drawCenteredString(this.fontRenderer, t('addServer.title'), cx, 17, 0xffffff);
    this.drawString(this.fontRenderer, t('addServer.enterName'), cx - 100, 53, 0xa0a0a0);
    this.drawString(this.fontRenderer, t('addServer.enterIp'), cx - 100, 94, 0xa0a0a0);
    this.serverName.drawTextBox();
    this.serverAddress.drawTextBox();
    super.drawScreen(mx, my, pt);
  }
}
