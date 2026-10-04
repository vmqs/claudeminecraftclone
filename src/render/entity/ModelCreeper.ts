import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import { ModelBase } from './ModelBase';
import { ModelRenderer } from './ModelRenderer';

const f = Math.fround;
const RAD = f(180 / f(Math.PI));

/** The creeper (ModelCreeper): head, body and four short legs; grown by 2 for the charged aura. */
export class ModelCreeper extends ModelBase {
  readonly head: ModelRenderer;
  /** The unused headwear part (field_78133_b). */
  readonly headwear: ModelRenderer;
  readonly body: ModelRenderer;
  readonly leg1: ModelRenderer;
  readonly leg2: ModelRenderer;
  readonly leg3: ModelRenderer;
  readonly leg4: ModelRenderer;

  constructor(grow = 0) {
    super();
    const y = 4;
    this.head = new ModelRenderer(this, 0, 0);
    this.head.addBox(-4, -8, -4, 8, 8, 8, grow);
    this.head.setRotationPoint(0, y, 0);
    this.headwear = new ModelRenderer(this, 32, 0);
    this.headwear.addBox(-4, -8, -4, 8, 8, 8, f(grow + f(0.5)));
    this.headwear.setRotationPoint(0, y, 0);
    this.body = new ModelRenderer(this, 16, 16);
    this.body.addBox(-4, 0, -2, 8, 12, 4, grow);
    this.body.setRotationPoint(0, y, 0);
    this.leg1 = new ModelRenderer(this, 0, 16);
    this.leg1.addBox(-2, 0, -2, 4, 6, 4, grow);
    this.leg1.setRotationPoint(-2, 12 + y, 4);
    this.leg2 = new ModelRenderer(this, 0, 16);
    this.leg2.addBox(-2, 0, -2, 4, 6, 4, grow);
    this.leg2.setRotationPoint(2, 12 + y, 4);
    this.leg3 = new ModelRenderer(this, 0, 16);
    this.leg3.addBox(-2, 0, -2, 4, 6, 4, grow);
    this.leg3.setRotationPoint(-2, 12 + y, -4);
    this.leg4 = new ModelRenderer(this, 0, 16);
    this.leg4.addBox(-2, 0, -2, 4, 6, 4, grow);
    this.leg4.setRotationPoint(2, 12 + y, -4);
  }

  override render(e: Entity | null, ls: number, la: number, age: number, headYaw: number, headPitch: number, scale: number): void {
    this.setRotationAngles(ls, la, age, headYaw, headPitch, scale, e);
    this.head.render(scale);
    this.body.render(scale);
    this.leg1.render(scale);
    this.leg2.render(scale);
    this.leg3.render(scale);
    this.leg4.render(scale);
  }

  override setRotationAngles(ls: number, la: number, _age: number, headYaw: number, headPitch: number, _scale: number, _e: Entity | null): void {
    this.head.rotateAngleY = f(headYaw / RAD);
    this.head.rotateAngleX = f(headPitch / RAD);
    const a = f(ls * f(0.6662));
    const b = f(a + f(Math.PI));
    this.leg1.rotateAngleX = f(f(MathHelper.cos(a) * f(1.4)) * la);
    this.leg2.rotateAngleX = f(f(MathHelper.cos(b) * f(1.4)) * la);
    this.leg3.rotateAngleX = f(f(MathHelper.cos(b) * f(1.4)) * la);
    this.leg4.rotateAngleX = f(f(MathHelper.cos(a) * f(1.4)) * la);
  }
}
