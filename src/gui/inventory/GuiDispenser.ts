import { I18n } from '../../core/I18n';
import type { InventoryPlayer } from '../../entity/InventoryPlayer';
import { GL } from '../../render/gl/GL';
import { ContainerDispenser } from './ContainerDispenser';
import { GuiContainer } from './GuiContainer';
import type { IInventory } from './IInventory';
import { inventoryTitle } from './PlayerSlots';

/** The dispenser / dropper screen (GuiDispenser, trap.png). */
export class GuiDispenser extends GuiContainer {
  constructor(
    inv: InventoryPlayer,
    private readonly dispenser: IInventory,
  ) {
    super(new ContainerDispenser(inv, dispenser));
  }

  protected override drawGuiContainerForegroundLayer(): void {
    const title = inventoryTitle(this.dispenser, (k) => I18n.translateToLocal(k));
    this.fontRenderer.drawString(title, Math.trunc(this.xSize / 2) - Math.trunc(this.fontRenderer.getStringWidth(title) / 2), 6, 0x404040);
    this.fontRenderer.drawString(I18n.translateToLocal('container.inventory'), 8, this.ySize - 96 + 2, 0x404040);
  }

  protected drawGuiContainerBackgroundLayer(): void {
    GL.color(1, 1, 1, 1);
    this.mc.renderEngine.bindTexture('/gui/trap.png');
    this.drawTexturedModalRect(Math.trunc((this.width - this.xSize) / 2), Math.trunc((this.height - this.ySize) / 2), 0, 0, this.xSize, this.ySize);
  }
}
