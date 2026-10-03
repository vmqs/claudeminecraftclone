import { I18n } from '../../core/I18n';
import type { InventoryPlayer } from '../../entity/InventoryPlayer';
import { GL } from '../../render/gl/GL';
import type { TileEntityFurnace } from '../../world/tileentity/TileEntityFurnace';
import { ContainerFurnace } from './ContainerFurnace';
import { GuiContainer } from './GuiContainer';
import { inventoryTitle } from './PlayerSlots';

/** The furnace screen (GuiFurnace): the flame shrinks with the fuel, the arrow fills with the cook time. */
export class GuiFurnace extends GuiContainer {
  constructor(
    inv: InventoryPlayer,
    private readonly furnaceInventory: TileEntityFurnace,
  ) {
    super(new ContainerFurnace(inv, furnaceInventory));
  }

  protected override drawGuiContainerForegroundLayer(): void {
    const title = inventoryTitle(this.furnaceInventory, (k) => I18n.translateToLocal(k));
    this.fontRenderer.drawString(title, Math.trunc(this.xSize / 2) - Math.trunc(this.fontRenderer.getStringWidth(title) / 2), 6, 0x404040);
    this.fontRenderer.drawString(I18n.translateToLocal('container.inventory'), 8, this.ySize - 96 + 2, 0x404040);
  }

  protected drawGuiContainerBackgroundLayer(): void {
    GL.color(1, 1, 1, 1);
    this.mc.renderEngine.bindTexture('/gui/furnace.png');
    const x = Math.trunc((this.width - this.xSize) / 2);
    const y = Math.trunc((this.height - this.ySize) / 2);
    this.drawTexturedModalRect(x, y, 0, 0, this.xSize, this.ySize);
    const te = this.furnaceInventory;
    if (te.isBurning()) {
      const flame = te.getBurnTimeRemainingScaled(12);
      this.drawTexturedModalRect(x + 56, y + 36 + 12 - flame, 176, 12 - flame, 14, flame + 2);
    }
    const arrow = te.getCookProgressScaled(24);
    this.drawTexturedModalRect(x + 79, y + 34, 176, 14, arrow + 1, 16);
  }
}
