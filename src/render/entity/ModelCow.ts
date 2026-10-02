import { ModelQuadruped } from './ModelQuadruped';
import { ModelRenderer } from './ModelRenderer';

/** The cow and mooshroom (ModelCow): horns, a bigger body with an udder, long legs. */
export class ModelCow extends ModelQuadruped {
  constructor() {
    super(12, 0);
    this.head = new ModelRenderer(this, 0, 0);
    this.head.addBox(-4, -4, -6, 8, 8, 6, 0);
    this.head.setRotationPoint(0, 4, -8);
    this.head.setTextureOffset(22, 0).addBox(-5, -5, -4, 1, 3, 1, 0);
    this.head.setTextureOffset(22, 0).addBox(4, -5, -4, 1, 3, 1, 0);
    this.body = new ModelRenderer(this, 18, 4);
    this.body.addBox(-6, -10, -7, 12, 18, 10, 0);
    this.body.setRotationPoint(0, 5, 2);
    this.body.setTextureOffset(52, 0).addBox(-2, 2, -8, 4, 6, 1);
    this.leg1.rotationPointX--;
    this.leg2.rotationPointX++;
    this.leg3.rotationPointX--;
    this.leg4.rotationPointX++;
    this.leg3.rotationPointZ--;
    this.leg4.rotationPointZ--;
    this.childZOffset += 2;
  }
}
