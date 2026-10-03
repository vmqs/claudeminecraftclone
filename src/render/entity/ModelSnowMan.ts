import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import { ModelBase } from './ModelBase';
import { ModelRenderer } from './ModelRenderer';

const f = Math.fround;
const PI_F = f(Math.PI);
const RAD = f(180 / PI_F);

/** The snow golem (ModelSnowMan, 64x64): two snow balls, a head and stick arms turning with the head. */
export class ModelSnowMan extends ModelBase {
  readonly body: ModelRenderer;
  readonly bottomBody: ModelRenderer;
  readonly head: ModelRenderer;
  readonly rightHand: ModelRenderer;
  readonly leftHand: ModelRenderer;

  constructor() {
    super();
    const y = 4;
    const grow = f(-0.5);
    this.head = new ModelRenderer(this, 0, 0).setTextureSize(64, 64);
    this.head.addBox(-4, -8, -4, 8, 8, 8, grow);
    this.head.setRotationPoint(0, 0 + y, 0);
    this.rightHand = new ModelRenderer(this, 32, 0).setTextureSize(64, 64);
    this.rightHand.addBox(-1, 0, -1, 12, 2, 2, grow);
    this.rightHand.setRotationPoint(0, 0 + y + 9 - 7, 0);
    this.leftHand = new ModelRenderer(this, 32, 0).setTextureSize(64, 64);
    this.leftHand.addBox(-1, 0, -1, 12, 2, 2, grow);
    this.leftHand.setRotationPoint(0, 0 + y + 9 - 7, 0);
    this.body = new ModelRenderer(this, 0, 16).setTextureSize(64, 64);
    this.body.addBox(-5, -10, -5, 10, 10, 10, grow);
    this.body.setRotationPoint(0, 0 + y + 9, 0);
    this.bottomBody = new ModelRenderer(this, 0, 36).setTextureSize(64, 64);
    this.bottomBody.addBox(-6, -12, -6, 12, 12, 12, grow);
    this.bottomBody.setRotationPoint(0, 0 + y + 20, 0);
  }

  override setRotationAngles(ls: number, la: number, age: number, yaw: number, pitch: number, scale: number, e: Entity | null): void {
    super.setRotationAngles(ls, la, age, yaw, pitch, scale, e);
    this.head.rotateAngleY = f(yaw / RAD);
    this.head.rotateAngleX = f(pitch / RAD);
    this.body.rotateAngleY = f(f(yaw / RAD) * f(0.25));
    const s = MathHelper.sin(this.body.rotateAngleY);
    const c = MathHelper.cos(this.body.rotateAngleY);
    this.rightHand.rotateAngleZ = 1;
    this.leftHand.rotateAngleZ = -1;
    this.rightHand.rotateAngleY = f(0 + this.body.rotateAngleY);
    this.leftHand.rotateAngleY = f(PI_F + this.body.rotateAngleY);
    this.rightHand.rotationPointX = f(c * 5);
    this.rightHand.rotationPointZ = f(-s * 5);
    this.leftHand.rotationPointX = f(-c * 5);
    this.leftHand.rotationPointZ = f(s * 5);
  }

  override render(e: Entity | null, ls: number, la: number, age: number, yaw: number, pitch: number, scale: number): void {
    this.setRotationAngles(ls, la, age, yaw, pitch, scale, e);
    this.body.render(scale);
    this.bottomBody.render(scale);
    this.head.render(scale);
    this.rightHand.render(scale);
    this.leftHand.render(scale);
  }
}
