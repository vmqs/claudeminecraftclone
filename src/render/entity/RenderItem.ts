import { Block } from '../../block/Block';
import { JavaRandom } from '../../core/JavaRandom';
import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import type { EntityItem } from '../../entity/EntityItem';
import { Item } from '../../item/Item';
import type { ItemStack } from '../../item/ItemStack';
import type { FontRenderer } from '../../gui/FontRenderer';
import { GL } from '../gl/GL';
import { Tessellator } from '../gl/Tessellator';
import { ItemRenderer } from '../ItemRenderer';
import { RenderBlocks } from '../RenderBlocks';
import type { Icon } from '../texture/Icon';
import type { TextureManager } from '../texture/TextureManager';
import { Render } from './Render';

const f = Math.fround;

/**
 * RenderItem: dropped item entities (spinning, bobbing, several copies for bigger stacks;
 * 3D blocks, flat sprites, or thick 3D sprites with Fancy graphics) and item icons in GUIs
 * (3D blocks, flat sprites, counts, damage bars).
 */
export class RenderItem extends Render {
  zLevel = 0;
  renderWithColor = true;
  /** Item frames draw their item through this renderer with this set. */
  static renderInFrame = false;
  private readonly itemRenderBlocks = new RenderBlocks();
  private readonly random = new JavaRandom();

  constructor() {
    super();
    this.shadowSize = f(0.15);
    this.shadowOpaque = f(0.75);
  }

  doRender(e: Entity, x: number, y: number, z: number, _yaw: number, pt: number): void {
    this.doRenderItem(e as EntityItem, x, y, z, pt);
  }

  doRenderItem(e: EntityItem, x: number, y: number, z: number, pt: number): void {
    this.random.setSeed(187n);
    const stack = e.getEntityItem();
    const item = Item.itemsList[stack.itemID];
    if (!item) return;
    GL.pushMatrix();
    const bob = f(f(MathHelper.sin(f(f(f(e.age + pt) / 10) + e.hoverStart)) * f(0.1)) + f(0.1));
    const spin = f(f(f(f(e.age + pt) / 20) + e.hoverStart) * f(180 / f(Math.PI)));
    let copies = 1;
    if (stack.stackSize > 1) copies = 2;
    if (stack.stackSize > 5) copies = 3;
    if (stack.stackSize > 20) copies = 4;
    if (stack.stackSize > 40) copies = 5;
    GL.translate(f(x), f(f(y) + bob), f(z));
    GL.enable(GL.RESCALE_NORMAL);
    const block = stack.getItemSpriteNumber() === 0 ? Block.blocksList[stack.itemID] : null;
    if (block && RenderBlocks.renderItemIn3d(block.getRenderType())) {
      GL.rotate(spin, 0, 1, 0);
      if (RenderItem.renderInFrame) {
        GL.scale(1.25, 1.25, 1.25);
        GL.translate(0, f(0.05), 0);
        GL.rotate(-90, 0, 1, 0);
      }
      this.loadTexture('/terrain.png');
      const rt = block.getRenderType();
      const s = rt === 1 || rt === 19 || rt === 12 || rt === 2 ? f(0.5) : f(0.25);
      GL.scale(s, s, s);
      for (let i = 0; i < copies; i++) {
        GL.pushMatrix();
        if (i > 0) {
          GL.translate(this.jitter(0.2, s), this.jitter(0.2, s), this.jitter(0.2, s));
        }
        this.itemRenderBlocks.renderBlockAsItem(block, stack.getItemDamage(), 1);
        GL.popMatrix();
      }
    } else {
      if (RenderItem.renderInFrame) {
        const s = f(0.5128205);
        GL.scale(s, s, s);
        GL.translate(0, f(-0.05), 0);
      } else {
        GL.scale(0.5, 0.5, 0.5);
      }
      const passes = item.requiresMultipleRenderPasses() ? 2 : 1;
      if (passes === 1) this.loadTexture(stack.getItemSpriteNumber() === 0 ? '/terrain.png' : '/gui/items.png');
      else this.loadTexture('/gui/items.png');
      for (let pass = 0; pass < passes; pass++) {
        if (passes > 1) this.random.setSeed(187n);
        const icon = passes > 1 ? item.getIconFromDamageForRenderPass(stack.getItemDamage(), pass) : stack.getIconIndex();
        if (this.renderWithColor) {
          const c = item.getColorFromItemStack(stack, pass);
          const r = ((c >> 16) & 255) / 255;
          const g = ((c >> 8) & 255) / 255;
          const b = (c & 255) / 255;
          if (passes > 1) GL.color(r, g, b, 1);
          this.renderDroppedItem(e, icon, copies, pt, r, g, b);
        } else {
          this.renderDroppedItem(e, icon, copies, pt, 1, 1, 1);
        }
      }
    }
    GL.disable(GL.RESCALE_NORMAL);
    GL.popMatrix();
  }

  private jitter(amount: number, scale: number): number {
    return f(f(f(f(this.random.nextFloat() * 2) - 1) * f(amount)) / scale);
  }

  /** Thick stacked sprites with Fancy graphics, camera-facing flat sprites with Fast. */
  private renderDroppedItem(e: EntityItem, icon: Icon | null, copies: number, pt: number, r: number, g: number, b: number): void {
    const t = Tessellator.instance;
    const stack = e.getEntityItem();
    if (!icon) icon = this.renderManager.renderEngine!.getMissingIcon(stack.getItemSpriteNumber());
    const u0 = icon.getMinU();
    const u1 = icon.getMaxU();
    const v0 = icon.getMinV();
    const v1 = icon.getMaxV();
    const halfW = f(0.5);
    const yOff = f(0.25);
    if (this.renderManager.options?.fancyGraphics) {
      GL.pushMatrix();
      if (RenderItem.renderInFrame) GL.rotate(180, 0, 1, 0);
      else GL.rotate(f(f(f(f(e.age + pt) / 20) + e.hoverStart) * f(180 / f(Math.PI))), 0, 1, 0);
      const depth = f(0.0625);
      const gap = f(0.021875);
      const n = stack.stackSize < 2 ? 1 : stack.stackSize < 16 ? 2 : stack.stackSize < 32 ? 3 : 4;
      GL.translate(-halfW, -yOff, f(-f(f(f(depth + gap) * n) / 2)));
      for (let i = 0; i < n; i++) {
        GL.translate(0, 0, f(depth + gap));
        this.loadTexture(stack.getItemSpriteNumber() === 0 && Block.blocksList[stack.itemID] ? '/terrain.png' : '/gui/items.png');
        GL.color(r, g, b, 1);
        ItemRenderer.renderItemIn2D(t, u1, v0, u0, v1, icon.getSheetWidth(), icon.getSheetHeight(), depth);
        if (stack.hasEffect()) this.renderGlint(t, depth);
      }
      GL.popMatrix();
      return;
    }
    for (let i = 0; i < copies; i++) {
      GL.pushMatrix();
      if (i > 0) GL.translate(this.jitter(0.3, 1), this.jitter(0.3, 1), this.jitter(0.3, 1));
      if (!RenderItem.renderInFrame) GL.rotate(f(180 - this.renderManager.playerViewY), 0, 1, 0);
      GL.color(r, g, b, 1);
      t.startDrawingQuads();
      t.setNormal(0, 1, 0);
      t.addVertexWithUV(0 - halfW, 0 - yOff, 0, u0, v1);
      t.addVertexWithUV(1 - halfW, 0 - yOff, 0, u1, v1);
      t.addVertexWithUV(1 - halfW, 1 - yOff, 0, u1, v0);
      t.addVertexWithUV(0 - halfW, 1 - yOff, 0, u0, v0);
      t.draw();
      GL.popMatrix();
    }
  }

  /** Enchantment shine on a thick sprite: two scrolling layers. */
  private renderGlint(t: Tessellator, depth: number): void {
    GL.depthFunc(GL.EQUAL);
    GL.disable(GL.LIGHTING);
    this.renderManager.renderEngine!.bindTexture('%blur%/misc/glint.png');
    GL.enable(GL.BLEND);
    GL.blendFunc(GL.SRC_COLOR, GL.ONE);
    const k = f(0.76);
    GL.color(f(0.5 * k), f(0.25 * k), f(0.8 * k), 1);
    GL.matrixMode(GL.TEXTURE);
    const s = f(0.125);
    for (const [period, dir, angle] of [[3000, 1, -50], [4873, -1, 10]] as const) {
      GL.pushMatrix();
      GL.scale(s, s, s);
      GL.translate(f(f(f((Date.now() % period) / period) * 8) * dir), 0, 0);
      GL.rotate(angle, 0, 0, 1);
      ItemRenderer.renderItemIn2D(t, 0, 0, 1, 1, 255, 255, depth);
      GL.popMatrix();
    }
    GL.matrixMode(GL.MODELVIEW);
    GL.disable(GL.BLEND);
    GL.enable(GL.LIGHTING);
    GL.depthFunc(GL.LEQUAL);
  }

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
