import { Keyboard } from '../../client/Keyboard';
import { I18n } from '../../core/I18n';
import type { InventoryPlayer } from '../../entity/InventoryPlayer';
import { ItemStack } from '../../item/ItemStack';
import { GL } from '../../render/gl/GL';
import type { World } from '../../world/World';
import { GuiScreen } from '../GuiScreen';
import { GuiTextField } from '../GuiTextField';
import { ContainerRepair } from './ContainerRepair';
import { GuiContainer } from './GuiContainer';

/**
 * The anvil screen (GuiRepair): the name field above the slots (filled with the first item's
 * name whenever it changes) and the level cost, red when too expensive or unaffordable.
 */
export class GuiRepair extends GuiContainer {
  private readonly repairContainer: ContainerRepair;
  private itemNameField!: GuiTextField;
  /** The first input as last seen, to refill the name field when it changes (ICrafting.sendSlotContents). */
  private lastInput: ItemStack | null = null;
  private seenInput = false;

  constructor(
    private readonly playerInv: InventoryPlayer,
    world: World,
    x: number,
    y: number,
    z: number,
  ) {
    const c = new ContainerRepair(playerInv, world, x, y, z, playerInv.player);
    super(c);
    this.repairContainer = c;
  }

  override initGui(): void {
    super.initGui();
    Keyboard.enableRepeatEvents(true);
    const x = Math.trunc((this.width - this.xSize) / 2);
    const y = Math.trunc((this.height - this.ySize) / 2);
    this.itemNameField = new GuiTextField(this.fontRenderer, x + 62, y + 24, 103, 12);
    this.itemNameField.setTextColor(-1);
    this.itemNameField.setDisabledTextColour(-1);
    this.itemNameField.setEnableBackgroundDrawing(false);
    this.itemNameField.setMaxStringLength(30);
    this.seenInput = false;
    this.syncInput();
  }

  override onGuiClosed(): void {
    super.onGuiClosed();
    Keyboard.enableRepeatEvents(false);
  }

  override updateScreen(): void {
    super.updateScreen();
    this.syncInput();
  }

  /** sendSlotContents(slot 0): a new first item puts its name in the field. */
  private syncInput(): void {
    const s = this.repairContainer.getSlot(0).getStack();
    if (this.seenInput && ItemStack.areItemStacksEqual(s, this.lastInput)) return;
    this.seenInput = true;
    this.lastInput = s ? s.copy() : null;
    this.itemNameField.setText(s ? s.getDisplayName() : '');
    this.itemNameField.setEnabled(s !== null);
    if (s) this.repairContainer.updateItemName(this.itemNameField.getText());
  }

  protected override drawGuiContainerForegroundLayer(): void {
    GL.disable(GL.LIGHTING);
    this.fontRenderer.drawString(I18n.translateToLocal('container.repair'), 60, 6, 0x404040);
    const cost = this.repairContainer.maximumCost;
    if (cost > 0) {
      let color = 0x80ff20;
      let show = true;
      let text = I18n.translateToLocalFormatted('container.repair.cost', cost);
      if (cost >= 40 && !this.mc.thePlayer!.capabilities.isCreativeMode) {
        text = I18n.translateToLocal('container.repair.expensive');
        color = 0xff6060;
      } else if (!this.repairContainer.getSlot(2).getHasStack()) {
        show = false;
      } else if (!this.repairContainer.getSlot(2).canTakeStack(this.playerInv.player)) {
        color = 0xff6060;
      }
      if (show) {
        const shadow = (0xff000000 | ((color & 0xfcfcfc) >> 2)) | 0;
        const tx = this.xSize - 8 - this.fontRenderer.getStringWidth(text);
        const ty = 67;
        if (this.fontRenderer.getUnicodeFlag()) {
          GuiScreen.drawRect(tx - 3, ty - 2, this.xSize - 7, ty + 10, -16777216);
          GuiScreen.drawRect(tx - 2, ty - 1, this.xSize - 8, ty + 9, -12895429);
        } else {
          this.fontRenderer.drawString(text, tx, ty + 1, shadow);
          this.fontRenderer.drawString(text, tx + 1, ty, shadow);
          this.fontRenderer.drawString(text, tx + 1, ty + 1, shadow);
        }
        this.fontRenderer.drawString(text, tx, ty, color);
      }
    }
    GL.enable(GL.LIGHTING);
  }

  protected override keyTyped(ch: string, key: number): void {
    if (this.itemNameField.textboxKeyTyped(ch, key)) this.repairContainer.updateItemName(this.itemNameField.getText());
    else super.keyTyped(ch, key);
  }

  protected override mouseClicked(x: number, y: number, button: number): void {
    super.mouseClicked(x, y, button);
    this.itemNameField.mouseClicked(x, y, button);
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    super.drawScreen(mx, my, pt);
    GL.disable(GL.LIGHTING);
    this.itemNameField.drawTextBox();
  }

  protected drawGuiContainerBackgroundLayer(): void {
    GL.color(1, 1, 1, 1);
    this.mc.renderEngine.bindTexture('/gui/repair.png');
    const x = Math.trunc((this.width - this.xSize) / 2);
    const y = Math.trunc((this.height - this.ySize) / 2);
    this.drawTexturedModalRect(x, y, 0, 0, this.xSize, this.ySize);
    const c = this.repairContainer;
    this.drawTexturedModalRect(x + 59, y + 20, 0, this.ySize + (c.getSlot(0).getHasStack() ? 0 : 16), 110, 16);
    if ((c.getSlot(0).getHasStack() || c.getSlot(1).getHasStack()) && !c.getSlot(2).getHasStack()) this.drawTexturedModalRect(x + 99, y + 45, this.xSize, 0, 28, 21);
  }
}
