import { ModelQuadruped } from './ModelQuadruped';

/** The pig (ModelPig): short legs and a snout; the saddle layer is the same model grown by 0.5. */
export class ModelPig extends ModelQuadruped {
  constructor(grow = 0) {
    super(6, grow);
    this.head.setTextureOffset(16, 16).addBox(-2, 0, -9, 4, 3, 1, grow);
    this.childYOffset = 4;
  }
}
