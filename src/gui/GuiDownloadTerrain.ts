import { I18n } from '../core/I18n';
import { GuiScreen } from './GuiScreen';

/**
 * GuiDownloadTerrain: shown after the world is created until the area around the player
 * is loaded and meshed (the original waited for the server's first position packet).
 */
export class GuiDownloadTerrain extends GuiScreen {
  /** The opaque dirt background hides the world, so the world is not drawn behind it. */
  readonly coversWorld = true;

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

/** Whether a screen draws an opaque background over the whole world (see `coversWorld`). */
export function screenCoversWorld(screen: GuiScreen | null): boolean {
  return (screen as { coversWorld?: boolean } | null)?.coversWorld === true;
}
