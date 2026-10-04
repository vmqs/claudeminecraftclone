import type { Entity } from '../../entity/Entity';
import { PotionHooks } from '../../entity/PotionEffects';
import { Item } from '../../item/Item';
import { GL } from '../gl/GL';
import { Tessellator } from '../gl/Tessellator';
import type { Icon, IconRegister } from '../texture/Icon';
import { Render } from './Render';

const f = Math.fround;

/**
 * RenderSnowball: a thrown item drawn as its own item sprite, half size, always facing the
 * camera (snowballs, eggs, ender pearls and eyes, bottles o' enchanting, firework rockets and
 * splash potions, whose liquid layer is tinted with the potion colour first).
 */
export class RenderSnowball extends Render {
  private fallbackIcon: Icon | null = null;
  private contentsIcon: Icon | null = null;

  /**
   * @param itemID the item whose icon is drawn (Item.itemsList lookup at render time)
   * @param damage the damage value passed to getIconFromDamage (16384 = splash potion)
   * @param iconName the item-atlas sprite used until the item class itself exists
   */
  constructor(
    private readonly itemID: number,
    private readonly damage: number,
    private readonly iconName: string,
  ) {
    super();
  }

  override updateItemIcons(reg: IconRegister): void {
    this.fallbackIcon = reg.registerIcon(this.iconName);
    if (this.iconName === 'potion_splash') this.contentsIcon = reg.registerIcon('potion_contents');
  }

  doRender(e: Entity, x: number, y: number, z: number, _yaw: number, _pt: number): void {
    const icon = Item.itemsList[this.itemID]?.getIconFromDamage(this.damage) ?? this.fallbackIcon;
    if (!icon) return;
    GL.pushMatrix();
    GL.translate(f(x), f(y), f(z));
    GL.enable(GL.RESCALE_NORMAL);
    GL.scale(0.5, 0.5, 0.5);
    this.loadTexture('/gui/items.png');
    const t = Tessellator.instance;
    if (this.contentsIcon && icon === this.fallbackIcon) {
      const potionDamage = (e as Entity & { getPotionDamage(): number }).getPotionDamage();
      const c = PotionHooks.liquidColorFromDamage?.(potionDamage) ?? 3694022;
      GL.color(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
      GL.pushMatrix();
      this.drawSprite(t, this.contentsIcon);
      GL.popMatrix();
      GL.color(1, 1, 1);
    }
    this.drawSprite(t, icon);
    GL.disable(GL.RESCALE_NORMAL);
    GL.popMatrix();
  }

  /** One camera-facing quad of the icon, centred horizontally, a quarter below the middle. */
  private drawSprite(t: Tessellator, icon: Icon): void {
    const u0 = icon.getMinU();
    const u1 = icon.getMaxU();
    const v0 = icon.getMinV();
    const v1 = icon.getMaxV();
    const w = 1;
    const hx = f(0.5);
    const hy = f(0.25);
    GL.rotate(f(180 - this.renderManager.playerViewY), 0, 1, 0);
    GL.rotate(-this.renderManager.playerViewX, 1, 0, 0);
    t.startDrawingQuads();
    t.setNormal(0, 1, 0);
    t.addVertexWithUV(0 - hx, 0 - hy, 0, u0, v1);
    t.addVertexWithUV(w - hx, 0 - hy, 0, u1, v1);
    t.addVertexWithUV(w - hx, w - hy, 0, u1, v0);
    t.addVertexWithUV(0 - hx, w - hy, 0, u0, v0);
    t.draw();
  }
}
