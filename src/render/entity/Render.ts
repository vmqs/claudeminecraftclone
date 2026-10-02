import { Block } from '../../block/Block';
import type { AxisAlignedBB } from '../../core/AxisAlignedBB';
import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import type { EntityLiving } from '../../entity/EntityLiving';
import type { FontRenderer } from '../../gui/FontRenderer';
import type { World } from '../../world/World';
import { GL } from '../gl/GL';
import { Tessellator } from '../gl/Tessellator';
import { RenderBlocks } from '../RenderBlocks';
import type { Icon, IconRegister } from '../texture/Icon';
import type { RenderManager } from './RenderManager';

const f = Math.fround;

/**
 * Base entity renderer (Render): subclasses draw an entity at a camera-relative position;
 * this class adds the blob shadow (Fancy graphics) and the burning overlay.
 */
export abstract class Render {
  renderManager!: RenderManager;
  protected readonly renderBlocks = new RenderBlocks();
  protected shadowSize = 0;
  protected shadowOpaque = 1;
  /** fire_0 / fire_1 from the terrain atlas (Block.fire.func_94438_c), registered by RenderManager. */
  static fireIcons: [Icon | null, Icon | null] = [null, null];

  abstract doRender(e: Entity, x: number, y: number, z: number, yaw: number, pt: number): void;

  protected loadTexture(path: string): void {
    this.renderManager.renderEngine?.bindTexture(path);
  }

  setRenderManager(m: RenderManager): void {
    this.renderManager = m;
  }

  /** Terrain icons this renderer needs (called when the terrain atlas is stitched). */
  updateIcons(_reg: IconRegister): void {}

  /** Item-atlas icons this renderer needs (called when the item atlas is stitched). */
  updateItemIcons(_reg: IconRegister): void {}

  getFontRendererFromRenderManager(): FontRenderer | null {
    return this.renderManager.fontRenderer;
  }

  /** Two alternating, shrinking fire sprites stacked up the entity's height, facing the camera. */
  private renderEntityOnFire(e: Entity, x: number, y: number, z: number): void {
    const [fire0, fire1] = Render.fireIcons;
    if (!fire0 || !fire1) return;
    GL.disable(GL.LIGHTING);
    GL.pushMatrix();
    GL.translate(f(x), f(y), f(z));
    const scale = f(e.width * f(1.4));
    GL.scale(scale, scale, scale);
    this.loadTexture('/terrain.png');
    const t = Tessellator.instance;
    let halfW = f(0.5);
    let height = f(e.height / scale);
    let yOff = f(e.posY - e.boundingBox.minY);
    GL.rotate(-this.renderManager.playerViewY, 0, 1, 0);
    GL.translate(0, 0, f(f(-0.3) + f(Math.trunc(height) * f(0.02))));
    GL.color(1, 1, 1, 1);
    let z0 = 0;
    let i = 0;
    t.startDrawingQuads();
    while (height > 0) {
      const icon = i % 2 === 0 ? fire0 : fire1;
      let u0 = icon.getMinU();
      const v0 = icon.getMinV();
      let u1 = icon.getMaxU();
      const v1 = icon.getMaxV();
      if (Math.trunc(i / 2) % 2 === 0) [u0, u1] = [u1, u0];
      t.addVertexWithUV(halfW, 0 - yOff, z0, u1, v1);
      t.addVertexWithUV(-halfW, 0 - yOff, z0, u0, v1);
      t.addVertexWithUV(-halfW, f(1.4) - yOff, z0, u0, v0);
      t.addVertexWithUV(halfW, f(1.4) - yOff, z0, u1, v0);
      height = f(height - f(0.45));
      yOff = f(yOff - f(0.45));
      halfW = f(halfW * f(0.9));
      z0 = f(z0 + f(0.03));
      i++;
    }
    t.draw();
    GL.popMatrix();
    GL.enable(GL.LIGHTING);
  }

  /** The round shadow projected onto the tops of full blocks below the entity. */
  private renderShadow(e: Entity, x: number, y: number, z: number, opacity: number, pt: number): void {
    const w = this.renderManager.worldObj;
    if (!w) return;
    GL.enable(GL.BLEND);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    this.renderManager.renderEngine!.bindTexture('%clamp%/misc/shadow.png');
    GL.depthMask(false);
    let size = this.shadowSize;
    if (e.isLivingEntity) {
      const l = e as EntityLiving;
      size = f(size * l.getRenderSizeModifier());
      if (l.isChild()) size = f(size * f(0.5));
    }
    const ex = e.lastTickPosX + (e.posX - e.lastTickPosX) * pt;
    const ey = e.lastTickPosY + (e.posY - e.lastTickPosY) * pt + e.getShadowSize();
    const ez = e.lastTickPosZ + (e.posZ - e.lastTickPosZ) * pt;
    const x0 = MathHelper.floor_double(ex - size);
    const x1 = MathHelper.floor_double(ex + size);
    const y0 = MathHelper.floor_double(ey - size);
    const y1 = MathHelper.floor_double(ey);
    const z0 = MathHelper.floor_double(ez - size);
    const z1 = MathHelper.floor_double(ez + size);
    const dx = x - ex;
    const dy = y - ey;
    const dz = z - ez;
    const t = Tessellator.instance;
    t.startDrawingQuads();
    for (let bx = x0; bx <= x1; bx++) {
      for (let by = y0; by <= y1; by++) {
        for (let bz = z0; bz <= z1; bz++) {
          const id = w.getBlockId(bx, by - 1, bz);
          if (id > 0 && w.getBlockLightValue(bx, by, bz) > 3) {
            this.renderShadowOnBlock(w, Block.blocksList[id]!, x, y + e.getShadowSize(), z, bx, by, bz, opacity, size, dx, dy + e.getShadowSize(), dz);
          }
        }
      }
    }
    t.draw();
    GL.color(1, 1, 1, 1);
    GL.disable(GL.BLEND);
    GL.depthMask(true);
  }

  private renderShadowOnBlock(w: World, b: Block, x: number, y: number, z: number, bx: number, by: number, bz: number, opacity: number, size: number, dx: number, dy: number, dz: number): void {
    if (!b.renderAsNormalBlock()) return;
    let a = (opacity - (y - (by + dy)) / 2) * 0.5 * w.getLightBrightness(bx, by, bz);
    if (a < 0) return;
    if (a > 1) a = 1;
    const t = Tessellator.instance;
    t.setColorRGBA_F(1, 1, 1, f(a));
    const minX = bx + b.getBlockBoundsMinX() + dx;
    const maxX = bx + b.getBlockBoundsMaxX() + dx;
    const top = by + b.getBlockBoundsMinY() + dy + 0.015625;
    const minZ = bz + b.getBlockBoundsMinZ() + dz;
    const maxZ = bz + b.getBlockBoundsMaxZ() + dz;
    const u0 = f((x - minX) / 2 / size + 0.5);
    const u1 = f((x - maxX) / 2 / size + 0.5);
    const v0 = f((z - minZ) / 2 / size + 0.5);
    const v1 = f((z - maxZ) / 2 / size + 0.5);
    t.addVertexWithUV(minX, top, minZ, u0, v0);
    t.addVertexWithUV(minX, top, maxZ, u0, v1);
    t.addVertexWithUV(maxX, top, maxZ, u1, v1);
    t.addVertexWithUV(maxX, top, minZ, u1, v0);
  }

  /** Draws an untextured box at an offset (debug and lightning helpers). */
  static renderOffsetAABB(bb: AxisAlignedBB, x: number, y: number, z: number): void {
    GL.disable(GL.TEXTURE_2D);
    const t = Tessellator.instance;
    GL.color(1, 1, 1, 1);
    t.startDrawingQuads();
    t.setTranslation(x, y, z);
    t.setNormal(0, 0, -1);
    t.addVertex(bb.minX, bb.maxY, bb.minZ);
    t.addVertex(bb.maxX, bb.maxY, bb.minZ);
    t.addVertex(bb.maxX, bb.minY, bb.minZ);
    t.addVertex(bb.minX, bb.minY, bb.minZ);
    t.setNormal(0, 0, 1);
    t.addVertex(bb.minX, bb.minY, bb.maxZ);
    t.addVertex(bb.maxX, bb.minY, bb.maxZ);
    t.addVertex(bb.maxX, bb.maxY, bb.maxZ);
    t.addVertex(bb.minX, bb.maxY, bb.maxZ);
    t.setNormal(0, -1, 0);
    t.addVertex(bb.minX, bb.minY, bb.minZ);
    t.addVertex(bb.maxX, bb.minY, bb.minZ);
    t.addVertex(bb.maxX, bb.minY, bb.maxZ);
    t.addVertex(bb.minX, bb.minY, bb.maxZ);
    t.setNormal(0, 1, 0);
    t.addVertex(bb.minX, bb.maxY, bb.maxZ);
    t.addVertex(bb.maxX, bb.maxY, bb.maxZ);
    t.addVertex(bb.maxX, bb.maxY, bb.minZ);
    t.addVertex(bb.minX, bb.maxY, bb.minZ);
    t.setNormal(-1, 0, 0);
    t.addVertex(bb.minX, bb.minY, bb.maxZ);
    t.addVertex(bb.minX, bb.maxY, bb.maxZ);
    t.addVertex(bb.minX, bb.maxY, bb.minZ);
    t.addVertex(bb.minX, bb.minY, bb.minZ);
    t.setNormal(1, 0, 0);
    t.addVertex(bb.maxX, bb.minY, bb.minZ);
    t.addVertex(bb.maxX, bb.maxY, bb.minZ);
    t.addVertex(bb.maxX, bb.maxY, bb.maxZ);
    t.addVertex(bb.maxX, bb.minY, bb.maxZ);
    t.setTranslation(0, 0, 0);
    t.draw();
    GL.enable(GL.TEXTURE_2D);
  }

  /** Shadow (Fancy graphics, fading out over 16 blocks) and fire after the entity itself. */
  doRenderShadowAndFire(e: Entity, x: number, y: number, z: number, _yaw: number, pt: number): void {
    const opts = this.renderManager.options;
    if (opts && opts.fancyGraphics && this.shadowSize > 0 && !e.isInvisible()) {
      const d = this.renderManager.getDistanceToCamera(e.posX, e.posY, e.posZ);
      const opacity = f((1 - d / 256) * this.shadowOpaque);
      if (opacity > 0) this.renderShadow(e, x, y, z, opacity, pt);
    }
    if (e.canRenderOnFire()) this.renderEntityOnFire(e, x, y, z);
  }
}
