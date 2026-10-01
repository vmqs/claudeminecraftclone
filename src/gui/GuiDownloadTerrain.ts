import { I18n } from '../core/I18n';
import { GuiScreen } from './GuiScreen';

/**
 * GuiDownloadTerrain: shown after the world is created until the area around the player
 * is loaded and meshed (the original waited for the server's first position packet).
 */
export class GuiDownloadTerrain extends GuiScreen {
  constructor(private readonly isTerrainReady: () => boolean) {
    super();
  }

  protected override keyTyped(): void {}

  override initGui(): void {
    this.buttonList = [];
  }

  override updateScreen(): void {
    if (this.isTerrainReady()) this.mc.displayGuiScreen(null);
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.drawBackground(0);
    this.drawCenteredString(this.fontRenderer, I18n.translateToLocal('multiplayer.downloadingTerrain'), Math.trunc(this.width / 2), Math.trunc(this.height / 2) - 50, 0xffffff);
    super.drawScreen(mx, my, pt);
  }

  override doesGuiPauseGame(): boolean {
    return false;
  }
}
