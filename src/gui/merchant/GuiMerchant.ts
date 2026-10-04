import type { Minecraft } from '../../client/Minecraft';
import { I18n } from '../../core/I18n';
import type { IMerchant } from '../../entity/merchant/IMerchant';
import type { InventoryPlayer } from '../../entity/InventoryPlayer';
import { GL } from '../../render/gl/GL';
import { RenderHelper } from '../../render/RenderHelper';
import type { World } from '../../world/World';
import { GuiButton } from '../GuiButton';
import { GuiContainer } from '../inventory/GuiContainer';
import { ContainerMerchant } from './ContainerMerchant';

const TEXTURE = '/gui/trading.png';

/**
 * The 12x19 page arrows of the trading window (GuiButtonMerchant), drawn from trading.png at
 * u 176 (+12 hovered, +24 disabled); the left-pointing one is the row below.
 */
export class GuiButtonMerchant extends GuiButton {
  constructor(
    id: number,
    x: number,
    y: number,
    private readonly mirrored: boolean,
  ) {
    super(id, x, y, 12, 19, '');
  }

  override drawButtonOn(mc: Minecraft, mx: number, my: number): void {
    if (!this.drawButton) return;
    mc.renderEngine.bindTexture(TEXTURE);
    GL.color(1, 1, 1, 1);
    const hover = mx >= this.xPosition && my >= this.yPosition && mx < this.xPosition + this.width && my < this.yPosition + this.height;
    let u = 176;
    if (!this.enabled) u += this.width * 2;
    else if (hover) u += this.width;
    const v = this.mirrored ? 0 : this.height;
    this.drawTexturedModalRect(this.xPosition, this.yPosition, u, v, this.width, this.height);
  }
}

/**
 * The villager trading screen (GuiMerchant): the selected trade's price and goods across the top
 * (crossed out once used up), page arrows, the two payment slots and the result slot.
 */
export class GuiMerchant extends GuiContainer {
  private nextRecipeButton!: GuiButtonMerchant;
  private previousRecipeButton!: GuiButtonMerchant;
  private currentRecipeIndex = 0;
  private readonly title: string;

  constructor(
    inv: InventoryPlayer,
    private readonly theIMerchant: IMerchant,
    world: World,
    customName: string | null,
  ) {
    super(new ContainerMerchant(inv, theIMerchant, world));
    this.title = customName !== null && customName.length >= 1 ? customName : I18n.translateToLocal('entity.Villager.name');
  }

  override initGui(): void {
    super.initGui();
    const x = Math.trunc((this.width - this.xSize) / 2);
    const y = Math.trunc((this.height - this.ySize) / 2);
    this.buttonList.push((this.nextRecipeButton = new GuiButtonMerchant(1, x + 120 + 27, y + 24 - 1, true)));
    this.buttonList.push((this.previousRecipeButton = new GuiButtonMerchant(2, x + 36 - 19, y + 24 - 1, false)));
    this.nextRecipeButton.enabled = false;
    this.previousRecipeButton.enabled = false;
  }

  protected override drawGuiContainerForegroundLayer(): void {
    this.fontRenderer.drawString(this.title, Math.trunc(this.xSize / 2) - Math.trunc(this.fontRenderer.getStringWidth(this.title) / 2), 6, 0x404040);
    this.fontRenderer.drawString(I18n.translateToLocal('container.inventory'), 8, this.ySize - 96 + 2, 0x404040);
  }

  override updateScreen(): void {
    super.updateScreen();
    const list = this.theIMerchant.getRecipes(this.mc.thePlayer!);
    if (list) {
      this.nextRecipeButton.enabled = this.currentRecipeIndex < list.length - 1;
      this.previousRecipeButton.enabled = this.currentRecipeIndex > 0;
    }
  }

  protected override actionPerformed(b: GuiButton): void {
    let changed = false;
    if (b === this.nextRecipeButton) {
      this.currentRecipeIndex++;
      changed = true;
    } else if (b === this.previousRecipeButton) {
      this.currentRecipeIndex--;
      changed = true;
    }
    // The client and (MC|TrSel) the server container both switch page.
    if (changed) (this.inventorySlots as ContainerMerchant).setCurrentRecipeIndex(this.currentRecipeIndex);
  }

  protected drawGuiContainerBackgroundLayer(): void {
    GL.color(1, 1, 1, 1);
    this.mc.renderEngine.bindTexture(TEXTURE);
    const x = Math.trunc((this.width - this.xSize) / 2);
    const y = Math.trunc((this.height - this.ySize) / 2);
    this.drawTexturedModalRect(x, y, 0, 0, this.xSize, this.ySize);
    const list = this.theIMerchant.getRecipes(this.mc.thePlayer!);
    if (!list || list.length === 0) return;
    if (list[this.currentRecipeIndex].isRecipeDisabled()) {
      this.mc.renderEngine.bindTexture(TEXTURE);
      GL.color(1, 1, 1, 1);
      GL.disable(GL.LIGHTING);
      this.drawTexturedModalRect(this.guiLeft + 83, this.guiTop + 21, 212, 0, 28, 21);
      this.drawTexturedModalRect(this.guiLeft + 83, this.guiTop + 51, 212, 0, 28, 21);
    }
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    super.drawScreen(mx, my, pt);
    const list = this.theIMerchant.getRecipes(this.mc.thePlayer!);
    if (!list || list.length === 0) return;
    const x = Math.trunc((this.width - this.xSize) / 2);
    const y = Math.trunc((this.height - this.ySize) / 2);
    const recipe = list[this.currentRecipeIndex];
    GL.pushMatrix();
    const buy = recipe.getItemToBuy();
    const buy2 = recipe.getSecondItemToBuy();
    const sell = recipe.getItemToSell();
    RenderHelper.enableGUIStandardItemLighting();
    GL.disable(GL.LIGHTING);
    GL.enable(GL.RESCALE_NORMAL);
    GL.enable(GL.COLOR_MATERIAL);
    GL.enable(GL.LIGHTING);
    const r = GuiContainer.itemRenderer;
    const fr = this.fontRenderer;
    const engine = this.mc.renderEngine;
    r.zLevel = 100;
    r.renderItemAndEffectIntoGUI(fr, engine, buy, x + 36, y + 24);
    r.renderItemOverlayIntoGUI(fr, engine, buy, x + 36, y + 24);
    if (buy2) {
      r.renderItemAndEffectIntoGUI(fr, engine, buy2, x + 62, y + 24);
      r.renderItemOverlayIntoGUI(fr, engine, buy2, x + 62, y + 24);
    }
    r.renderItemAndEffectIntoGUI(fr, engine, sell, x + 120, y + 24);
    r.renderItemOverlayIntoGUI(fr, engine, sell, x + 120, y + 24);
    r.zLevel = 0;
    GL.disable(GL.LIGHTING);
    if (this.isPointInRegion(36, 24, 16, 16, mx, my)) this.drawItemStackTooltip(buy, mx, my);
    else if (buy2 && this.isPointInRegion(62, 24, 16, 16, mx, my)) this.drawItemStackTooltip(buy2, mx, my);
    else if (this.isPointInRegion(120, 24, 16, 16, mx, my)) this.drawItemStackTooltip(sell, mx, my);
    GL.popMatrix();
    GL.enable(GL.LIGHTING);
    GL.enable(GL.DEPTH_TEST);
    RenderHelper.enableStandardItemLighting();
  }

  getIMerchant(): IMerchant {
    return this.theIMerchant;
  }
}
