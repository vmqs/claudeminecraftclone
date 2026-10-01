import { Block } from '../../block/Block';
import { Item } from '../../item/Item';
import type { ItemStack } from '../../item/ItemStack';
import type { FontRenderer } from '../../gui/FontRenderer';
import { GL } from '../gl/GL';
import { Tessellator } from '../gl/Tessellator';
import { RenderBlocks } from '../RenderBlocks';
import type { Icon } from '../texture/Icon';
import type { TextureManager } from '../texture/TextureManager';

/** Item icons in GUIs (RenderItem's GUI half): 3D blocks, flat sprites, counts, damage bars. */
export class RenderItem {
  zLevel = 0;
  renderWithColor = true;
  private readonly itemRenderBlocks = new RenderBlocks();

  renderItemIntoGUI(_fr: FontRenderer, engine: TextureManager, stack: ItemStack, x: number, y: number): void {
    const id = stack.itemID;
    const meta = stack.getItemDamage();
    let icon = stack.getIconIndex();
    const block = id < 256 ? Block.blocksList[id] : null;
    const item = Item.itemsList[id];
    if (stack.getItemSpriteNumber() === 0 && block && RenderBlocks.renderItemIn3d(block.getRenderType())) {
      engine.bindTexture('/terrain.png');
      GL.pushMatrix();
      GL.translate(x - 2, y + 3, -3 + this.zLevel);
      GL.scale(10, 10, 10);
      GL.translate(1, 0.5, 1);
      GL.scale(1, 1, -1);
      GL.rotate(210, 1, 0, 0);
      GL.rotate(45, 0, 1, 0);
      const c = item ? item.getColorFromItemStack(stack, 0) : 0xffffff;
      if (this.renderWithColor) GL.color(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255, 1);
      GL.rotate(-90, 0, 1, 0);
      this.itemRenderBlocks.useInventoryTint = this.renderWithColor;
      this.itemRenderBlocks.renderBlockAsItem(block, meta, 1);
      this.itemRenderBlocks.useInventoryTint = true;
      GL.popMatrix();
    } else {
      GL.disable(GL.LIGHTING);
      engine.bindTexture(stack.getItemSpriteNumber() === 0 ? '/terrain.png' : '/gui/items.png');
      if (!icon) icon = engine.getMissingIcon(stack.getItemSpriteNumber());
      const c = item ? item.getColorFromItemStack(stack, 0) : 0xffffff;
      if (this.renderWithColor) GL.color(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255, 1);
      this.renderIcon(x, y, icon, 16, 16);
      GL.enable(GL.LIGHTING);
    }
    GL.enable(GL.CULL_FACE);
  }

  renderItemAndEffectIntoGUI(fr: FontRenderer, engine: TextureManager, stack: ItemStack | null, x: number, y: number): void {
    if (stack) this.renderItemIntoGUI(fr, engine, stack, x, y);
  }

  renderItemOverlayIntoGUI(fr: FontRenderer, _engine: TextureManager, stack: ItemStack | null, x: number, y: number, text: string | null = null): void {
    if (!stack) return;
    if (stack.stackSize > 1 || text !== null) {
      const s = text ?? String(stack.stackSize);
      GL.disable(GL.LIGHTING);
      GL.disable(GL.DEPTH_TEST);
      fr.drawStringWithShadow(s, x + 19 - 2 - fr.getStringWidth(s), y + 6 + 3, 0xffffff);
      GL.enable(GL.LIGHTING);
      GL.enable(GL.DEPTH_TEST);
    }
    if (stack.isItemDamaged()) {
      const bar = Math.round(13 - (stack.getItemDamageForDisplay() * 13) / stack.getMaxDamage());
      const g = Math.round(255 - (stack.getItemDamageForDisplay() * 255) / stack.getMaxDamage());
      GL.disable(GL.LIGHTING);
      GL.disable(GL.DEPTH_TEST);
      GL.disable(GL.TEXTURE_2D);
      const t = Tessellator.instance;
      const fg = ((255 - g) << 16) | (g << 8);
      const bg = (Math.trunc((255 - g) / 4) << 16) | 16128;
      this.renderQuad(t, x + 2, y + 13, 13, 2, 0);
      this.renderQuad(t, x + 2, y + 13, 12, 1, bg);
      this.renderQuad(t, x + 2, y + 13, bar, 1, fg);
      GL.enable(GL.TEXTURE_2D);
      GL.enable(GL.LIGHTING);
      GL.enable(GL.DEPTH_TEST);
      GL.color(1, 1, 1, 1);
    }
  }

  private renderQuad(t: Tessellator, x: number, y: number, w: number, h: number, color: number): void {
    t.startDrawingQuads();
    t.setColorOpaque_I(color);
    t.addVertex(x, y, 0);
    t.addVertex(x, y + h, 0);
    t.addVertex(x + w, y + h, 0);
    t.addVertex(x + w, y, 0);
    t.draw();
  }

  renderIcon(x: number, y: number, icon: Icon, w: number, h: number): void {
    const t = Tessellator.instance;
    t.startDrawingQuads();
    t.addVertexWithUV(x + 0, y + h, this.zLevel, icon.getMinU(), icon.getMaxV());
    t.addVertexWithUV(x + w, y + h, this.zLevel, icon.getMaxU(), icon.getMaxV());
    t.addVertexWithUV(x + w, y + 0, this.zLevel, icon.getMaxU(), icon.getMinV());
    t.addVertexWithUV(x + 0, y + 0, this.zLevel, icon.getMinU(), icon.getMinV());
    t.draw();
  }
}
