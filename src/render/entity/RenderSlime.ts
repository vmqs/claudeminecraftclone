import type { EntityLiving } from '../../entity/EntityLiving';
import type { EntitySlime } from '../../entity/EntitySlime';
import { GL } from '../gl/GL';
import type { ModelBase } from './ModelBase';
import { RenderLiving } from './RenderLiving';

const f = Math.fround;

/**
 * Slimes (RenderSlime): the opaque core model, then the translucent outer jelly as pass 0,
 * stretched by size and the squish (wider when landing, taller when jumping).
 */
export class RenderSlime extends RenderLiving {
  constructor(
    main: ModelBase,
    private readonly outerModel: ModelBase,
    shadow: number,
  ) {
    super(main, shadow);
  }

  /** shouldSlimeRenderPass */
  protected override shouldRenderPass(e: EntityLiving, pass: number, _pt: number): number {
    if (e.isInvisible()) return 0;
    if (pass === 0) {
      this.setRenderPassModel(this.outerModel);
      GL.enable(GL.NORMALIZE);
      GL.enable(GL.BLEND);
      GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
      return 1;
    }
    if (pass === 1) {
      GL.disable(GL.BLEND);
      GL.color(1, 1, 1, 1);
    }
    return -1;
  }

  /** scaleSlime */
  protected override preRenderCallback(e: EntityLiving, pt: number): void {
    const s = e as EntitySlime;
    const size = s.getSlimeSize();
    const squish = f(f(s.prevSquishFactor + f(f(s.squishFactor - s.prevSquishFactor) * pt)) / f(f(size * f(0.5)) + 1));
    const k = f(1 / f(squish + 1));
    GL.scale(f(k * size), f(f(1 / k) * size), f(k * size));
  }
}
