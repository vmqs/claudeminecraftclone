import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import { GL } from '../gl/GL';
import { ModelBase } from './ModelBase';
import { ModelRenderer } from './ModelRenderer';

const f = Math.fround;
const PI_F = f(Math.PI);
const RAD = f(180 / PI_F);

/** The humanoid model (players, zombies, skeletons...). */
export class ModelBiped extends ModelBase {
  readonly bipedHead: ModelRenderer;
  readonly bipedHeadwear: ModelRenderer;
  readonly bipedBody: ModelRenderer;
  readonly bipedRightArm: ModelRenderer;
  readonly bipedLeftArm: ModelRenderer;
  readonly bipedRightLeg: ModelRenderer;
  readonly bipedLeftLeg: ModelRenderer;
  readonly bipedEars: ModelRenderer;
  readonly bipedCloak: ModelRenderer;
  heldItemLeft = 0;
  heldItemRight = 0;
  isSneak = false;
  aimedBow = false;

  constructor(grow = 0, yOffset = 0, texW = 64, texH = 32) {
    super();
    this.textureWidth = texW;
    this.textureHeight = texH;
    this.bipedCloak = new ModelRenderer(this, 0, 0);
    this.bipedCloak.addBox(-5, 0, -1, 10, 16, 1, grow);
    this.bipedEars = new ModelRenderer(this, 24, 0);
    this.bipedEars.addBox(-3, -6, -1, 6, 6, 1, grow);
    this.bipedHead = new ModelRenderer(this, 0, 0);
    this.bipedHead.addBox(-4, -8, -4, 8, 8, 8, grow);
    this.bipedHead.setRotationPoint(0, 0 + yOffset, 0);
    this.bipedHeadwear = new ModelRenderer(this, 32, 0);
    this.bipedHeadwear.addBox(-4, -8, -4, 8, 8, 8, f(grow + 0.5));
    this.bipedHeadwear.setRotationPoint(0, 0 + yOffset, 0);
    this.bipedBody = new ModelRenderer(this, 16, 16);
    this.bipedBody.addBox(-4, 0, -2, 8, 12, 4, grow);
    this.bipedBody.setRotationPoint(0, 0 + yOffset, 0);
    this.bipedRightArm = new ModelRenderer(this, 40, 16);
    this.bipedRightArm.addBox(-3, -2, -2, 4, 12, 4, grow);
    this.bipedRightArm.setRotationPoint(-5, 2 + yOffset, 0);
    this.bipedLeftArm = new ModelRenderer(this, 40, 16);
    this.bipedLeftArm.mirror = true;
    this.bipedLeftArm.addBox(-1, -2, -2, 4, 12, 4, grow);
    this.bipedLeftArm.setRotationPoint(5, 2 + yOffset, 0);
    this.bipedRightLeg = new ModelRenderer(this, 0, 16);
    this.bipedRightLeg.addBox(-2, 0, -2, 4, 12, 4, grow);
    this.bipedRightLeg.setRotationPoint(f(-1.9), 12 + yOffset, 0);
    this.bipedLeftLeg = new ModelRenderer(this, 0, 16);
    this.bipedLeftLeg.mirror = true;
    this.bipedLeftLeg.addBox(-2, 0, -2, 4, 12, 4, grow);
    this.bipedLeftLeg.setRotationPoint(f(1.9), 12 + yOffset, 0);
  }

  override render(e: Entity | null, limbSwing: number, limbAmount: number, age: number, headYaw: number, headPitch: number, scale: number): void {
    this.setRotationAngles(limbSwing, limbAmount, age, headYaw, headPitch, scale, e);
    if (this.isChild) {
      const d = 2;
      GL.pushMatrix();
      GL.scale(f(1.5 / d), f(1.5 / d), f(1.5 / d));
      GL.translate(0, 16 * scale, 0);
      this.bipedHead.render(scale);
      GL.popMatrix();
      GL.pushMatrix();
      GL.scale(1 / d, 1 / d, 1 / d);
      GL.translate(0, 24 * scale, 0);
      this.bipedBody.render(scale);
      this.bipedRightArm.render(scale);
      this.bipedLeftArm.render(scale);
      this.bipedRightLeg.render(scale);
      this.bipedLeftLeg.render(scale);
      this.bipedHeadwear.render(scale);
      GL.popMatrix();
    } else {
      this.bipedHead.render(scale);
      this.bipedBody.render(scale);
      this.bipedRightArm.render(scale);
      this.bipedLeftArm.render(scale);
      this.bipedRightLeg.render(scale);
      this.bipedLeftLeg.render(scale);
      this.bipedHeadwear.render(scale);
    }
  }

  override setRotationAngles(limbSwing: number, limbAmount: number, age: number, headYaw: number, headPitch: number, _scale: number, _e: Entity | null): void {
    const h = this.bipedHead;
    const ra = this.bipedRightArm;
    const la = this.bipedLeftArm;
    const rl = this.bipedRightLeg;
    const ll = this.bipedLeftLeg;
    const body = this.bipedBody;
    h.rotateAngleY = f(headYaw / RAD);
    h.rotateAngleX = f(headPitch / RAD);
    this.bipedHeadwear.rotateAngleY = h.rotateAngleY;
    this.bipedHeadwear.rotateAngleX = h.rotateAngleX;
    ra.rotateAngleX = f(f(f(MathHelper.cos(f(f(limbSwing * f(0.6662)) + PI_F)) * 2) * limbAmount) * f(0.5));
    la.rotateAngleX = f(f(f(MathHelper.cos(f(limbSwing * f(0.6662))) * 2) * limbAmount) * f(0.5));
    ra.rotateAngleZ = 0;
    la.rotateAngleZ = 0;
    rl.rotateAngleX = f(f(MathHelper.cos(f(limbSwing * f(0.6662))) * f(1.4)) * limbAmount);
    ll.rotateAngleX = f(f(MathHelper.cos(f(f(limbSwing * f(0.6662)) + PI_F)) * f(1.4)) * limbAmount);
    rl.rotateAngleY = 0;
    ll.rotateAngleY = 0;
    if (this.isRiding) {
      ra.rotateAngleX = f(ra.rotateAngleX + f(-Math.PI / 5));
      la.rotateAngleX = f(la.rotateAngleX + f(-Math.PI / 5));
      rl.rotateAngleX = f((-Math.PI * 2) / 5);
      ll.rotateAngleX = f((-Math.PI * 2) / 5);
      rl.rotateAngleY = f(Math.PI / 10);
      ll.rotateAngleY = f(-Math.PI / 10);
    }
    if (this.heldItemLeft !== 0) la.rotateAngleX = f(f(la.rotateAngleX * f(0.5)) - f(f(Math.PI / 10) * this.heldItemLeft));
    if (this.heldItemRight !== 0) ra.rotateAngleX = f(f(ra.rotateAngleX * f(0.5)) - f(f(Math.PI / 10) * this.heldItemRight));
    ra.rotateAngleY = 0;
    la.rotateAngleY = 0;
    if (this.onGround > -9990) {
      let s = this.onGround;
      body.rotateAngleY = f(MathHelper.sin(f(f(MathHelper.sqrt_float(s) * PI_F) * 2)) * f(0.2));
      ra.rotationPointZ = f(MathHelper.sin(body.rotateAngleY) * 5);
      ra.rotationPointX = f(-MathHelper.cos(body.rotateAngleY) * 5);
      la.rotationPointZ = f(-MathHelper.sin(body.rotateAngleY) * 5);
      la.rotationPointX = f(MathHelper.cos(body.rotateAngleY) * 5);
      ra.rotateAngleY = f(ra.rotateAngleY + body.rotateAngleY);
      la.rotateAngleY = f(la.rotateAngleY + body.rotateAngleY);
      la.rotateAngleX = f(la.rotateAngleX + body.rotateAngleY);
      s = f(1 - this.onGround);
      s = f(s * s);
      s = f(s * s);
      s = f(1 - s);
      const a = MathHelper.sin(f(s * PI_F));
      const b = f(f(MathHelper.sin(f(this.onGround * PI_F)) * -f(h.rotateAngleX - f(0.7))) * f(0.75));
      ra.rotateAngleX = f(ra.rotateAngleX - (a * 1.2 + b));
      ra.rotateAngleY = f(ra.rotateAngleY + f(body.rotateAngleY * 2));
      ra.rotateAngleZ = f(MathHelper.sin(f(this.onGround * PI_F)) * f(-0.4));
    }
    if (this.isSneak) {
      body.rotateAngleX = f(0.5);
      ra.rotateAngleX = f(ra.rotateAngleX + f(0.4));
      la.rotateAngleX = f(la.rotateAngleX + f(0.4));
      rl.rotationPointZ = 4;
      ll.rotationPointZ = 4;
      rl.rotationPointY = 9;
      ll.rotationPointY = 9;
      h.rotationPointY = 1;
      this.bipedHeadwear.rotationPointY = 1;
    } else {
      body.rotateAngleX = 0;
      rl.rotationPointZ = f(0.1);
      ll.rotationPointZ = f(0.1);
      rl.rotationPointY = 12;
      ll.rotationPointY = 12;
      h.rotationPointY = 0;
      this.bipedHeadwear.rotationPointY = 0;
    }
    const sway = f(f(MathHelper.cos(f(age * f(0.09))) * f(0.05)) + f(0.05));
    const nod = f(MathHelper.sin(f(age * f(0.067))) * f(0.05));
    ra.rotateAngleZ = f(ra.rotateAngleZ + sway);
    la.rotateAngleZ = f(la.rotateAngleZ - sway);
    ra.rotateAngleX = f(ra.rotateAngleX + nod);
    la.rotateAngleX = f(la.rotateAngleX - nod);
    if (this.aimedBow) {
      ra.rotateAngleZ = 0;
      la.rotateAngleZ = 0;
      ra.rotateAngleY = f(-f(0.1) + h.rotateAngleY);
      la.rotateAngleY = f(f(0.1) + h.rotateAngleY + f(0.4));
      ra.rotateAngleX = f(f(-Math.PI / 2) + h.rotateAngleX);
      la.rotateAngleX = f(f(-Math.PI / 2) + h.rotateAngleX);
      ra.rotateAngleZ = f(ra.rotateAngleZ + sway);
      la.rotateAngleZ = f(la.rotateAngleZ - sway);
      ra.rotateAngleX = f(ra.rotateAngleX + nod);
      la.rotateAngleX = f(la.rotateAngleX - nod);
    }
  }

  renderEars(scale: number): void {
    this.bipedEars.rotateAngleY = this.bipedHead.rotateAngleY;
    this.bipedEars.rotateAngleX = this.bipedHead.rotateAngleX;
    this.bipedEars.rotationPointX = 0;
    this.bipedEars.rotationPointY = 0;
    this.bipedEars.render(scale);
  }

  renderCloak(scale: number): void {
    this.bipedCloak.render(scale);
  }
}
