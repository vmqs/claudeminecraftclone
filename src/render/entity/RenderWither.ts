import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import type { EntityLiving } from '../../entity/EntityLiving';
import type { EntityWither } from '../../entity/EntityWither';
import { BossStatus } from '../../gui/BossStatus';
import { GL } from '../gl/GL';
import { SkyHooks } from '../sky/SkyHooks';
import { ModelWither } from './ModelWither';
import { RenderLiving } from './RenderLiving';

const f = Math.fround;

/**
 * RenderWither: the boss bar (and the darkened sky it brings), twice the model's size (growing
 * from 1.5 while it charges up), the blue texture while invulnerable and, below half health, the
 * scrolling armour layer (/armor/witherarmor.png) drawn additively around it.
 */
export class RenderWither extends RenderLiving {
  constructor() {
    super(new ModelWither(), 1);
  }

  override doRender(e: Entity, x: number, y: number, z: number, yaw: number, pt: number): void {
    BossStatus.setBossStatus(e as EntityWither, true);
    SkyHooks.hasColorModifier = true;
    this.doRenderLiving(e as EntityWither, x, y, z, yaw, pt);
  }

  /** func_82415_a */
  protected override preRenderCallback(e: EntityLiving, pt: number): void {
    const t = (e as EntityWither).getInvulTime();
    if (t > 0) {
      const s = f(2 - f(f(f(t - pt) / 220) * f(0.5)));
      GL.scale(s, s, s);
    } else {
      GL.scale(2, 2, 2);
    }
  }

  /** func_82417_a: the armour layer from pass 1, cleaned up at pass 2. */
  protected override shouldRenderPass(e: EntityLiving, pass: number, pt: number): number {
    const w = e as EntityWither;
    if (!w.isArmored()) return -1;
    GL.depthMask(!w.isInvisible());
    if (pass === 1) {
      const t = f(w.ticksExisted + pt);
      this.loadTexture('/armor/witherarmor.png');
      GL.matrixMode(GL.TEXTURE);
      GL.loadIdentity();
      const u = f(MathHelper.cos(f(t * f(0.02))) * 3);
      const v = f(t * f(0.01));
      GL.translate(u, v, 0);
      this.setRenderPassModel(this.mainModel);
      GL.matrixMode(GL.MODELVIEW);
      GL.enable(GL.BLEND);
      const k = f(0.5);
      GL.color(k, k, k, 1);
      GL.disable(GL.LIGHTING);
      GL.blendFunc(GL.ONE, GL.ONE);
      GL.translate(0, f(-0.01), 0);
      GL.scale(f(1.1), f(1.1), f(1.1));
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

  /** func_82416_b: the hurt tint skips the armour. */
  protected override inheritRenderPass(_e: EntityLiving, _pass: number, _pt: number): number {
    return -1;
  }
}
