import type { EntityLiving } from '../../entity/EntityLiving';
import type { EntitySpider } from '../../entity/EntitySpider';
import { GL } from '../gl/GL';
import { applyGlowingEyesLight } from './GlowingEyes';
import { ModelSpider } from './ModelSpider';
import { RenderLiving } from './RenderLiving';


/**
 * Spiders and cave spiders (RenderSpider): flip over on death (180 degrees), scaled by
 * spiderScaleAmount, with the eyes drawn additively at full brightness as pass 0 (tinted
 * by the hurt flash as well).
 */
export class RenderSpider extends RenderLiving {
  constructor() {
    super(new ModelSpider(), 1);
    this.setRenderPassModel(new ModelSpider());
  }

  protected override getDeathMaxRotation(_e: EntityLiving): number {
    return 180;
  }

  /** setSpiderEyeBrightness */
  protected override shouldRenderPass(e: EntityLiving, pass: number, _pt: number): number {
    if (pass !== 0) return -1;
    this.loadTexture('/mob/spider_eyes.png');
    GL.enable(GL.BLEND);
    GL.disable(GL.ALPHA_TEST);
    GL.blendFunc(GL.ONE, GL.ONE);
    GL.depthMask(!e.isInvisible());
    applyGlowingEyesLight();
    return 1;
  }

  /** scaleSpider */
  protected override preRenderCallback(e: EntityLiving, _pt: number): void {
    const s = (e as EntitySpider).spiderScaleAmount();
    GL.scale(s, s, s);
  }
}
