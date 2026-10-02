import type { Entity } from '../../entity/Entity';
import type { EntityLiving } from '../../entity/EntityLiving';
import type { EntitySheep } from '../../entity/EntitySheep';
import { ModelQuadruped } from './ModelQuadruped';
import { ModelRenderer } from './ModelRenderer';

const f = Math.fround;

/** The sheared sheep (ModelSheep2): the head drops and chews while grazing. */
export class ModelSheep2 extends ModelQuadruped {
  private headRotationAngleX = 0;

  constructor() {
    super(12, 0);
    this.head = new ModelRenderer(this, 0, 0);
    this.head.addBox(-3, -4, -6, 6, 6, 8, 0);
    this.head.setRotationPoint(0, 6, -8);
    this.body = new ModelRenderer(this, 28, 8);
    this.body.addBox(-4, -10, -7, 8, 16, 6, 0);
    this.body.setRotationPoint(0, 5, 2);
  }

  override setLivingAnimations(e: EntityLiving, ls: number, la: number, pt: number): void {
    super.setLivingAnimations(e, ls, la, pt);
    const sheep = e as EntitySheep;
    this.head.rotationPointY = f(6 + f(sheep.getHeadRotationPointY(pt) * 9));
    this.headRotationAngleX = sheep.getHeadRotationAngleX(pt);
  }

  override setRotationAngles(ls: number, la: number, age: number, yaw: number, pitch: number, scale: number, e: Entity | null): void {
    super.setRotationAngles(ls, la, age, yaw, pitch, scale, e);
    this.head.rotateAngleX = this.headRotationAngleX;
  }
}

/** The fleece layer (ModelSheep1): grown boxes over the head, body and upper legs. */
export class ModelSheep1 extends ModelQuadruped {
  private headRotationAngleX = 0;

  constructor() {
    super(12, 0);
    this.head = new ModelRenderer(this, 0, 0);
    this.head.addBox(-3, -4, -4, 6, 6, 6, f(0.6));
    this.head.setRotationPoint(0, 6, -8);
    this.body = new ModelRenderer(this, 28, 8);
    this.body.addBox(-4, -10, -7, 8, 16, 6, f(1.75));
    this.body.setRotationPoint(0, 5, 2);
    const grow = f(0.5);
    this.leg1 = new ModelRenderer(this, 0, 16);
    this.leg1.addBox(-2, 0, -2, 4, 6, 4, grow);
    this.leg1.setRotationPoint(-3, 12, 7);
    this.leg2 = new ModelRenderer(this, 0, 16);
    this.leg2.addBox(-2, 0, -2, 4, 6, 4, grow);
    this.leg2.setRotationPoint(3, 12, 7);
    this.leg3 = new ModelRenderer(this, 0, 16);
    this.leg3.addBox(-2, 0, -2, 4, 6, 4, grow);
    this.leg3.setRotationPoint(-3, 12, -5);
    this.leg4 = new ModelRenderer(this, 0, 16);
    this.leg4.addBox(-2, 0, -2, 4, 6, 4, grow);
    this.leg4.setRotationPoint(3, 12, -5);
  }

  override setLivingAnimations(e: EntityLiving, ls: number, la: number, pt: number): void {
    super.setLivingAnimations(e, ls, la, pt);
    const sheep = e as EntitySheep;
    this.head.rotationPointY = f(6 + f(sheep.getHeadRotationPointY(pt) * 9));
    this.headRotationAngleX = sheep.getHeadRotationAngleX(pt);
  }

  override setRotationAngles(ls: number, la: number, age: number, yaw: number, pitch: number, scale: number, e: Entity | null): void {
    super.setRotationAngles(ls, la, age, yaw, pitch, scale, e);
    this.head.rotateAngleX = this.headRotationAngleX;
  }
}
