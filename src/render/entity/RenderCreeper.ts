import { MathHelper } from '../../core/MathHelper';
import type { EntityCreeper } from '../../entity/EntityCreeper';
import type { EntityLiving } from '../../entity/EntityLiving';
import { GL } from '../gl/GL';
import { ModelCreeper } from './ModelCreeper';
import { RenderLiving } from './RenderLiving';

const f = Math.fround;

/**
 * Creepers (RenderCreeper): swell (wobbling) as the fuse burns, flash white every other tenth
 * of the fuse, and charged creepers get the scrolling additive power aura (armor/power.png on
 * a model grown by 2) as render pass 1.
 */
export class RenderCreeper extends RenderLiving {
  private readonly creeperModel = new ModelCreeper(2);

  constructor() {
    super(new ModelCreeper(), 0.5);
  }

  /** updateCreeperScale */
  protected override preRenderCallback(e: EntityLiving, pt: number): void {
    let k = (e as EntityCreeper).getCreeperFlashIntensity(pt);
    const wobble = f(1 + f(f(MathHelper.sin(f(k * 100)) * k) * f(0.01)));
    if (k < 0) k = 0;
    if (k > 1) k = 1;
    k = f(k * k);
    k = f(k * k);
    const xz = f(f(1 + f(k * f(0.4))) * wobble);
    const y = f(f(1 + f(k * f(0.1))) / wobble);
    GL.scale(xz, y, xz);
  }

  /** updateCreeperColorMultiplier: white at 0.2 x intensity on odd tenths. */
  protected override getColorMultiplier(e: EntityLiving, _brightness: number, pt: number): number {
    const k = (e as EntityCreeper).getCreeperFlashIntensity(pt);
    if (Math.trunc(f(k * 10)) % 2 === 0) return 0;
    let a = Math.trunc(f(f(k * f(0.2)) * 255));
    if (a < 0) a = 0;
    if (a > 255) a = 255;
    return ((a << 24) | (255 << 16) | (255 << 8) | 255) >>> 0;
  }

  /** renderCreeperPassModel: the charged aura. */
  protected override shouldRenderPass(e: EntityLiving, pass: number, pt: number): number {
    const c = e as EntityCreeper;
    if (!c.getPowered()) return -1;
    GL.depthMask(!c.isInvisible());
    if (pass === 1) {
      const t = f(c.ticksExisted + pt);
      this.loadTexture('/armor/power.png');
      GL.matrixMode(GL.TEXTURE);
      GL.loadIdentity();
      const s = f(t * f(0.01));
      GL.translate(s, s, 0);
      this.setRenderPassModel(this.creeperModel);
      GL.matrixMode(GL.MODELVIEW);
      GL.enable(GL.BLEND);
      GL.color(0.5, 0.5, 0.5, 1);
      GL.disable(GL.LIGHTING);
      GL.blendFunc(GL.ONE, GL.ONE);
      return 1;
    }
    if (pass === 2) {
      GL.matrixMode(GL.TEXTURE);
      GL.loadIdentity();
      GL.matrixMode(GL.MODELVIEW);
      GL.enable(GL.LIGHTING);
      GL.disable(GL.BLEND);
    }
    return -1;
  }

  /** The aura is not tinted by the hurt flash. */
  protected override inheritRenderPass(_e: EntityLiving, _pass: number, _pt: number): number {
    return -1;
  }
}
