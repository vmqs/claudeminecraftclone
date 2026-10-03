import { JavaRandom } from '../../core/JavaRandom';
import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import type { EntityLiving } from '../../entity/EntityLiving';
import { EntityList } from '../../entity/EntityList';
import { GL } from '../gl/GL';
import { Tessellator } from '../gl/Tessellator';
import { OpenGlHelper } from '../OpenGlHelper';
import { RenderHelper } from '../RenderHelper';
import type { ModelBase } from './ModelBase';
import { Render } from './Render';

const f = Math.fround;
const SCALE = f(0.0625);

/**
 * Living-entity renderer (RenderLiving): interpolated body/head yaw, the death tilt, model
 * render passes (armour, saddles, sheep wool...) with optional enchantment glint, the red
 * hurt/death tint and the colour multiplier overlay, and name tags.
 *
 * Subclass hooks, as in 1.5.2: shouldRenderPass / renderOverlayPass (second layer) /
 * inheritRenderPass, preRenderCallback (scaling), renderEquippedItems, rotateCorpse,
 * renderLivingAt, getColorMultiplier, getDeathMaxRotation, handleRotationFloat.
 */
export class RenderLiving extends Render {
  protected renderPassModel: ModelBase | null = null;

  constructor(
    protected mainModel: ModelBase,
    shadowSize: number,
  ) {
    super();
    this.shadowSize = shadowSize;
  }

  setRenderPassModel(m: ModelBase | null): void {
    this.renderPassModel = m;
  }

  private interpolateRotation(a: number, b: number, pt: number): number {
    let d = b - a;
    while (d < -180) d += 360;
    while (d >= 180) d -= 360;
    return f(a + pt * d);
  }

  doRender(e: Entity, x: number, y: number, z: number, yaw: number, pt: number): void {
    this.doRenderLiving(e as EntityLiving, x, y, z, yaw, pt);
  }

  doRenderLiving(e: EntityLiving, x: number, y: number, z: number, _yaw: number, pt: number): void {
    GL.pushMatrix();
    GL.disable(GL.CULL_FACE);
    const models = this.renderPassModel ? [this.mainModel, this.renderPassModel] : [this.mainModel];
    const swing = this.renderSwingProgress(e, pt);
    for (const m of models) {
      m.onGround = swing;
      m.isRiding = e.isRiding();
      m.isChild = e.isChild();
    }
    try {
      const bodyYaw = this.interpolateRotation(e.prevRenderYawOffset, e.renderYawOffset, pt);
      const headYaw = this.interpolateRotation(e.prevRotationYawHead, e.rotationYawHead, pt);
      const pitch = f(e.prevRotationPitch + (e.rotationPitch - e.prevRotationPitch) * pt);
      this.renderLivingAt(e, x, y, z);
      const age = this.handleRotationFloat(e, pt);
      this.rotateCorpse(e, age, bodyYaw, pt);
      GL.enable(GL.RESCALE_NORMAL);
      GL.scale(-1, -1, 1);
      this.preRenderCallback(e, pt);
      GL.translate(0, f(f(-24 * SCALE) - f(0.0078125)), 0);
      let limbAmount = f(e.prevLimbYaw + (e.limbYaw - e.prevLimbYaw) * pt);
      let limbSwing = f(e.limbSwing - e.limbYaw * (1 - pt));
      if (e.isChild()) limbSwing = f(limbSwing * 3);
      if (limbAmount > 1) limbAmount = 1;
      const netHead = f(headYaw - bodyYaw);
      GL.enable(GL.ALPHA_TEST);
      this.mainModel.setLivingAnimations(e, limbSwing, limbAmount, pt);
      this.renderModel(e, limbSwing, limbAmount, age, netHead, pitch, SCALE);
      for (let pass = 0; pass < 4; pass++) {
        const flags = this.shouldRenderPass(e, pass, pt);
        if (flags <= 0) continue;
        const pm = this.renderPassModel!;
        pm.setLivingAnimations(e, limbSwing, limbAmount, pt);
        pm.render(e, limbSwing, limbAmount, age, netHead, pitch, SCALE);
        if ((flags & 0xf0) === 16) {
          this.renderOverlayPass(e, pass, pt);
          pm.render(e, limbSwing, limbAmount, age, netHead, pitch, SCALE);
        }
        if ((flags & 15) === 15) this.renderGlint(e, pm, limbSwing, limbAmount, age, netHead, pitch, pt);
        GL.disable(GL.BLEND);
        GL.enable(GL.ALPHA_TEST);
      }
      GL.depthMask(true);
      this.renderEquippedItems(e, pt);
      const brightness = e.getBrightness(pt);
      const mul = this.getColorMultiplier(e, brightness, pt);
      OpenGlHelper.setActiveTexture(OpenGlHelper.lightmapTexUnit);
      GL.disable(GL.TEXTURE_2D);
      OpenGlHelper.setActiveTexture(OpenGlHelper.defaultTexUnit);
      if (((mul >> 24) & 255) > 0 || e.hurtTime > 0 || e.deathTime > 0) {
        GL.disable(GL.TEXTURE_2D);
        GL.disable(GL.ALPHA_TEST);
        GL.enable(GL.BLEND);
        GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
        GL.depthFunc(GL.EQUAL);
        if (e.hurtTime > 0 || e.deathTime > 0) this.renderTinted(e, brightness, 0, 0, f(0.4), limbSwing, limbAmount, age, netHead, pitch, pt);
        if (((mul >> 24) & 255) > 0) {
          this.renderTinted(e, ((mul >> 16) & 255) / 255, ((mul >> 8) & 255) / 255, (mul & 255) / 255, ((mul >> 24) & 255) / 255, limbSwing, limbAmount, age, netHead, pitch, pt);
        }
        GL.depthFunc(GL.LEQUAL);
        GL.disable(GL.BLEND);
        GL.enable(GL.ALPHA_TEST);
        GL.enable(GL.TEXTURE_2D);
      }
      GL.disable(GL.RESCALE_NORMAL);
    } catch (err) {
      console.error(err);
    }
    OpenGlHelper.setActiveTexture(OpenGlHelper.lightmapTexUnit);
    GL.enable(GL.TEXTURE_2D);
    OpenGlHelper.setActiveTexture(OpenGlHelper.defaultTexUnit);
    GL.enable(GL.CULL_FACE);
    GL.popMatrix();
    this.passSpecialRender(e, x, y, z);
  }

  /** The model again in a flat colour over the textured one (depth EQUAL). */
  private renderTinted(e: EntityLiving, r: number, g: number, b: number, a: number, ls: number, la: number, age: number, head: number, pitch: number, pt: number): void {
    GL.color(r, g, b, a);
    this.mainModel.render(e, ls, la, age, head, pitch, SCALE);
    for (let pass = 0; pass < 4; pass++) {
      if (this.inheritRenderPass(e, pass, pt) < 0) continue;
      GL.color(r, g, b, a);
      this.renderPassModel!.render(e, ls, la, age, head, pitch, SCALE);
    }
  }

  /** The scrolling purple enchantment shine over a render pass. */
  private renderGlint(e: EntityLiving, m: ModelBase, ls: number, la: number, age: number, head: number, pitch: number, pt: number): void {
    const time = f(e.ticksExisted + pt);
    this.loadTexture('%blur%/misc/glint.png');
    GL.enable(GL.BLEND);
    GL.color(0.5, 0.5, 0.5, 1);
    GL.depthFunc(GL.EQUAL);
    GL.depthMask(false);
    for (let i = 0; i < 2; i++) {
      GL.disable(GL.LIGHTING);
      const k = f(0.76);
      GL.color(f(0.5 * k), f(0.25 * k), f(0.8 * k), 1);
      GL.blendFunc(GL.SRC_COLOR, GL.ONE);
      GL.matrixMode(GL.TEXTURE);
      GL.loadIdentity();
      const scroll = f(f(time * f(f(0.001) + f(i * f(0.003)))) * 20);
      const s = f(0.33333334);
      GL.scale(s, s, s);
      GL.rotate(30 - i * 60, 0, 0, 1);
      GL.translate(0, scroll, 0);
      GL.matrixMode(GL.MODELVIEW);
      m.render(e, ls, la, age, head, pitch, SCALE);
    }
    GL.color(1, 1, 1, 1);
    GL.matrixMode(GL.TEXTURE);
    GL.depthMask(true);
    GL.loadIdentity();
    GL.matrixMode(GL.MODELVIEW);
    GL.enable(GL.LIGHTING);
    GL.disable(GL.BLEND);
    GL.depthFunc(GL.LEQUAL);
  }

  /** Binds the texture and draws the main model (ghostly when invisible). */
  protected renderModel(e: EntityLiving, ls: number, la: number, age: number, head: number, pitch: number, scale: number): void {
    this.bindEntityTexture(e);
    if (!e.isInvisible()) {
      this.mainModel.render(e, ls, la, age, head, pitch, scale);
    } else if (!this.isVisibleToViewer(e)) {
      GL.pushMatrix();
      GL.color(1, 1, 1, f(0.15));
      GL.depthMask(false);
      GL.enable(GL.BLEND);
      GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
      GL.alphaFunc(GL.GREATER, f(0.003921569));
      this.mainModel.render(e, ls, la, age, head, pitch, scale);
      GL.disable(GL.BLEND);
      GL.alphaFunc(GL.GREATER, f(0.1));
      GL.popMatrix();
      GL.depthMask(true);
    } else {
      this.mainModel.setRotationAngles(ls, la, age, head, pitch, scale, e);
    }
  }

  /** func_98034_c: invisible entities stay hidden from this viewer (team mates see them faintly). */
  protected isVisibleToViewer(_e: EntityLiving): boolean {
    return true;
  }

  /** func_98190_a */
  protected bindEntityTexture(e: EntityLiving): void {
    this.loadTexture(e.getTexture());
  }

  protected renderLivingAt(_e: EntityLiving, x: number, y: number, z: number): void {
    GL.translate(f(x), f(y), f(z));
  }

  /** Faces the body yaw; dying entities tip over sideways during 20 ticks. */
  protected rotateCorpse(e: EntityLiving, _age: number, bodyYaw: number, pt: number): void {
    GL.rotate(f(180 - bodyYaw), 0, 1, 0);
    if (e.deathTime > 0) {
      let k = f(f(f(f(e.deathTime + pt) - 1) / 20) * f(1.6));
      k = MathHelper.sqrt_float(k);
      if (k > 1) k = 1;
      GL.rotate(f(k * this.getDeathMaxRotation(e)), 0, 0, 1);
    }
  }

  protected renderSwingProgress(e: EntityLiving, pt: number): number {
    return e.getSwingProgress(pt);
  }

  /** The model's animation clock (ticks + partial ticks). */
  protected handleRotationFloat(e: EntityLiving, pt: number): number {
    return f(e.ticksExisted + pt);
  }

  protected renderEquippedItems(_e: EntityLiving, _pt: number): void {}

  /** Arrows stuck in the model at random boxes (seeded by the entity id). */
  protected renderArrowsStuckInEntity(e: EntityLiving, pt: number): void {
    const n = e.getArrowCountInEntity();
    if (n <= 0 || this.mainModel.boxList.length === 0) return;
    const arrow = EntityList.createEntityByName('Arrow', e.worldObj);
    if (!arrow) return;
    arrow.setPosition(e.posX, e.posY, e.posZ);
    const rand = new JavaRandom(BigInt(e.entityId));
    RenderHelper.disableStandardItemLighting();
    for (let i = 0; i < n; i++) {
      GL.pushMatrix();
      const part = this.mainModel.getRandomModelBox(rand);
      if (part.cubeList.length === 0) {
        GL.popMatrix();
        continue;
      }
      const box = part.cubeList[rand.nextInt(part.cubeList.length)];
      part.postRender(SCALE);
      let rx = rand.nextFloat();
      let ry = rand.nextFloat();
      let rz = rand.nextFloat();
      GL.translate(f((box.posX1 + (box.posX2 - box.posX1) * rx) / 16), f((box.posY1 + (box.posY2 - box.posY1) * ry) / 16), f((box.posZ1 + (box.posZ2 - box.posZ1) * rz) / 16));
      rx = -f(rx * 2 - 1);
      ry = -f(ry * 2 - 1);
      rz = -f(rz * 2 - 1);
      const horiz = MathHelper.sqrt_float(f(rx * rx + rz * rz));
      arrow.prevRotationYaw = arrow.rotationYaw = f((Math.atan2(rx, rz) * 180) / f(Math.PI));
      arrow.prevRotationPitch = arrow.rotationPitch = f((Math.atan2(ry, horiz) * 180) / f(Math.PI));
      this.renderManager.renderEntityWithPosYaw(arrow, 0, 0, 0, 0, pt);
      GL.popMatrix();
    }
    RenderHelper.enableStandardItemLighting();
  }

  protected inheritRenderPass(e: EntityLiving, pass: number, pt: number): number {
    return this.shouldRenderPass(e, pass, pt);
  }

  /**
   * Extra model layers: return -1 to skip pass `pass` (0-3), otherwise bind its texture, set the
   * render-pass model and return flags (1 = draw, 15 = with glint, 16 = second layer, 31 = both).
   */
  protected shouldRenderPass(_e: EntityLiving, _pass: number, _pt: number): number {
    return -1;
  }

  /** Second layer of a pass (dyed leather overlay). */
  protected renderOverlayPass(_e: EntityLiving, _pass: number, _pt: number): void {}

  protected getDeathMaxRotation(_e: EntityLiving): number {
    return 90;
  }

  /** ARGB overlay colour (creeper flash), alpha 0 = none. */
  protected getColorMultiplier(_e: EntityLiving, _brightness: number, _pt: number): number {
    return 0;
  }

  /** Last transform before the model (scaling of slimes, ghasts, children...). */
  protected preRenderCallback(_e: EntityLiving, _pt: number): void {}

  /** Name tags of named mobs: always when set to, otherwise when looked at. */
  protected passSpecialRender(e: EntityLiving, x: number, y: number, z: number): void {
    const rm = this.renderManager;
    if (rm.options?.hideGUI || e === rm.livingPlayer || (e.isInvisible() && this.isVisibleToViewer(e))) return;
    if (!(e.getAlwaysRenderNameTag() || (e.hasCustomName() && e === rm.pointedEntity))) return;
    const scale = f(f(0.016666668) * f(1.6));
    const d2 = e.getDistanceSqToEntity(rm.livingPlayer!);
    const range = e.isSneaking() ? 32 : 64;
    if (d2 >= range * range) return;
    const name = this.getTranslatedEntityName(e);
    if (e.isSneaking()) {
      const fr = this.getFontRendererFromRenderManager();
      if (!fr) return;
      GL.pushMatrix();
      GL.translate(f(x), f(f(y) + e.height + f(0.5)), f(z));
      GL.normal(0, 1, 0);
      GL.rotate(-rm.playerViewY, 0, 1, 0);
      GL.rotate(rm.playerViewX, 1, 0, 0);
      GL.scale(-scale, -scale, scale);
      GL.disable(GL.LIGHTING);
      GL.translate(0, f(f(0.25) / scale), 0);
      GL.depthMask(false);
      GL.enable(GL.BLEND);
      GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
      this.drawLabelBackground(fr.getStringWidth(name), 0);
      GL.depthMask(true);
      fr.drawString(name, -Math.trunc(fr.getStringWidth(name) / 2), 0, 553648127);
      GL.enable(GL.LIGHTING);
      GL.disable(GL.BLEND);
      GL.color(1, 1, 1, 1);
      GL.popMatrix();
    } else {
      this.renderNameLabel(e, x, y, z, name, scale, d2);
    }
  }

  /** getTranslatedEntityName: the name shown above the entity (a player's carries its team's prefix and suffix). */
  protected getTranslatedEntityName(e: EntityLiving): string {
    return e.getEntityName();
  }

  /** func_96449_a: the floating name of an entity that is not sneaking (players add their score). */
  protected renderNameLabel(e: EntityLiving, x: number, y: number, z: number, name: string, _scale: number, _distSq: number): void {
    this.renderLivingLabel(e, name, x, e.isPlayerSleeping() ? y - 1.5 : y, z, 64);
  }

  private drawLabelBackground(width: number, yOff: number): void {
    const t = Tessellator.instance;
    const half = Math.trunc(width / 2);
    GL.disable(GL.TEXTURE_2D);
    t.startDrawingQuads();
    t.setColorRGBA_F(0, 0, 0, 0.25);
    t.addVertex(-half - 1, -1 + yOff, 0);
    t.addVertex(-half - 1, 8 + yOff, 0);
    t.addVertex(half + 1, 8 + yOff, 0);
    t.addVertex(half + 1, -1 + yOff, 0);
    t.draw();
    GL.enable(GL.TEXTURE_2D);
  }

  /** A floating name: a see-through pass behind blocks, then the opaque text. */
  protected renderLivingLabel(e: EntityLiving, text: string, x: number, y: number, z: number, maxDist: number): void {
    const rm = this.renderManager;
    const fr = this.getFontRendererFromRenderManager();
    if (!fr || !rm.livingPlayer || e.getDistanceSqToEntity(rm.livingPlayer) > maxDist * maxDist) return;
    const scale = f(f(0.016666668) * f(1.6));
    GL.pushMatrix();
    GL.translate(f(x), f(f(y) + e.height + f(0.5)), f(z));
    GL.normal(0, 1, 0);
    GL.rotate(-rm.playerViewY, 0, 1, 0);
    GL.rotate(rm.playerViewX, 1, 0, 0);
    GL.scale(-scale, -scale, scale);
    GL.disable(GL.LIGHTING);
    GL.depthMask(false);
    GL.disable(GL.DEPTH_TEST);
    GL.enable(GL.BLEND);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    const yOff = text === 'deadmau5' ? -10 : 0;
    this.drawLabelBackground(fr.getStringWidth(text), yOff);
    const x0 = -Math.trunc(fr.getStringWidth(text) / 2);
    fr.drawString(text, x0, yOff, 553648127);
    GL.enable(GL.DEPTH_TEST);
    GL.depthMask(true);
    fr.drawString(text, x0, yOff, -1);
    GL.enable(GL.LIGHTING);
    GL.disable(GL.BLEND);
    GL.color(1, 1, 1, 1);
    GL.popMatrix();
  }
}
