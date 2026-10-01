import { I18n } from '../core/I18n';
import { GuiButton } from './GuiButton';
import { GuiMainMenu } from './GuiMainMenu';
import { GuiOptions } from './GuiOptions';
import { GuiScreen } from './GuiScreen';

/** The pause menu. */
export class GuiIngameMenu extends GuiScreen {
  private updateCounter = 0;

  override initGui(): void {
    const t = (k: string) => I18n.translateToLocal(k);
    const cx = Math.trunc(this.width / 2);
    const h4 = Math.trunc(this.height / 4);
    const off = -16;
    this.buttonList.push(new GuiButton(1, cx - 100, h4 + 120 + off, t('menu.returnToMenu')));
    this.buttonList.push(new GuiButton(4, cx - 100, h4 + 24 + off, t('menu.returnToGame')));
    this.buttonList.push(new GuiButton(0, cx - 100, h4 + 96 + off, 98, 20, t('menu.options')));
    const lan = new GuiButton(7, cx + 2, h4 + 96 + off, 98, 20, t('menu.shareToLan'));
    lan.enabled = false;
    this.buttonList.push(lan);
    const ach = new GuiButton(5, cx - 100, h4 + 48 + off, 98, 20, t('gui.achievements'));
    const stats = new GuiButton(6, cx + 2, h4 + 48 + off, 98, 20, t('gui.stats'));
    ach.enabled = false;
    stats.enabled = false;
    this.buttonList.push(ach, stats);
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
    super.drawScreen(mx, my, pt);
  }
}
