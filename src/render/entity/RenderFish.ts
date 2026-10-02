import { MathHelper } from '../../core/MathHelper';
import { Vec3 } from '../../core/Vec3';
import type { Entity } from '../../entity/Entity';
import type { EntityFishHook } from '../../entity/EntityFishHook';
import { GL } from '../gl/GL';
import { Tessellator } from '../gl/Tessellator';
import { Render } from './Render';

const f = Math.fround;
const PI_F = f(Math.PI);
const LINE_STRIP = 3;

/**
 * RenderFish: the bobber sprite (particles.png cell 1,2) facing the camera, and the black line
 * sagging in a parabola from the rod tip (in front of the camera in first person, at the
 * player's hand otherwise) down to the bobber.
 */
export class RenderFish extends Render {
  doRender(e: Entity, x: number, y: number, z: number, _yaw: number, pt: number): void {
    const hook = e as EntityFishHook;
    GL.pushMatrix();
    GL.translate(f(x), f(y), f(z));
    GL.enable(GL.RESCALE_NORMAL);
    GL.scale(0.5, 0.5, 0.5);
    const cx = 1;
    const cy = 2;
    this.loadTexture('/particles.png');
    const t = Tessellator.instance;
    const u0 = f((cx * 8 + 0) / 128);
    const u1 = f((cx * 8 + 8) / 128);
    const v0 = f((cy * 8 + 0) / 128);
    const v1 = f((cy * 8 + 8) / 128);
    const hx = f(0.5);
    const hy = f(0.5);
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

    const a = hook.angler;
    if (!a) return;
    const swing = a.getSwingProgress(pt);
    const s = MathHelper.sin(f(MathHelper.sqrt_float(swing) * PI_F));
    const tip = new Vec3(-0.5, 0.03, 0.8);
    tip.rotateAroundX(f(f(f(-(a.prevRotationPitch + (a.rotationPitch - a.prevRotationPitch) * pt)) * PI_F) / 180));
    tip.rotateAroundY(f(f(f(-(a.prevRotationYaw + (a.rotationYaw - a.prevRotationYaw) * pt)) * PI_F) / 180));
    tip.rotateAroundY(f(s * f(0.5)));
    tip.rotateAroundX(f(-s * f(0.7)));
    let ax = a.prevPosX + (a.posX - a.prevPosX) * pt + tip.xCoord;
    let ay = a.prevPosY + (a.posY - a.prevPosY) * pt + tip.yCoord;
    let az = a.prevPosZ + (a.posZ - a.prevPosZ) * pt + tip.zCoord;
    const isViewer = a === this.renderManager.livingPlayer;
    const eye = isViewer ? 0 : a.getEyeHeight();
    if ((this.renderManager.options?.thirdPersonView ?? 0) > 0 || !isViewer) {
      const body = f(f(f(a.prevRenderYawOffset + (a.renderYawOffset - a.prevRenderYawOffset) * pt) * PI_F) / 180);
      const bs = MathHelper.sin(body);
      const bc = MathHelper.cos(body);
      ax = a.prevPosX + (a.posX - a.prevPosX) * pt - bc * 0.35 - bs * 0.85;
      ay = a.prevPosY + eye + (a.posY - a.prevPosY) * pt - 0.45;
      az = a.prevPosZ + (a.posZ - a.prevPosZ) * pt - bs * 0.35 + bc * 0.85;
    }
    const hxw = hook.prevPosX + (hook.posX - hook.prevPosX) * pt;
    const hyw = hook.prevPosY + (hook.posY - hook.prevPosY) * pt + 0.25;
    const hzw = hook.prevPosZ + (hook.posZ - hook.prevPosZ) * pt;
    const dx = f(ax - hxw);
    const dy = f(ay - hyw);
    const dz = f(az - hzw);
    GL.disable(GL.TEXTURE_2D);
    GL.disable(GL.LIGHTING);
    t.startDrawing(LINE_STRIP);
    t.setColorOpaque_I(0);
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const k = f(i / n);
      t.addVertex(x + dx * k, y + dy * f(k * k + k) * 0.5 + 0.25, z + dz * k);
    }
    t.draw();
    GL.enable(GL.LIGHTING);
    GL.enable(GL.TEXTURE_2D);
  }
}
