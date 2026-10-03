import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import { GL } from '../gl/GL';
import { ModelBase } from './ModelBase';
import { ModelRenderer } from './ModelRenderer';

const f = Math.fround;
const PI_F = f(Math.PI);
const RAD = f(180 / PI_F);

/** The chicken (ModelChicken): head with bill and wattle, wings flapped by the age argument. */
export class ModelChicken extends ModelBase {
  readonly head: ModelRenderer;
  readonly body: ModelRenderer;
  readonly rightLeg: ModelRenderer;
  readonly leftLeg: ModelRenderer;
  readonly rightWing: ModelRenderer;
  readonly leftWing: ModelRenderer;
  readonly bill: ModelRenderer;
  readonly chin: ModelRenderer;

  constructor() {
    super();
    const y = 16;
    this.head = new ModelRenderer(this, 0, 0);
    this.head.addBox(-2, -6, -2, 4, 6, 3, 0);
    this.head.setRotationPoint(0, -1 + y, -4);
    this.bill = new ModelRenderer(this, 14, 0);
    this.bill.addBox(-2, -4, -4, 4, 2, 2, 0);
    this.bill.setRotationPoint(0, -1 + y, -4);
    this.chin = new ModelRenderer(this, 14, 4);
    this.chin.addBox(-1, -2, -3, 2, 2, 2, 0);
    this.chin.setRotationPoint(0, -1 + y, -4);
    this.body = new ModelRenderer(this, 0, 9);
    this.body.addBox(-3, -4, -3, 6, 8, 6, 0);
    this.body.setRotationPoint(0, y, 0);
    this.rightLeg = new ModelRenderer(this, 26, 0);
    this.rightLeg.addBox(-1, 0, -3, 3, 5, 3);
    this.rightLeg.setRotationPoint(-2, 3 + y, 1);
    this.leftLeg = new ModelRenderer(this, 26, 0);
    this.leftLeg.addBox(-1, 0, -3, 3, 5, 3);
    this.leftLeg.setRotationPoint(1, 3 + y, 1);
    this.rightWing = new ModelRenderer(this, 24, 13);
    this.rightWing.addBox(0, 0, -3, 1, 4, 6);
    this.rightWing.setRotationPoint(-4, -3 + y, 0);
    this.leftWing = new ModelRenderer(this, 24, 13);
    this.leftWing.addBox(-1, 0, -3, 1, 4, 6);
    this.leftWing.setRotationPoint(4, -3 + y, 0);
  }

  override render(e: Entity | null, ls: number, la: number, age: number, yaw: number, pitch: number, scale: number): void {
    this.setRotationAngles(ls, la, age, yaw, pitch, scale, e);
    if (this.isChild) {
      const d = 2;
      GL.pushMatrix();
      GL.translate(0, f(5 * scale), f(2 * scale));
      this.head.render(scale);
      this.bill.render(scale);
      this.chin.render(scale);
      GL.popMatrix();
      GL.pushMatrix();
      GL.scale(1 / d, 1 / d, 1 / d);
      GL.translate(0, f(24 * scale), 0);
      this.body.render(scale);
      this.rightLeg.render(scale);
      this.leftLeg.render(scale);
      this.rightWing.render(scale);
      this.leftWing.render(scale);
      GL.popMatrix();
    } else {
      this.head.render(scale);
      this.bill.render(scale);
      this.chin.render(scale);
      this.body.render(scale);
      this.rightLeg.render(scale);
      this.leftLeg.render(scale);
      this.rightWing.render(scale);
      this.leftWing.render(scale);
    }
  }

  override setRotationAngles(ls: number, la: number, age: number, yaw: number, pitch: number, _scale: number, _e: Entity | null): void {
    this.head.rotateAngleX = f(pitch / RAD);
    this.head.rotateAngleY = f(yaw / RAD);
    this.bill.rotateAngleX = this.head.rotateAngleX;
    this.bill.rotateAngleY = this.head.rotateAngleY;
    this.chin.rotateAngleX = this.head.rotateAngleX;
    this.chin.rotateAngleY = this.head.rotateAngleY;
    this.body.rotateAngleX = f(PI_F / 2);
    const a = f(ls * f(0.6662));
    this.rightLeg.rotateAngleX = f(f(MathHelper.cos(a) * f(1.4)) * la);
    this.leftLeg.rotateAngleX = f(f(MathHelper.cos(f(a + PI_F)) * f(1.4)) * la);
    this.rightWing.rotateAngleZ = age;
    this.leftWing.rotateAngleZ = -age;
  }
}
