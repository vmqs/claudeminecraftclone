import { ItemIds } from '../../block/BlockIds';
import type { Entity } from '../../entity/Entity';
import { Item } from '../../item/Item';
import { GL } from '../gl/GL';
import { Tessellator } from '../gl/Tessellator';
import type { Icon, IconRegister } from '../texture/Icon';
import { Render } from './Render';

const f = Math.fround;

/** RenderFireball: the fire charge sprite facing the camera, 2x for ghast fireballs, 0.5x for blaze ones. */
export class RenderFireball extends Render {
  private icon: Icon | null = null;

  constructor(private readonly scale: number) {
    super();
  }

  override updateItemIcons(reg: IconRegister): void {
    this.icon = reg.registerIcon('fireball');
  }

  doRender(_e: Entity, x: number, y: number, z: number, _yaw: number, _pt: number): void {
    const icon = Item.itemsList[ItemIds.fireballCharge]?.getIconFromDamage(0) ?? this.icon;
    if (!icon) return;
    GL.pushMatrix();
    GL.translate(f(x), f(y), f(z));
    GL.enable(GL.RESCALE_NORMAL);
    const s = f(this.scale);
    GL.scale(s, s, s);
    this.loadTexture('/gui/items.png');
    const t = Tessellator.instance;
    const u0 = icon.getMinU();
    const u1 = icon.getMaxU();
    const v0 = icon.getMinV();
    const v1 = icon.getMaxV();
    const hx = f(0.5);
    const hy = f(0.25);
    GL.rotate(f(180 - this.renderManager.playerViewY), 0, 1, 0);
    GL.rotate(-this.renderManager.playerViewX, 1, 0, 0);
    t.startDrawingQuads();
    t.setNormal(0, 1, 0);
    t.addVertexWithUV(0 - hx, 0 - hy, 0, u0, v1);
    t.addVertexWithUV(1 - hx, 0 - hy, 0, u1, v1);
    t.addVertexWithUV(1 - hx, 1 - hy, 0, u1, v0);
    t.addVertexWithUV(0 - hx, 1 - hy, 0, u0, v0);
    t.draw();
    GL.disable(GL.RESCALE_NORMAL);
    GL.popMatrix();
  }
}
