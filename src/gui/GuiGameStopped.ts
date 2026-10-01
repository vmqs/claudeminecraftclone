import { GuiScreen } from './GuiScreen';

/**
 * Shown after "Quit Game": browsers ignore window.close() for tabs the user opened, so instead of
 * leaving a dead canvas the game says it stopped and restarts on a click.
 */
export class GuiGameStopped extends GuiScreen {
  override doesGuiPauseGame(): boolean {
    return false;
  }

  protected override keyTyped(): void {}

  protected override mouseClicked(): void {
    location.reload();
  }

  override drawScreen(): void {
    GuiScreen.drawRect(0, 0, this.width, this.height, 0xff000000);
    const cx = Math.trunc(this.width / 2);
    const cy = Math.trunc(this.height / 2);
    this.drawCenteredString(this.fontRenderer, 'Game stopped', cx, cy - 10, 0xffffff);
    this.drawCenteredString(this.fontRenderer, 'Click to restart', cx, cy + 4, 0xa0a0a0);
  }
}
