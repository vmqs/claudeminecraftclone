import { Block } from '../block/Block';
import { Material } from '../block/Material';
import type { Minecraft } from '../client/Minecraft';
import { MathHelper } from '../core/MathHelper';
import type { EntityLiving } from '../entity/EntityLiving';
import { EnumAction, Item } from '../item/Item';
import { getItemIconForEntity } from '../item/ItemIcons';
import type { ItemStack } from '../item/ItemStack';
import { ModelBiped } from './entity/ModelBiped';
import { GL } from './gl/GL';
import { Tessellator } from './gl/Tessellator';
import { OpenGlHelper } from './OpenGlHelper';
import { RenderBlocks } from './RenderBlocks';
import { RenderHelper } from './RenderHelper';
import type { Icon } from './texture/Icon';

const f = Math.fround;
const PI_F = f(Math.PI);

/** First-person held item / hand and the screen overlays (water, inside a block). */
export class ItemRenderer {
  private itemToRender: ItemStack | null = null;
  private equippedProgress = 0;
  private prevEquippedProgress = 0;
  private readonly renderBlocksInstance = new RenderBlocks();
  private equippedItemSlot = -1;
  private readonly armModel = new ModelBiped(0);

  constructor(private readonly mc: Minecraft) {}

  /** Draws a stack: 3D blocks through RenderBlocks, everything else as an extruded sprite. */
  renderItem(e: EntityLiving, stack: ItemStack, pass: number): void {
    GL.pushMatrix();
    const block = stack.itemID < 256 ? Block.blocksList[stack.itemID] : null;
    if (stack.getItemSpriteNumber() === 0 && block && RenderBlocks.renderItemIn3d(block.getRenderType())) {
      this.mc.renderEngine.bindTexture('/terrain.png');
      this.renderBlocksInstance.renderBlockAsItem(block, stack.getItemDamage(), 1);
    } else {
      const icon = getItemIconForEntity(e, stack, pass);
      if (!icon) {
        GL.popMatrix();
        void e;
        return;
      }
      this.mc.renderEngine.bindTexture(stack.getItemSpriteNumber() === 0 ? '/terrain.png' : '/gui/items.png');
      GL.translate(0, f(-0.3), 0);
      GL.scale(1.5, 1.5, 1.5);
      GL.rotate(50, 0, 1, 0);
      GL.rotate(335, 0, 0, 1);
      GL.translate(f(-0.9375), f(-0.0625), 0);
      ItemRenderer.renderItemIn2D(Tessellator.instance, icon.getMaxU(), icon.getMinV(), icon.getMinU(), icon.getMaxV(), icon.getSheetWidth(), icon.getSheetHeight(), f(0.0625));
    }
    GL.popMatrix();
  }

  /** The original's extruded sprite: front, back and one-pixel side strips. */
  static renderItemIn2D(t: Tessellator, u0: number, v0: number, u1: number, v1: number, w: number, h: number, depth: number): void {
    t.startDrawingQuads();
    t.setNormal(0, 0, 1);
    t.addVertexWithUV(0, 0, 0, u0, v1);
    t.addVertexWithUV(1, 0, 0, u1, v1);
    t.addVertexWithUV(1, 1, 0, u1, v0);
    t.addVertexWithUV(0, 1, 0, u0, v0);
    t.draw();
    t.startDrawingQuads();
    t.setNormal(0, 0, -1);
    t.addVertexWithUV(0, 1, -depth, u0, v0);
    t.addVertexWithUV(1, 1, -depth, u1, v0);
    t.addVertexWithUV(1, 0, -depth, u1, v1);
    t.addVertexWithUV(0, 0, -depth, u0, v1);
    t.draw();
    const pw = f(w * f(u0 - u1));
    const ph = f(h * f(v1 - v0));
    t.startDrawingQuads();
    t.setNormal(-1, 0, 0);
    for (let i = 0; i < pw; i++) {
      const p = f(i / pw);
      const u = f(f(u0 + f(f(u1 - u0) * p)) - f(0.5 / w));
      t.addVertexWithUV(p, 0, -depth, u, v1);
      t.addVertexWithUV(p, 0, 0, u, v1);
      t.addVertexWithUV(p, 1, 0, u, v0);
      t.addVertexWithUV(p, 1, -depth, u, v0);
    }
    t.draw();
    t.startDrawingQuads();
    t.setNormal(1, 0, 0);
    for (let i = 0; i < pw; i++) {
      const p = f(i / pw);
      const u = f(f(u0 + f(f(u1 - u0) * p)) - f(0.5 / w));
      const x = f(p + f(1 / pw));
      t.addVertexWithUV(x, 1, -depth, u, v0);
      t.addVertexWithUV(x, 1, 0, u, v0);
      t.addVertexWithUV(x, 0, 0, u, v1);
      t.addVertexWithUV(x, 0, -depth, u, v1);
    }
    t.draw();
    t.startDrawingQuads();
    t.setNormal(0, 1, 0);
    for (let i = 0; i < ph; i++) {
      const p = f(i / ph);
      const v = f(f(v1 + f(f(v0 - v1) * p)) - f(0.5 / h));
      const y = f(p + f(1 / ph));
      t.addVertexWithUV(0, y, 0, u0, v);
      t.addVertexWithUV(1, y, 0, u1, v);
      t.addVertexWithUV(1, y, -depth, u1, v);
      t.addVertexWithUV(0, y, -depth, u0, v);
    }
    t.draw();
    t.startDrawingQuads();
    t.setNormal(0, -1, 0);
    for (let i = 0; i < ph; i++) {
      const p = f(i / ph);
      const v = f(f(v1 + f(f(v0 - v1) * p)) - f(0.5 / h));
      t.addVertexWithUV(1, p, 0, u1, v);
      t.addVertexWithUV(0, p, 0, u0, v);
      t.addVertexWithUV(0, p, -depth, u0, v);
      t.addVertexWithUV(1, p, -depth, u1, v);
    }
    t.draw();
  }

  renderItemInFirstPerson(pt: number): void {
    const equip = f(this.prevEquippedProgress + (this.equippedProgress - this.prevEquippedProgress) * pt);
    const p = this.mc.thePlayer!;
    const pitch = f(p.prevRotationPitch + (p.rotationPitch - p.prevRotationPitch) * pt);
    GL.pushMatrix();
    GL.rotate(pitch, 1, 0, 0);
    GL.rotate(f(p.prevRotationYaw + (p.rotationYaw - p.prevRotationYaw) * pt), 0, 1, 0);
    RenderHelper.enableStandardItemLighting();
    GL.popMatrix();
    const armPitch = f(p.prevRenderArmPitch + (p.renderArmPitch - p.prevRenderArmPitch) * pt);
    const armYaw = f(p.prevRenderArmYaw + (p.renderArmYaw - p.prevRenderArmYaw) * pt);
    GL.rotate(f(f(p.rotationPitch - armPitch) * f(0.1)), 1, 0, 0);
    GL.rotate(f(f(p.rotationYaw - armYaw) * f(0.1)), 0, 1, 0);
    const stack = this.itemToRender;
    const w = this.mc.theWorld!;
    const light = w.getLightBrightnessForSkyBlocks(MathHelper.floor_double(p.posX), MathHelper.floor_double(p.posY), MathHelper.floor_double(p.posZ), 0);
    OpenGlHelper.setLightmapTextureCoords(OpenGlHelper.lightmapTexUnit, light % 65536, Math.trunc(light / 65536));
    GL.color(1, 1, 1, 1);
    if (stack) {
      const c = Item.itemsList[stack.itemID]?.getColorFromItemStack(stack, 0) ?? 0xffffff;
      GL.color(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255, 1);
      GL.pushMatrix();
      const k = f(0.8);
      if (p.getItemInUseCount() > 0) {
        const action = stack.getItemUseAction();
        if (action === EnumAction.eat || action === EnumAction.drink) {
          const t = f(f(p.getItemInUseCount() - pt) + 1);
          const done = f(1 - f(t / stack.getMaxItemUseDuration()));
          let e = f(1 - done);
          e = f(e * e * e);
          e = f(e * e * e);
          e = f(e * e * e);
          const r = f(1 - e);
          GL.translate(0, f(MathHelper.abs(f(MathHelper.cos(f(f(t / 4) * PI_F)) * f(0.1))) * (done > 0.2 ? 1 : 0)), 0);
          GL.translate(f(r * f(0.6)), f(-r * f(0.5)), 0);
          GL.rotate(f(r * 90), 0, 1, 0);
          GL.rotate(f(r * 10), 1, 0, 0);
          GL.rotate(f(r * 30), 0, 0, 1);
        }
      } else {
        const sw = p.getSwingProgress(pt);
        const a = MathHelper.sin(f(sw * PI_F));
        const b = MathHelper.sin(f(MathHelper.sqrt_float(sw) * PI_F));
        GL.translate(f(-b * f(0.4)), f(MathHelper.sin(f(f(MathHelper.sqrt_float(sw) * PI_F) * 2)) * f(0.2)), f(-a * f(0.2)));
      }
      GL.translate(f(f(0.7) * k), f(f(f(-0.65) * k) - f(f(1 - equip) * f(0.6))), f(f(-0.9) * k));
      GL.rotate(45, 0, 1, 0);
      const sw = p.getSwingProgress(pt);
      const a = MathHelper.sin(f(f(sw * sw) * PI_F));
      const b = MathHelper.sin(f(MathHelper.sqrt_float(sw) * PI_F));
      GL.rotate(f(-a * 20), 0, 1, 0);
      GL.rotate(f(-b * 20), 0, 0, 1);
      GL.rotate(f(-b * 80), 1, 0, 0);
      GL.scale(f(0.4), f(0.4), f(0.4));
      if (stack.getItem().shouldRotateAroundWhenRendering()) GL.rotate(180, 0, 1, 0);
      this.renderItem(p, stack, 0);
      if (stack.getItem().requiresMultipleRenderPasses()) {
        const c2 = stack.getItem().getColorFromItemStack(stack, 1);
        GL.color(((c2 >> 16) & 255) / 255, ((c2 >> 8) & 255) / 255, (c2 & 255) / 255, 1);
        this.renderItem(p, stack, 1);
      }
      GL.popMatrix();
    } else if (!p.isInvisible()) {
      GL.pushMatrix();
      const k = f(0.8);
      const sw = p.getSwingProgress(pt);
      const a = MathHelper.sin(f(sw * PI_F));
      let b = MathHelper.sin(f(MathHelper.sqrt_float(sw) * PI_F));
      GL.translate(f(-b * f(0.3)), f(MathHelper.sin(f(f(MathHelper.sqrt_float(sw) * PI_F) * 2)) * f(0.4)), f(-a * f(0.4)));
      GL.translate(f(f(0.8) * k), f(f(f(-0.75) * k) - f(f(1 - equip) * f(0.6))), f(f(-0.9) * k));
      GL.rotate(45, 0, 1, 0);
      const sw2 = p.getSwingProgress(pt);
      const c = MathHelper.sin(f(f(sw2 * sw2) * PI_F));
      b = MathHelper.sin(f(MathHelper.sqrt_float(sw2) * PI_F));
      GL.rotate(f(b * 70), 0, 1, 0);
      GL.rotate(f(-c * 20), 0, 0, 1);
      this.mc.renderEngine.bindTexture(p.getTextureName());
      GL.translate(-1, f(3.6), f(3.5));
      GL.rotate(120, 0, 0, 1);
      GL.rotate(200, 1, 0, 0);
      GL.rotate(-135, 0, 1, 0);
      GL.translate(f(5.6), 0, 0);
      this.renderFirstPersonArm();
      GL.popMatrix();
    }
    RenderHelper.disableStandardItemLighting();
  }

  /** RenderPlayer.renderFirstPersonArm. */
  private renderFirstPersonArm(): void {
    GL.color(1, 1, 1);
    this.armModel.onGround = 0;
    this.armModel.setRotationAngles(0, 0, 0, 0, 0, f(0.0625), this.mc.thePlayer);
    this.armModel.bipedRightArm.render(f(0.0625));
  }

  renderOverlays(pt: number): void {
    GL.disable(GL.ALPHA_TEST);
    const p = this.mc.thePlayer!;
    const w = this.mc.theWorld!;
    if (p.isEntityInsideOpaqueBlock()) {
      const x = MathHelper.floor_double(p.posX);
      const y = MathHelper.floor_double(p.posY);
      const z = MathHelper.floor_double(p.posZ);
      this.mc.renderEngine.bindTexture('/terrain.png');
      let id = w.getBlockId(x, y, z);
      if (w.isBlockNormalCube(x, y, z)) {
        const icon = Block.blocksList[id]?.getBlockTextureFromSide(2);
        if (icon) this.renderInsideOfBlock(icon);
      } else {
        for (let i = 0; i < 8; i++) {
          const ox = f(f(((i >> 0) % 2) - 0.5) * p.width * f(0.9));
          const oy = f(f(((i >> 1) % 2) - 0.5) * p.height * f(0.2));
          const oz = f(f(((i >> 2) % 2) - 0.5) * p.width * f(0.9));
          const bx = MathHelper.floor_float(x + ox);
          const by = MathHelper.floor_float(y + oy);
          const bz = MathHelper.floor_float(z + oz);
          if (w.isBlockNormalCube(bx, by, bz)) id = w.getBlockId(bx, by, bz);
        }
      }
      const icon = Block.blocksList[id]?.getBlockTextureFromSide(2);
      if (icon) this.renderInsideOfBlock(icon);
    }
    if (p.isInsideOfMaterial(Material.water)) {
      this.mc.renderEngine.bindTexture('/misc/water.png');
      this.renderWarpedTextureOverlay(pt);
    }
    GL.enable(GL.ALPHA_TEST);
  }

  private renderInsideOfBlock(icon: Icon): void {
    const t = Tessellator.instance;
    GL.color(f(0.1), f(0.1), f(0.1), 0.5);
    GL.pushMatrix();
    const z = -0.5;
    t.startDrawingQuads();
    t.addVertexWithUV(-1, -1, z, icon.getMaxU(), icon.getMaxV());
    t.addVertexWithUV(1, -1, z, icon.getMinU(), icon.getMaxV());
    t.addVertexWithUV(1, 1, z, icon.getMinU(), icon.getMinV());
    t.addVertexWithUV(-1, 1, z, icon.getMaxU(), icon.getMinV());
    t.draw();
    GL.popMatrix();
    GL.color(1, 1, 1, 1);
  }

  private renderWarpedTextureOverlay(pt: number): void {
    const t = Tessellator.instance;
    const p = this.mc.thePlayer!;
    const b = p.getBrightness(pt);
    GL.color(b, b, b, 0.5);
    GL.enable(GL.BLEND);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    GL.pushMatrix();
    const s = 4;
    const z = -0.5;
    const du = f(-p.rotationYaw / 64);
    const dv = f(p.rotationPitch / 64);
    t.startDrawingQuads();
    t.addVertexWithUV(-1, -1, z, s + du, s + dv);
    t.addVertexWithUV(1, -1, z, 0 + du, s + dv);
    t.addVertexWithUV(1, 1, z, 0 + du, 0 + dv);
    t.addVertexWithUV(-1, 1, z, s + du, 0 + dv);
    t.draw();
    GL.popMatrix();
    GL.color(1, 1, 1, 1);
    GL.disable(GL.BLEND);
  }

  updateEquippedItem(): void {
    this.prevEquippedProgress = this.equippedProgress;
    const p = this.mc.thePlayer!;
    const cur = p.inventory.getCurrentItem();
    let same = this.equippedItemSlot === p.inventory.currentItem && cur === this.itemToRender;
    if (!this.itemToRender && !cur) same = true;
    if (cur && this.itemToRender && cur !== this.itemToRender && cur.itemID === this.itemToRender.itemID && cur.getItemDamage() === this.itemToRender.getItemDamage()) {
      this.itemToRender = cur;
      same = true;
    }
    const lim = f(0.4);
    let d = f((same ? 1 : 0) - this.equippedProgress);
    if (d < -lim) d = -lim;
    if (d > lim) d = lim;
    this.equippedProgress = f(this.equippedProgress + d);
    if (this.equippedProgress < 0.1) {
      this.itemToRender = cur;
      this.equippedItemSlot = p.inventory.currentItem;
    }
  }

  resetEquippedProgress(): void {
    this.equippedProgress = 0;
  }

  resetEquippedProgress2(): void {
    this.equippedProgress = 0;
  }
}
