import { I18n } from '../../core/I18n';
import type { InventoryPlayer } from '../../entity/InventoryPlayer';
import { GL } from '../../render/gl/GL';
import type { World } from '../../world/World';
import { ContainerWorkbench } from './ContainerWorkbench';
import { GuiContainer } from './GuiContainer';

/** The crafting table screen (GuiCrafting). */
export class GuiCrafting extends GuiContainer {
  constructor(inv: InventoryPlayer, world: World, x: number, y: number, z: number) {
    super(new ContainerWorkbench(inv, world, x, y, z));
  }

  protected override drawGuiContainerForegroundLayer(): void {
    this.fontRenderer.drawString(I18n.translateToLocal('container.crafting'), 28, 6, 0x404040);
    this.fontRenderer.drawString(I18n.translateToLocal('container.inventory'), 8, this.ySize - 96 + 2, 0x404040);
  }

  protected drawGuiContainerBackgroundLayer(): void {
    GL.color(1, 1, 1, 1);
    this.mc.renderEngine.bindTexture('/gui/crafting.png');
    this.drawTexturedModalRect(this.guiLeft, this.guiTop, 0, 0, this.xSize, this.ySize);
  }
}
