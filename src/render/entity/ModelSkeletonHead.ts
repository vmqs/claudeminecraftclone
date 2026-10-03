import type { Entity } from '../../entity/Entity';
import { ModelBase } from './ModelBase';
import { ModelRenderer } from './ModelRenderer';

const f = Math.fround;

/** A lone 8x8x8 head (ModelSkeletonHead): skulls and wither skulls. */
export class ModelSkeletonHead extends ModelBase {
  readonly skeletonHead: ModelRenderer;

  constructor(texU = 0, texV = 35, texW = 64, texH = 64) {
    super();
    this.textureWidth = texW;
    this.textureHeight = texH;
    this.skeletonHead = new ModelRenderer(this, texU, texV);
    this.skeletonHead.addBox(-4, -8, -4, 8, 8, 8, 0);
    this.skeletonHead.setRotationPoint(0, 0, 0);
  }

  override render(e: Entity | null, ls: number, la: number, age: number, yaw: number, pitch: number, scale: number): void {
    this.setRotationAngles(ls, la, age, yaw, pitch, scale, e);
    this.skeletonHead.render(scale);
  }

  override setRotationAngles(ls: number, la: number, age: number, yaw: number, pitch: number, scale: number, e: Entity | null): void {
    super.setRotationAngles(ls, la, age, yaw, pitch, scale, e);
    this.skeletonHead.rotateAngleY = f(yaw / f(180 / f(Math.PI)));
    this.skeletonHead.rotateAngleX = f(pitch / f(180 / f(Math.PI)));
  }
}
