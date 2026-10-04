import { I18n } from '../../core/I18n';
import type { InventoryPlayer } from '../../entity/InventoryPlayer';
import { GL } from '../../render/gl/GL';
import type { TileEntityBrewingStand } from '../../world/tileentity/TileEntityBrewingStand';
import { ContainerBrewingStand } from './ContainerBrewingStand';
import { GuiContainer } from './GuiContainer';
import { inventoryTitle } from './PlayerSlots';

/** Bubble heights by animation step (brew time / 2 mod 7). */
const BUBBLES = [29, 24, 20, 16, 11, 6, 0];

/** The brewing stand screen (GuiBrewingStand, alchemy.png): the arrow grows over the 400 brew ticks, bubbles rise. */
export class GuiBrewingStand extends GuiContainer {
  constructor(
    inv: InventoryPlayer,
    private readonly stand: TileEntityBrewingStand,
  ) {
    super(new ContainerBrewingStand(inv, stand));
  }

  protected override drawGuiContainerForegroundLayer(): void {
    const title = inventoryTitle(this.stand, (k) => I18n.translateToLocal(k));
    this.fontRenderer.drawString(title, Math.trunc(this.xSize / 2) - Math.trunc(this.fontRenderer.getStringWidth(title) / 2), 6, 0x404040);
    this.fontRenderer.drawString(I18n.translateToLocal('container.inventory'), 8, this.ySize - 96 + 2, 0x404040);
  }

  protected drawGuiContainerBackgroundLayer(): void {
    GL.color(1, 1, 1, 1);
    this.mc.renderEngine.bindTexture('/gui/alchemy.png');
    const x = Math.trunc((this.width - this.xSize) / 2);
    const y = Math.trunc((this.height - this.ySize) / 2);
    this.drawTexturedModalRect(x, y, 0, 0, this.xSize, this.ySize);
    const t = this.stand.getBrewTime();
    if (t > 0) {
      const arrow = Math.trunc(Math.fround(28 * Math.fround(1 - Math.fround(t / 400))));
      if (arrow > 0) this.drawTexturedModalRect(x + 97, y + 16, 176, 0, 9, arrow);
      const bubbles = BUBBLES[Math.trunc(t / 2) % 7];
      if (bubbles > 0) this.drawTexturedModalRect(x + 65, y + 14 + 29 - bubbles, 185, 29 - bubbles, 12, bubbles);
    }
  }
}
