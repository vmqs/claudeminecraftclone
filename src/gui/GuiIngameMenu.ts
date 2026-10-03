import { I18n } from '../core/I18n';
import { formatRoomCode } from '../net/RoomCode';
import { GuiButton } from './GuiButton';
import { GuiMainMenu } from './GuiMainMenu';
import { GuiOptions } from './GuiOptions';
import { GuiScreen } from './GuiScreen';
import { GuiShareToLan } from './GuiShareToLan';

/** The pause menu. */
export class GuiIngameMenu extends GuiScreen {
  private updateCounter = 0;

  override initGui(): void {
    const t = (k: string) => I18n.translateToLocal(k);
    const cx = Math.trunc(this.width / 2);
    const h4 = Math.trunc(this.height / 4);
    const off = -16;
    const quit = new GuiButton(1, cx - 100, h4 + 120 + off, t('menu.returnToMenu'));
    // Playing on someone else's game: "Disconnect" (isIntegratedServerRunning is false).
    if (!this.mc.isSingleplayer()) quit.displayString = t('menu.disconnect');
    this.buttonList.push(quit);
    this.buttonList.push(new GuiButton(4, cx - 100, h4 + 24 + off, t('menu.returnToGame')));
    this.buttonList.push(new GuiButton(0, cx - 100, h4 + 96 + off, 98, 20, t('menu.options')));
    // Achievements and Statistics are enabled in 1.5.2 singleplayer; they are out of scope here,
    // so they look the same but do nothing.
    const lan = new GuiButton(7, cx + 2, h4 + 96 + off, 98, 20, t('menu.shareToLan'));
    lan.enabled = this.mc.isSingleplayer() && this.mc.lanServer === null;
    this.buttonList.push(lan);
    this.buttonList.push(new GuiButton(5, cx - 100, h4 + 48 + off, 98, 20, t('gui.achievements')));
    this.buttonList.push(new GuiButton(6, cx + 2, h4 + 48 + off, 98, 20, t('gui.stats')));
  }

  protected override actionPerformed(b: GuiButton): void {
    switch (b.id) {
      case 0:
        this.mc.displayGuiScreen(new GuiOptions(this, this.mc.gameSettings));
        break;
      case 1:
        b.enabled = false;
        this.mc.loadWorld(null);
        this.mc.displayGuiScreen(new GuiMainMenu());
        break;
      case 7:
        if (b.enabled) this.mc.displayGuiScreen(new GuiShareToLan(this));
        break;
      case 4:
        this.mc.displayGuiScreen(null);
        this.mc.setIngameFocus();
        this.mc.sndManager.resumeAllSounds();
        break;
    }
  }

  override updateScreen(): void {
    this.updateCounter++;
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.drawDefaultBackground();
    this.drawCenteredString(this.fontRenderer, 'Game menu', Math.trunc(this.width / 2), 40, 0xffffff);
    const code = this.mc.lanServer?.code;
    if (code) this.drawCenteredString(this.fontRenderer, `§7Room code: §f${formatRoomCode(code)}`, Math.trunc(this.width / 2), 52, 0xffffff);
    super.drawScreen(mx, my, pt);
  }
}
