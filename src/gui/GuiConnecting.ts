import type { Minecraft } from '../client/Minecraft';
import { I18n } from '../core/I18n';
import { GuiButton } from './GuiButton';
import { GuiDisconnected } from './GuiDisconnected';
import type { ServerData } from './GuiMultiplayer';
import { GuiScreen } from './GuiScreen';

/**
 * "Connecting to the server..." (GuiConnecting): opens the connection (a server address through
 * its ServerConnector, as Direct Connect did in 1.5.2; a room code by finding the room's host),
 * then shows "Logging in..." while the handshake runs. A failure ends on the disconnect screen
 * with the reason ("Failed to connect to the server"); Cancel gives up and goes back.
 */
export class GuiConnecting extends GuiScreen {
  private cancelled = false;
  private connected = false;

  constructor(
    private readonly previousScreen: GuiScreen,
    mc: Minecraft,
    readonly serverData: ServerData,
  ) {
    super();
    this.mc = mc;
    const connected = () => {
      if (!this.cancelled) this.connected = true;
    };
    const failed = (reason: string) => {
      if (this.cancelled) return;
      this.mc.displayGuiScreen(new GuiDisconnected(this.previousScreen, 'connect.failed', 'disconnect.genericReason', reason));
    };
    if (serverData.isRoom) mc.connectToRoom(serverData.serverIP, connected, failed);
    else mc.connectToServer(serverData.serverIP, connected, failed);
  }

  protected override keyTyped(): void {}

  override initGui(): void {
    this.buttonList = [];
    this.buttonList.push(new GuiButton(0, Math.trunc(this.width / 2) - 100, Math.trunc(this.height / 4) + 120 + 12, I18n.translateToLocal('gui.cancel')));
  }

  protected override actionPerformed(b: GuiButton): void {
    if (b.id === 0) {
      this.cancelled = true;
      this.mc.cancelConnect();
      this.mc.displayGuiScreen(this.previousScreen);
    }
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.drawDefaultBackground();
    const cx = Math.trunc(this.width / 2);
    if (!this.connected) {
      this.drawCenteredString(this.fontRenderer, I18n.translateToLocal('connect.connecting'), cx, Math.trunc(this.height / 2) - 50, 0xffffff);
      this.drawCenteredString(this.fontRenderer, '', cx, Math.trunc(this.height / 2) - 10, 0xffffff);
    } else {
      this.drawCenteredString(this.fontRenderer, I18n.translateToLocal('connect.authorizing'), cx, Math.trunc(this.height / 2) - 50, 0xffffff);
      this.drawCenteredString(this.fontRenderer, '', cx, Math.trunc(this.height / 2) - 10, 0xffffff);
    }
    super.drawScreen(mx, my, pt);
  }
}
