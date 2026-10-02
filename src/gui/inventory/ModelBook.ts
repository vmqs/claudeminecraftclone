import type { Entity } from '../../entity/Entity';
import { MathHelper } from '../../core/MathHelper';
import { ModelBase } from '../../render/entity/ModelBase';
import { ModelRenderer } from '../../render/entity/ModelRenderer';

const f = Math.fround;
const PI = f(Math.PI);

/**
 * The open book of the enchanting table (ModelBook): two covers, the spine, two page blocks and
 * two flipping pages. render(_, _, flipRight, flipLeft, open, _, scale) like the original.
 */
export class ModelBook extends ModelBase {
  readonly coverRight: ModelRenderer;
  readonly coverLeft: ModelRenderer;
  readonly pagesRight: ModelRenderer;
  readonly pagesLeft: ModelRenderer;
  readonly flippingPageRight: ModelRenderer;
  readonly flippingPageLeft: ModelRenderer;
  readonly bookSpine: ModelRenderer;

  constructor() {
    super();
    this.coverRight = new ModelRenderer(this).setTextureOffset(0, 0).addBox(-6, -5, 0, 6, 10, 0);
    this.coverLeft = new ModelRenderer(this).setTextureOffset(16, 0).addBox(0, -5, 0, 6, 10, 0);
    this.bookSpine = new ModelRenderer(this).setTextureOffset(12, 0).addBox(-1, -5, 0, 2, 10, 0);
    this.pagesRight = new ModelRenderer(this).setTextureOffset(0, 10).addBox(0, -4, f(-0.99), 5, 8, 1);
    this.pagesLeft = new ModelRenderer(this).setTextureOffset(12, 10).addBox(0, -4, f(-0.01), 5, 8, 1);
    this.flippingPageRight = new ModelRenderer(this).setTextureOffset(24, 10).addBox(0, -4, 0, 5, 8, 0);
    this.flippingPageLeft = new ModelRenderer(this).setTextureOffset(24, 10).addBox(0, -4, 0, 5, 8, 0);
    this.coverRight.setRotationPoint(0, 0, -1);
    this.coverLeft.setRotationPoint(0, 0, 1);
    this.bookSpine.rotateAngleY = f(Math.PI / 2);
  }

  override render(e: Entity | null, ticks: number, flipRight: number, flipLeft: number, open: number, unused: number, scale: number): void {
    this.setRotationAngles(ticks, flipRight, flipLeft, open, unused, scale, e);
    this.coverRight.render(scale);
    this.coverLeft.render(scale);
    this.bookSpine.render(scale);
    this.pagesRight.render(scale);
    this.pagesLeft.render(scale);
    this.flippingPageRight.render(scale);
    this.flippingPageLeft.render(scale);
  }

  override setRotationAngles(ticks: number, flipRight: number, flipLeft: number, open: number, _unused: number, _scale: number, _e: Entity | null): void {
    const a = f(f(f(MathHelper.sin(f(ticks * f(0.02))) * f(0.1)) + f(1.25)) * open);
    this.coverRight.rotateAngleY = f(PI + a);
    this.coverLeft.rotateAngleY = -a;
    this.pagesRight.rotateAngleY = a;
    this.pagesLeft.rotateAngleY = -a;
    this.flippingPageRight.rotateAngleY = f(a - f(f(a * 2) * flipRight));
    this.flippingPageLeft.rotateAngleY = f(a - f(f(a * 2) * flipLeft));
    const s = MathHelper.sin(a);
    this.pagesRight.rotationPointX = s;
    this.pagesLeft.rotationPointX = s;
    this.flippingPageRight.rotationPointX = s;
    this.flippingPageLeft.rotationPointX = s;
  }
}
