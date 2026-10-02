import { I18n } from '../../core/I18n';
import type { EntityPlayer } from '../../entity/EntityPlayer';
import { GL } from '../../render/gl/GL';
import { OpenGlHelper } from '../../render/OpenGlHelper';
import { RenderHelper } from '../../render/RenderHelper';
import { RenderManager } from '../../render/entity/RenderManager';
import type { Minecraft } from '../../client/Minecraft';
import { GuiContainer } from './GuiContainer';

const f = Math.fround;

/**
 * The survival inventory (GuiInventory): 2x2 crafting, armour and the player model. In
 * Creative 1.5.2 swaps it for GuiContainerCreative in initGui/updateScreen; until that
 * screen exists this one is shown. Active potion effects (InventoryEffectRenderer) are not drawn.
 */
export class GuiInventory extends GuiContainer {
  private xSizeFloat = 0;
  private ySizeFloat = 0;

  constructor(player: EntityPlayer) {
    super(player.inventoryContainer);
    this.allowUserInput = true;
  }

  override initGui(): void {
    this.buttonList = [];
    super.initGui();
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    super.drawScreen(mx, my, pt);
    this.xSizeFloat = mx;
    this.ySizeFloat = my;
  }

  protected override drawGuiContainerForegroundLayer(): void {
    this.fontRenderer.drawString(I18n.translateToLocal('container.crafting'), 86, 16, 0x404040);
  }

  protected drawGuiContainerBackgroundLayer(): void {
    GL.color(1, 1, 1, 1);
    this.mc.renderEngine.bindTexture('/gui/inventory.png');
    const x = this.guiLeft;
    const y = this.guiTop;
    this.drawTexturedModalRect(x, y, 0, 0, this.xSize, this.ySize);
    GuiInventory.drawPlayerOnGui(this.mc, x + 51, y + 75, 30, f(x + 51 - this.xSizeFloat), f(y + 75 - 50 - this.ySizeFloat));
  }

  /** The player model at (x, y) with the given scale, looking towards the mouse offset (dx, dy). */
  static drawPlayerOnGui(mc: Minecraft, x: number, y: number, scale: number, dx: number, dy: number): void {
    const p = mc.thePlayer!;
    GL.enable(GL.COLOR_MATERIAL);
    GL.pushMatrix();
    GL.translate(x, y, 50);
    GL.scale(-scale, scale, scale);
    GL.rotate(180, 0, 0, 1);
    const yawOffset = p.renderYawOffset;
    const yaw = p.rotationYaw;
    const pitch = p.rotationPitch;
    GL.rotate(135, 0, 1, 0);
    RenderHelper.enableStandardItemLighting();
    GL.rotate(-135, 0, 1, 0);
    GL.rotate(f(-f(Math.atan(dy / 40)) * 20), 1, 0, 0);
    p.renderYawOffset = f(f(Math.atan(dx / 40)) * 20);
    p.rotationYaw = f(f(Math.atan(dx / 40)) * 40);
    p.rotationPitch = f(-f(Math.atan(dy / 40)) * 20);
    p.rotationYawHead = p.rotationYaw;
    GL.translate(0, p.yOffset, 0);
    RenderManager.instance.playerViewY = 180;
    RenderManager.instance.renderEntityWithPosYaw(p, 0, 0, 0, 0, 1);
    p.renderYawOffset = yawOffset;
    p.rotationYaw = yaw;
    p.rotationPitch = pitch;
    GL.popMatrix();
    RenderHelper.disableStandardItemLighting();
    GL.disable(GL.RESCALE_NORMAL);
    OpenGlHelper.setActiveTexture(OpenGlHelper.lightmapTexUnit);
    GL.disable(GL.TEXTURE_2D);
    OpenGlHelper.setActiveTexture(OpenGlHelper.defaultTexUnit);
  }
}
