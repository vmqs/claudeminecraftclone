import { I18n } from '../core/I18n';
import { GuiButton } from './GuiButton';
import { GuiScreen } from './GuiScreen';

/**
 * "LAN World" (GuiShareToLan). A browser tab cannot listen for LAN players, so Start LAN World
 * reports what the integrated server said when it could not open its port.
 */
export class GuiShareToLan extends GuiScreen {
  private buttonAllowCommandsToggle!: GuiButton;
  private buttonGameMode!: GuiButton;
  private gameMode = 'survival';
  private allowCommands = false;

  constructor(private readonly parentScreen: GuiScreen) {
    super();
  }

  override initGui(): void {
    const t = (k: string) => I18n.translateToLocal(k);
    this.buttonList = [];
    const cx = Math.trunc(this.width / 2);
    this.buttonList.push(new GuiButton(101, cx - 155, this.height - 28, 150, 20, t('lanServer.start')));
    this.buttonList.push(new GuiButton(102, cx + 5, this.height - 28, 150, 20, t('gui.cancel')));
    this.buttonList.push((this.buttonGameMode = new GuiButton(104, cx - 155, 100, 150, 20, t('selectWorld.gameMode'))));
    this.buttonList.push((this.buttonAllowCommandsToggle = new GuiButton(103, cx + 5, 100, 150, 20, t('selectWorld.allowCommands'))));
    this.updateLabels();
  }

  private updateLabels(): void {
    const t = (k: string) => I18n.translateToLocal(k);
    this.buttonGameMode.displayString = t('selectWorld.gameMode') + ' ' + t('selectWorld.gameMode.' + this.gameMode);
    this.buttonAllowCommandsToggle.displayString = t('selectWorld.allowCommands') + ' ' + t(this.allowCommands ? 'options.on' : 'options.off');
  }

  protected override actionPerformed(b: GuiButton): void {
    if (b.id === 102) {
      this.mc.displayGuiScreen(this.parentScreen);
    } else if (b.id === 104) {
      this.gameMode = this.gameMode === 'survival' ? 'creative' : this.gameMode === 'creative' ? 'adventure' : 'survival';
      this.updateLabels();
    } else if (b.id === 103) {
      this.allowCommands = !this.allowCommands;
      this.updateLabels();
    } else if (b.id === 101) {
      this.mc.displayGuiScreen(null);
      this.mc.ingameGUI.getChatGUI().printChatMessage(I18n.translateToLocal('commands.publish.failed'));
    }
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.drawDefaultBackground();
    const cx = Math.trunc(this.width / 2);
    this.drawCenteredString(this.fontRenderer, I18n.translateToLocal('lanServer.title'), cx, 50, 0xffffff);
    this.drawCenteredString(this.fontRenderer, I18n.translateToLocal('lanServer.otherPlayers'), cx, 82, 0xffffff);
    super.drawScreen(mx, my, pt);
  }
}
