import { JavaRandom } from '../../core/JavaRandom';
import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import type { EntityDragon } from '../../entity/EntityDragon';
import type { EntityLiving } from '../../entity/EntityLiving';
import { BossStatus } from '../../gui/BossStatus';
import { GL } from '../gl/GL';
import { Tessellator } from '../gl/Tessellator';
import { RenderHelper } from '../RenderHelper';
import { SkyHooks } from '../sky/SkyHooks';
import { applyGlowingEyesLight } from './GlowingEyes';
import { ModelDragon } from './ModelDragon';
import { RenderLiving } from './RenderLiving';

const f = Math.fround;
const PI_F = f(Math.PI);

/**
 * RenderDragon: the boss bar, the body bent by the ring buffer, the glowing eyes layer, the red
 * hurt flash, the purple beam to the healing ender crystal, and while dying the light rays and
 * the model dissolving through /mob/enderdragon/shuffle.png.
 */
export class RenderDragon extends RenderLiving {
  constructor() {
    super(new ModelDragon(0), f(0.5));
    this.setRenderPassModel(this.mainModel);
  }

  override doRender(e: Entity, x: number, y: number, z: number, yaw: number, pt: number): void {
    const d = e as EntityDragon;
    BossStatus.setBossStatus(d, false);
    SkyHooks.hasColorModifier = false;
    this.doRenderLiving(d, x, y, z, yaw, pt);
    if (d.healingEnderCrystal) this.renderBeam(d, x, y, z, pt);
  }

  /** The beam from the dragon to the crystal healing it (beam.png on an 8-sided strip). */
  private renderBeam(d: EntityDragon, x: number, y: number, z: number, pt: number): void {
    const c = d.healingEnderCrystal!;
    const t = f(c.innerRotation + pt);
    let bob = f(f(MathHelper.sin(f(t * f(0.2))) / 2) + f(0.5));
    bob = f(f(f(bob * bob) + bob) * f(0.2));
    const dx = f(c.posX - d.posX - (d.prevPosX - d.posX) * f(1 - pt));
    const dy = f(bob + c.posY - 1 - d.posY - (d.prevPosY - d.posY) * f(1 - pt));
    const dz = f(c.posZ - d.posZ - (d.prevPosZ - d.posZ) * f(1 - pt));
    const horiz = MathHelper.sqrt_float(f(f(dx * dx) + f(dz * dz)));
    const len = MathHelper.sqrt_float(f(f(f(dx * dx) + f(dy * dy)) + f(dz * dz)));
    GL.pushMatrix();
    GL.translate(f(x), f(f(y) + 2), f(z));
    GL.rotate(f(f(f(f(-Math.atan2(dz, dx)) * 180) / PI_F) - 90), 0, 1, 0);
    GL.rotate(f(f(f(f(-Math.atan2(horiz, dy)) * 180) / PI_F) - 90), 1, 0, 0);
    const tess = Tessellator.instance;
    RenderHelper.disableStandardItemLighting();
    GL.disable(GL.CULL_FACE);
    this.loadTexture('/mob/enderdragon/beam.png');
    GL.shadeModel(GL.SMOOTH);
    const v0 = f(0 - f(f(d.ticksExisted + pt) * f(0.01)));
    const v1 = f(f(len / 32) - f(f(d.ticksExisted + pt) * f(0.01)));
    tess.startDrawing(GL.TRIANGLE_STRIP);
    const sides = 8;
    for (let i = 0; i <= sides; i++) {
      const a = f(f(f(f((i % sides) * PI_F) * 2)) / sides);
      const sx = f(MathHelper.sin(a) * f(0.75));
      const sy = f(MathHelper.cos(a) * f(0.75));
      const u = f(f((i % sides) * 1) / sides);
      tess.setColorOpaque_I(0);
      tess.addVertexWithUV(f(sx * f(0.2)), f(sy * f(0.2)), 0, u, v1);
      tess.setColorOpaque_I(0xffffff);
      tess.addVertexWithUV(sx, sy, len, u, v0);
    }
    tess.draw();
    GL.enable(GL.CULL_FACE);
    GL.shadeModel(GL.FLAT);
    RenderHelper.enableStandardItemLighting();
    GL.popMatrix();
  }

  /** rotateDragonBody: yaw and pitch from the ring buffer instead of the body yaw. */
  protected override rotateCorpse(e: EntityLiving, _age: number, _bodyYaw: number, pt: number): void {
    const d = e as EntityDragon;
    const yaw = f(d.getMovementOffsets(7, pt)[0]);
    const pitch = f(d.getMovementOffsets(5, pt)[1] - d.getMovementOffsets(10, pt)[1]);
    GL.rotate(-yaw, 0, 1, 0);
    GL.rotate(f(pitch * 10), 1, 0, 0);
    GL.translate(0, 0, 1);
    if (d.deathTime > 0) {
      let k = f(f(f(f(d.deathTime + pt) - 1) / 20) * f(1.6));
      k = MathHelper.sqrt_float(k);
      if (k > 1) k = 1;
      GL.rotate(f(k * this.getDeathMaxRotation(d)), 0, 0, 1);
    }
  }

  /** renderDragonModel: dissolving while dying, then the texture, then the red hurt flash. */
  protected override renderModel(e: EntityLiving, ls: number, la: number, age: number, head: number, pitch: number, scale: number): void {
    const d = e as EntityDragon;
    if (d.deathTicks > 0) {
      const fade = f(d.deathTicks / 200);
      GL.depthFunc(GL.LEQUAL);
      GL.enable(GL.ALPHA_TEST);
      GL.alphaFunc(GL.GREATER, fade);
      this.loadTexture('/mob/enderdragon/shuffle.png');
      this.mainModel.render(d, ls, la, age, head, pitch, scale);
      GL.alphaFunc(GL.GREATER, f(0.1));
      GL.depthFunc(GL.EQUAL);
    }
    this.loadTexture(d.getTexture());
    this.mainModel.render(d, ls, la, age, head, pitch, scale);
    if (d.hurtTime > 0) {
      GL.depthFunc(GL.EQUAL);
      GL.disable(GL.TEXTURE_2D);
      GL.enable(GL.BLEND);
      GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
      GL.color(1, 0, 0, f(0.5));
      this.mainModel.render(d, ls, la, age, head, pitch, scale);
      GL.enable(GL.TEXTURE_2D);
      GL.disable(GL.BLEND);
      GL.depthFunc(GL.LEQUAL);
    }
  }

  /** renderDragonDying: up to 60 fans of light bursting out of the body while it dies. */
  protected override renderEquippedItems(e: EntityLiving, pt: number): void {
    const d = e as EntityDragon;
    if (d.deathTicks <= 0) return;
    const tess = Tessellator.instance;
    RenderHelper.disableStandardItemLighting();
    const t = f(f(d.deathTicks + pt) / 200);
    let fadeOut = 0;
    if (t > f(0.8)) fadeOut = f(f(t - f(0.8)) / f(0.2));
    const rand = new JavaRandom(432n);
    GL.disable(GL.TEXTURE_2D);
    GL.shadeModel(GL.SMOOTH);
    GL.enable(GL.BLEND);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE);
    GL.disable(GL.ALPHA_TEST);
    GL.enable(GL.CULL_FACE);
    GL.depthMask(false);
    GL.pushMatrix();
    GL.translate(0, -1, -2);
    for (let i = 0; i < f(f(f(t + f(t * t)) / 2) * 60); i++) {
      GL.rotate(f(rand.nextFloat() * 360), 1, 0, 0);
      GL.rotate(f(rand.nextFloat() * 360), 0, 1, 0);
      GL.rotate(f(rand.nextFloat() * 360), 0, 0, 1);
      GL.rotate(f(rand.nextFloat() * 360), 1, 0, 0);
      GL.rotate(f(rand.nextFloat() * 360), 0, 1, 0);
      GL.rotate(f(f(rand.nextFloat() * 360) + f(t * 90)), 0, 0, 1);
      tess.startDrawing(GL.TRIANGLE_FAN);
      const length = f(f(f(rand.nextFloat() * 20) + 5) + f(fadeOut * 10));
      const width = f(f(f(rand.nextFloat() * 2) + 1) + f(fadeOut * 2));
      tess.setColorRGBA_I(0xffffff, Math.trunc(f(255 * f(1 - fadeOut))));
      tess.addVertex(0, 0, 0);
      tess.setColorRGBA_I(0xff00ff, 0);
      tess.addVertex(-0.866 * width, length, f(-0.5 * width));
      tess.addVertex(0.866 * width, length, f(-0.5 * width));
      tess.addVertex(0, length, f(1 * width));
      tess.addVertex(-0.866 * width, length, f(-0.5 * width));
      tess.draw();
    }
    GL.popMatrix();
    GL.depthMask(true);
    GL.disable(GL.CULL_FACE);
    GL.disable(GL.BLEND);
    GL.shadeModel(GL.FLAT);
    GL.color(1, 1, 1, 1);
    GL.enable(GL.TEXTURE_2D);
    GL.enable(GL.ALPHA_TEST);
    RenderHelper.enableStandardItemLighting();
  }

  /** renderGlow: the eyes texture added on top at full block light. */
  protected override shouldRenderPass(_e: EntityLiving, pass: number, _pt: number): number {
    if (pass === 1) GL.depthFunc(GL.LEQUAL);
    if (pass !== 0) return -1;
    this.loadTexture('/mob/enderdragon/ender_eyes.png');
    GL.enable(GL.BLEND);
    GL.disable(GL.ALPHA_TEST);
    GL.blendFunc(GL.ONE, GL.ONE);
    GL.disable(GL.LIGHTING);
    GL.depthFunc(GL.EQUAL);
    GL.enable(GL.LIGHTING);
    applyGlowingEyesLight();
    return 1;
  }
}
