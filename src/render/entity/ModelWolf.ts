import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import type { EntityLiving } from '../../entity/EntityLiving';
import type { EntityWolf } from '../../entity/EntityWolf';
import { GL } from '../gl/GL';
import { ModelBase } from './ModelBase';
import { ModelRenderer } from './ModelRenderer';

const f = Math.fround;
const PI_F = f(Math.PI);
const RAD = f(180 / PI_F);

/**
 * The wolf (ModelWolf): head with ears and snout (tilted while begging or shaking), mane, body,
 * legs and a tail whose angle comes in through the age argument (RenderWolf passes the health-
 * based tail rotation); a sitting pose.
 */
export class ModelWolf extends ModelBase {
  readonly wolfHeadMain: ModelRenderer;
  readonly wolfBody: ModelRenderer;
  readonly wolfLeg1: ModelRenderer;
  readonly wolfLeg2: ModelRenderer;
  readonly wolfLeg3: ModelRenderer;
  readonly wolfLeg4: ModelRenderer;
  readonly wolfTail: ModelRenderer;
  readonly wolfMane: ModelRenderer;

  constructor() {
    super();
    const grow = 0;
    const headY = f(13.5);
    this.wolfHeadMain = new ModelRenderer(this, 0, 0);
    this.wolfHeadMain.addBox(-3, -3, -2, 6, 6, 4, grow);
    this.wolfHeadMain.setRotationPoint(-1, headY, -7);
    this.wolfBody = new ModelRenderer(this, 18, 14);
    this.wolfBody.addBox(-4, -2, -3, 6, 9, 6, grow);
    this.wolfBody.setRotationPoint(0, 14, 2);
    this.wolfMane = new ModelRenderer(this, 21, 0);
    this.wolfMane.addBox(-4, -3, -3, 8, 6, 7, grow);
    this.wolfMane.setRotationPoint(-1, 14, 2);
    this.wolfLeg1 = new ModelRenderer(this, 0, 18);
    this.wolfLeg1.addBox(-1, 0, -1, 2, 8, 2, grow);
    this.wolfLeg1.setRotationPoint(f(-2.5), 16, 7);
    this.wolfLeg2 = new ModelRenderer(this, 0, 18);
    this.wolfLeg2.addBox(-1, 0, -1, 2, 8, 2, grow);
    this.wolfLeg2.setRotationPoint(f(0.5), 16, 7);
    this.wolfLeg3 = new ModelRenderer(this, 0, 18);
    this.wolfLeg3.addBox(-1, 0, -1, 2, 8, 2, grow);
    this.wolfLeg3.setRotationPoint(f(-2.5), 16, -4);
    this.wolfLeg4 = new ModelRenderer(this, 0, 18);
    this.wolfLeg4.addBox(-1, 0, -1, 2, 8, 2, grow);
    this.wolfLeg4.setRotationPoint(f(0.5), 16, -4);
    this.wolfTail = new ModelRenderer(this, 9, 18);
    this.wolfTail.addBox(-1, 0, -1, 2, 8, 2, grow);
    this.wolfTail.setRotationPoint(-1, 12, 8);
    this.wolfHeadMain.setTextureOffset(16, 14).addBox(-3, -5, 0, 2, 2, 1, grow);
    this.wolfHeadMain.setTextureOffset(16, 14).addBox(1, -5, 0, 2, 2, 1, grow);
    this.wolfHeadMain.setTextureOffset(0, 10).addBox(f(-1.5), 0, -5, 3, 3, 4, grow);
  }

  override render(e: Entity | null, ls: number, la: number, age: number, yaw: number, pitch: number, scale: number): void {
    super.render(e, ls, la, age, yaw, pitch, scale);
    this.setRotationAngles(ls, la, age, yaw, pitch, scale, e);
    if (this.isChild) {
      const d = 2;
      GL.pushMatrix();
      GL.translate(0, f(5 * scale), f(2 * scale));
      this.wolfHeadMain.renderWithRotation(scale);
      GL.popMatrix();
      GL.pushMatrix();
      GL.scale(1 / d, 1 / d, 1 / d);
      GL.translate(0, f(24 * scale), 0);
      this.wolfBody.render(scale);
      this.wolfLeg1.render(scale);
      this.wolfLeg2.render(scale);
      this.wolfLeg3.render(scale);
      this.wolfLeg4.render(scale);
      this.wolfTail.renderWithRotation(scale);
      this.wolfMane.render(scale);
      GL.popMatrix();
    } else {
      this.wolfHeadMain.renderWithRotation(scale);
      this.wolfBody.render(scale);
      this.wolfLeg1.render(scale);
      this.wolfLeg2.render(scale);
      this.wolfLeg3.render(scale);
      this.wolfLeg4.render(scale);
      this.wolfTail.renderWithRotation(scale);
      this.wolfMane.render(scale);
    }
  }

  override setLivingAnimations(e: EntityLiving, ls: number, la: number, pt: number): void {
    const wolf = e as EntityWolf;
    const a = f(ls * f(0.6662));
    this.wolfTail.rotateAngleY = wolf.isAngry() ? 0 : f(f(MathHelper.cos(a) * f(1.4)) * la);
    if (wolf.isSitting()) {
      this.wolfMane.setRotationPoint(-1, 16, -3);
      this.wolfMane.rotateAngleX = f((Math.PI * 2) / 5);
      this.wolfMane.rotateAngleY = 0;
      this.wolfBody.setRotationPoint(0, 18, 0);
      this.wolfBody.rotateAngleX = f(Math.PI / 4);
      this.wolfTail.setRotationPoint(-1, 21, 6);
      this.wolfLeg1.setRotationPoint(f(-2.5), 22, 2);
      this.wolfLeg1.rotateAngleX = f((Math.PI * 3) / 2);
      this.wolfLeg2.setRotationPoint(f(0.5), 22, 2);
      this.wolfLeg2.rotateAngleX = f((Math.PI * 3) / 2);
      this.wolfLeg3.rotateAngleX = f(5.811947);
      this.wolfLeg3.setRotationPoint(f(-2.49), 17, -4);
      this.wolfLeg4.rotateAngleX = f(5.811947);
      this.wolfLeg4.setRotationPoint(f(0.51), 17, -4);
    } else {
      this.wolfBody.setRotationPoint(0, 14, 2);
      this.wolfBody.rotateAngleX = f(Math.PI / 2);
      this.wolfMane.setRotationPoint(-1, 14, -3);
      this.wolfMane.rotateAngleX = this.wolfBody.rotateAngleX;
      this.wolfTail.setRotationPoint(-1, 12, 8);
      this.wolfLeg1.setRotationPoint(f(-2.5), 16, 7);
      this.wolfLeg2.setRotationPoint(f(0.5), 16, 7);
      this.wolfLeg3.setRotationPoint(f(-2.5), 16, -4);
      this.wolfLeg4.setRotationPoint(f(0.5), 16, -4);
      this.wolfLeg1.rotateAngleX = f(f(MathHelper.cos(a) * f(1.4)) * la);
      this.wolfLeg2.rotateAngleX = f(f(MathHelper.cos(f(a + PI_F)) * f(1.4)) * la);
      this.wolfLeg3.rotateAngleX = f(f(MathHelper.cos(f(a + PI_F)) * f(1.4)) * la);
      this.wolfLeg4.rotateAngleX = f(f(MathHelper.cos(a) * f(1.4)) * la);
    }
    this.wolfHeadMain.rotateAngleZ = f(wolf.getInterestedAngle(pt) + wolf.getShakeAngle(pt, 0));
    this.wolfMane.rotateAngleZ = wolf.getShakeAngle(pt, f(-0.08));
    this.wolfBody.rotateAngleZ = wolf.getShakeAngle(pt, f(-0.16));
    this.wolfTail.rotateAngleZ = wolf.getShakeAngle(pt, f(-0.2));
  }

  override setRotationAngles(ls: number, la: number, age: number, yaw: number, pitch: number, scale: number, e: Entity | null): void {
    super.setRotationAngles(ls, la, age, yaw, pitch, scale, e);
    this.wolfHeadMain.rotateAngleX = f(pitch / RAD);
    this.wolfHeadMain.rotateAngleY = f(yaw / RAD);
    this.wolfTail.rotateAngleX = age;
  }
}
