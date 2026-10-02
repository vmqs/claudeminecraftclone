import { I18n } from '../../core/I18n';
import { GL } from '../../render/gl/GL';
import { ContainerChest } from './ContainerChest';
import { GuiContainer } from './GuiContainer';
import type { IInventory } from './IInventory';

function invTitle(inv: IInventory): string {
  return inv.isInvNameLocalized() ? inv.getInvName() : I18n.translateToLocal(inv.getInvName());
}

/** A chest screen (GuiChest): 1-6 rows above the player's inventory. */
export class GuiChest extends GuiContainer {
  private readonly inventoryRows: number;

  constructor(
    private readonly upperChestInventory: IInventory,
    private readonly lowerChestInventory: IInventory,
  ) {
    super(new ContainerChest(upperChestInventory, lowerChestInventory));
    this.allowUserInput = false;
    this.inventoryRows = Math.trunc(lowerChestInventory.getSizeInventory() / 9);
    this.ySize = 222 - 108 + this.inventoryRows * 18;
  }

  protected override drawGuiContainerForegroundLayer(): void {
    this.fontRenderer.drawString(invTitle(this.lowerChestInventory), 8, 6, 0x404040);
    this.fontRenderer.drawString(invTitle(this.upperChestInventory), 8, this.ySize - 96 + 2, 0x404040);
  }

  protected drawGuiContainerBackgroundLayer(): void {
    GL.color(1, 1, 1, 1);
    this.mc.renderEngine.bindTexture('/gui/container.png');
    const x = Math.trunc((this.width - this.xSize) / 2);
    const y = Math.trunc((this.height - this.ySize) / 2);
    this.drawTexturedModalRect(x, y, 0, 0, this.xSize, this.inventoryRows * 18 + 17);
    this.drawTexturedModalRect(x, y + this.inventoryRows * 18 + 17, 0, 126, this.xSize, 96);
  }
}
