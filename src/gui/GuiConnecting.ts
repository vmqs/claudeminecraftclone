import type { Minecraft } from '../client/Minecraft';
import { I18n } from '../core/I18n';
import { GuiButton } from './GuiButton';
import { GuiDisconnected } from './GuiDisconnected';
import type { ServerData } from './GuiMultiplayer';
import { GuiScreen } from './GuiScreen';

/**
 * "Connecting to the server..." (GuiConnecting). A web page cannot open the game's TCP
 * connection, so after a moment this ends the way a refused connection did in the original.
 */
export class GuiConnecting extends GuiScreen {
  private cancelled = false;
  private ticks = 0;

  constructor(
    private readonly previousScreen: GuiScreen,
    mc: Minecraft,
    readonly serverData: ServerData,
  ) {
    super();
    this.mc = mc;
    mc.loadWorld(null);
  }

  override updateScreen(): void {
    if (this.cancelled) return;
    if (++this.ticks === 20) {
      this.mc.displayGuiScreen(new GuiDisconnected(this.previousScreen, 'connect.failed', 'disconnect.genericReason', 'Connection refused: connect'));
    }
  }

  protected override keyTyped(): void {}

  override initGui(): void {
    this.buttonList = [];
    this.buttonList.push(new GuiButton(0, Math.trunc(this.width / 2) - 100, Math.trunc(this.height / 4) + 120 + 12, I18n.translateToLocal('gui.cancel')));
  }

  protected override actionPerformed(b: GuiButton): void {
    if (b.id === 0) {
      this.cancelled = true;
      this.mc.displayGuiScreen(this.previousScreen);
    }
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.drawDefaultBackground();
    const cx = Math.trunc(this.width / 2);
    this.drawCenteredString(this.fontRenderer, I18n.translateToLocal('connect.connecting'), cx, Math.trunc(this.height / 2) - 50, 0xffffff);
    this.drawCenteredString(this.fontRenderer, '', cx, Math.trunc(this.height / 2) - 10, 0xffffff);
    super.drawScreen(mx, my, pt);
  }
}
