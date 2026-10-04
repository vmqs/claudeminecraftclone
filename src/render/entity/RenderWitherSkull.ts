import type { Entity } from '../../entity/Entity';
import type { EntityWitherSkull } from '../../entity/EntityWitherSkull';
import { GL } from '../gl/GL';
import { ModelSkeletonHead } from './ModelSkeletonHead';
import { Render } from './Render';

const f = Math.fround;

/** RenderWitherSkull: the wither's head box, flying along its heading (blue when invulnerable). */
export class RenderWitherSkull extends Render {
  private readonly skeletonHeadModel = new ModelSkeletonHead();

  private interpolateYaw(a: number, b: number, pt: number): number {
    let d = f(b - a);
    while (d < -180) d = f(d + 360);
    while (d >= 180) d = f(d - 360);
    return f(a + f(pt * d));
  }

  doRender(e: Entity, x: number, y: number, z: number, _yaw: number, pt: number): void {
    const skull = e as EntityWitherSkull;
    GL.pushMatrix();
    GL.disable(GL.CULL_FACE);
    const yaw = this.interpolateYaw(skull.prevRotationYaw, skull.rotationYaw, pt);
    const pitch = f(skull.prevRotationPitch + f(f(skull.rotationPitch - skull.prevRotationPitch) * pt));
    GL.translate(f(x), f(y), f(z));
    const s = f(0.0625);
    GL.enable(GL.RESCALE_NORMAL);
    GL.scale(-1, -1, 1);
    GL.enable(GL.ALPHA_TEST);
    this.loadTexture(skull.isInvulnerable() ? '/mob/wither_invul.png' : '/mob/wither.png');
    this.skeletonHeadModel.render(skull, 0, 0, 0, yaw, pitch, s);
    // The original left face culling off here; restore it so the state does not leak.
    GL.enable(GL.CULL_FACE);
    GL.popMatrix();
  }
}
