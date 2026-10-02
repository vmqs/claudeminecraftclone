import { I18n } from '../core/I18n';
import { GL } from '../render/gl/GL';
import { GuiButton } from './GuiButton';
import { GuiDisconnected } from './GuiDisconnected';
import { GuiMainMenu } from './GuiMainMenu';
import { GuiMultiplayer } from './GuiMultiplayer';
import { GuiScreen } from './GuiScreen';
import { SaveFormatMemory } from '../world/storage/SaveFormatMemory';

/** "You died!" with the score, Respawn and Title screen (GuiGameOver); buttons wake after a second. */
export class GuiGameOver extends GuiScreen {
  private cooldownTimer = 0;

  override initGui(): void {
    this.buttonList = [];
    const cx = Math.trunc(this.width / 2);
    const top = Math.trunc(this.height / 4);
    if (this.isHardcore()) {
      this.buttonList.push(new GuiButton(1, cx - 100, top + 96, I18n.translateToLocal('deathScreen.deleteWorld')));
    } else {
      this.buttonList.push(new GuiButton(1, cx - 100, top + 72, I18n.translateToLocal('deathScreen.respawn')));
      this.buttonList.push(new GuiButton(2, cx - 100, top + 96, I18n.translateToLocal('deathScreen.titleScreen')));
    }
    for (const b of this.buttonList) b.enabled = false;
  }

  private isHardcore(): boolean {
    return this.mc.theWorld?.worldInfo.hardcore ?? false;
  }

  protected override keyTyped(): void {}

  protected override actionPerformed(b: GuiButton): void {
    if (b.id === 1 && this.isHardcore()) {
      // The respawn request makes the integrated server kick its owner ("Game over, man") and
      // delete the world (deleteWorldAndStopServer); the kick lands on GuiDisconnected, whose
      // button leads to the multiplayer screen, as in 1.5.2.
      const folder = SaveFormatMemory.instance.currentFolder;
      this.mc.loadWorld(null);
      if (folder !== null) SaveFormatMemory.instance.deleteWorldDirectory(folder);
      this.mc.displayGuiScreen(new GuiDisconnected(new GuiMultiplayer(new GuiMainMenu()), 'disconnect.disconnected', 'disconnect.genericReason', "You have died. Game over, man, it's game over!"));
    } else if (b.id === 1) {
      this.mc.thePlayer!.respawnPlayer();
      this.mc.displayGuiScreen(null);
    } else if (b.id === 2) {
      this.mc.loadWorld(null);
      this.mc.displayGuiScreen(new GuiMainMenu());
    }
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.drawGradientRect(0, 0, this.width, this.height, 1615855616, -1602211792);
    GL.pushMatrix();
    GL.scale(2, 2, 2);
    const hardcore = this.isHardcore();
    this.drawCenteredString(this.fontRenderer, I18n.translateToLocal(hardcore ? 'deathScreen.title.hardcore' : 'deathScreen.title'), Math.trunc(Math.trunc(this.width / 2) / 2), 30, 0xffffff);
    GL.popMatrix();
    if (hardcore) this.drawCenteredString(this.fontRenderer, I18n.translateToLocal('deathScreen.hardcoreInfo'), Math.trunc(this.width / 2), 144, 0xffffff);
    const score = I18n.translateToLocal('deathScreen.score') + ': §e' + this.mc.thePlayer!.getScore();
    this.drawCenteredString(this.fontRenderer, score, Math.trunc(this.width / 2), 100, 0xffffff);
    super.drawScreen(mx, my, pt);
  }

  override doesGuiPauseGame(): boolean {
    return false;
  }

  override updateScreen(): void {
    super.updateScreen();
    if (++this.cooldownTimer === 20) for (const b of this.buttonList) b.enabled = true;
  }
}
