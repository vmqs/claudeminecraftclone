import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import { GL } from '../gl/GL';
import { ModelBase } from './ModelBase';
import { ModelRenderer } from './ModelRenderer';

const f = Math.fround;
const PI_F = f(Math.PI);
const RAD = f(180 / PI_F);

/**
 * Four-legged animals (ModelQuadruped): head, body turned 90 degrees, legs of `legHeight`
 * pixels swinging in opposite pairs. Babies draw the head at full size, moved by
 * (childYOffset, childZOffset) pixels, and the rest at half size.
 */
export class ModelQuadruped extends ModelBase {
  head: ModelRenderer;
  body: ModelRenderer;
  leg1: ModelRenderer;
  leg2: ModelRenderer;
  leg3: ModelRenderer;
  leg4: ModelRenderer;
  /** field_78145_g / field_78151_h */
  protected childYOffset = 8;
  protected childZOffset = 4;

  constructor(legHeight: number, grow: number) {
    super();
    this.head = new ModelRenderer(this, 0, 0);
    this.head.addBox(-4, -4, -8, 8, 8, 8, grow);
    this.head.setRotationPoint(0, 18 - legHeight, -6);
    this.body = new ModelRenderer(this, 28, 8);
    this.body.addBox(-5, -10, -7, 10, 16, 8, grow);
    this.body.setRotationPoint(0, 17 - legHeight, 2);
    this.leg1 = new ModelRenderer(this, 0, 16);
    this.leg1.addBox(-2, 0, -2, 4, legHeight, 4, grow);
    this.leg1.setRotationPoint(-3, 24 - legHeight, 7);
    this.leg2 = new ModelRenderer(this, 0, 16);
    this.leg2.addBox(-2, 0, -2, 4, legHeight, 4, grow);
    this.leg2.setRotationPoint(3, 24 - legHeight, 7);
    this.leg3 = new ModelRenderer(this, 0, 16);
    this.leg3.addBox(-2, 0, -2, 4, legHeight, 4, grow);
    this.leg3.setRotationPoint(-3, 24 - legHeight, -5);
    this.leg4 = new ModelRenderer(this, 0, 16);
    this.leg4.addBox(-2, 0, -2, 4, legHeight, 4, grow);
    this.leg4.setRotationPoint(3, 24 - legHeight, -5);
  }

  override render(e: Entity | null, limbSwing: number, limbAmount: number, age: number, headYaw: number, headPitch: number, scale: number): void {
    this.setRotationAngles(limbSwing, limbAmount, age, headYaw, headPitch, scale, e);
    if (this.isChild) {
      const d = 2;
      GL.pushMatrix();
      GL.translate(0, f(this.childYOffset * scale), f(this.childZOffset * scale));
      this.head.render(scale);
      GL.popMatrix();
      GL.pushMatrix();
      GL.scale(1 / d, 1 / d, 1 / d);
      GL.translate(0, f(24 * scale), 0);
      this.body.render(scale);
      this.leg1.render(scale);
      this.leg2.render(scale);
      this.leg3.render(scale);
      this.leg4.render(scale);
      GL.popMatrix();
    } else {
      this.head.render(scale);
      this.body.render(scale);
      this.leg1.render(scale);
      this.leg2.render(scale);
      this.leg3.render(scale);
      this.leg4.render(scale);
    }
  }

  override setRotationAngles(limbSwing: number, limbAmount: number, _age: number, headYaw: number, headPitch: number, _scale: number, _e: Entity | null): void {
    this.head.rotateAngleX = f(headPitch / RAD);
    this.head.rotateAngleY = f(headYaw / RAD);
    this.body.rotateAngleX = f(PI_F / 2);
    const a = f(limbSwing * f(0.6662));
    this.leg1.rotateAngleX = f(f(MathHelper.cos(a) * f(1.4)) * limbAmount);
    this.leg2.rotateAngleX = f(f(MathHelper.cos(f(a + PI_F)) * f(1.4)) * limbAmount);
    this.leg3.rotateAngleX = f(f(MathHelper.cos(f(a + PI_F)) * f(1.4)) * limbAmount);
    this.leg4.rotateAngleX = f(f(MathHelper.cos(a) * f(1.4)) * limbAmount);
  }
}
