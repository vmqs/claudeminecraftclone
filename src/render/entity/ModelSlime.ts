import type { Entity } from '../../entity/Entity';
import { ModelBase } from './ModelBase';
import { ModelRenderer } from './ModelRenderer';

/**
 * The slime (ModelSlime): with texture row 16 the opaque inner cube with eyes and mouth, with
 * row 0 the translucent 8x8x8 outer jelly.
 */
export class ModelSlime extends ModelBase {
  private slimeBodies: ModelRenderer;
  private readonly slimeRightEye: ModelRenderer | null = null;
  private readonly slimeLeftEye: ModelRenderer | null = null;
  private readonly slimeMouth: ModelRenderer | null = null;

  constructor(texV: number) {
    super();
    this.slimeBodies = new ModelRenderer(this, 0, texV);
    this.slimeBodies.addBox(-4, 16, -4, 8, 8, 8);
    if (texV > 0) {
      this.slimeBodies = new ModelRenderer(this, 0, texV);
      this.slimeBodies.addBox(-3, 17, -3, 6, 6, 6);
      this.slimeRightEye = new ModelRenderer(this, 32, 0);
      this.slimeRightEye.addBox(-3.25, 18, -3.5, 2, 2, 2);
      this.slimeLeftEye = new ModelRenderer(this, 32, 4);
      this.slimeLeftEye.addBox(1.25, 18, -3.5, 2, 2, 2);
      this.slimeMouth = new ModelRenderer(this, 32, 8);
      this.slimeMouth.addBox(0, 21, -3.5, 1, 1, 1);
    }
  }

  override render(e: Entity | null, ls: number, la: number, age: number, headYaw: number, headPitch: number, scale: number): void {
    this.setRotationAngles(ls, la, age, headYaw, headPitch, scale, e);
    this.slimeBodies.render(scale);
    if (this.slimeRightEye) {
      this.slimeRightEye.render(scale);
      this.slimeLeftEye!.render(scale);
      this.slimeMouth!.render(scale);
    }
  }
}
