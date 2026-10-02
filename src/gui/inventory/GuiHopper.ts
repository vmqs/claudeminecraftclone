import { I18n } from '../../core/I18n';
import type { InventoryPlayer } from '../../entity/InventoryPlayer';
import { GL } from '../../render/gl/GL';
import { ContainerHopper } from './ContainerHopper';
import { GuiContainer } from './GuiContainer';
import type { IInventory } from './IInventory';
import { inventoryTitle } from './PlayerSlots';

/** The hopper screen (GuiHopper, hopper.png, 133 high). */
export class GuiHopper extends GuiContainer {
  constructor(
    private readonly playerInv: InventoryPlayer,
    private readonly hopper: IInventory,
  ) {
    super(new ContainerHopper(playerInv, hopper));
    this.allowUserInput = false;
    this.ySize = 133;
  }

  protected override drawGuiContainerForegroundLayer(): void {
    const t = (k: string) => I18n.translateToLocal(k);
    this.fontRenderer.drawString(inventoryTitle(this.hopper, t), 8, 6, 0x404040);
    this.fontRenderer.drawString(inventoryTitle(this.playerInv, t), 8, this.ySize - 96 + 2, 0x404040);
  }

  protected drawGuiContainerBackgroundLayer(): void {
    GL.color(1, 1, 1, 1);
    this.mc.renderEngine.bindTexture('/gui/hopper.png');
    this.drawTexturedModalRect(Math.trunc((this.width - this.xSize) / 2), Math.trunc((this.height - this.ySize) / 2), 0, 0, this.xSize, this.ySize);
  }
}
