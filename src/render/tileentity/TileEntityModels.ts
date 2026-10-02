import type { Entity } from '../../entity/Entity';
import { MathHelper } from '../../core/MathHelper';
import { ModelBase } from '../entity/ModelBase';
import { ModelRenderer } from '../entity/ModelRenderer';

const f = Math.fround;
const SCALE = f(0.0625);

/** ModelChest: lid, latch and base of a single chest (texture 64x64). */
export class ModelChest extends ModelBase {
  chestLid: ModelRenderer;
  chestBelow: ModelRenderer;
  chestKnob: ModelRenderer;

  constructor(width = 14, knobX = 8, texW = 64) {
    super();
    this.chestLid = new ModelRenderer(this, 0, 0).setTextureSize(texW, 64);
    this.chestLid.addBox(0, -5, -14, width, 5, 14, 0);
    this.chestLid.setRotationPoint(1, 7, 15);
    this.chestKnob = new ModelRenderer(this, 0, 0).setTextureSize(texW, 64);
    this.chestKnob.addBox(-1, -2, -15, 2, 4, 1, 0);
    this.chestKnob.setRotationPoint(knobX, 7, 15);
    this.chestBelow = new ModelRenderer(this, 0, 19).setTextureSize(texW, 64);
    this.chestBelow.addBox(0, 0, 0, width, 10, 14, 0);
    this.chestBelow.setRotationPoint(1, 6, 1);
  }

  /** Draws the chest; the latch follows the lid. */
  renderAll(): void {
    this.chestKnob.rotateAngleX = this.chestLid.rotateAngleX;
    this.chestLid.render(SCALE);
    this.chestKnob.render(SCALE);
    this.chestBelow.render(SCALE);
  }
}

/** ModelLargeChest: the double chest, two blocks wide (texture 128x64). */
export class ModelLargeChest extends ModelChest {
  constructor() {
    super(30, 16, 128);
  }
}

/** ModelSign: the board and, on standing signs, the post. */
export class ModelSign extends ModelBase {
  readonly signBoard: ModelRenderer;
  readonly signStick: ModelRenderer;

  constructor() {
    super();
    this.signBoard = new ModelRenderer(this, 0, 0);
    this.signBoard.addBox(-12, -14, -1, 24, 12, 2, 0);
    this.signStick = new ModelRenderer(this, 0, 14);
    this.signStick.addBox(-1, -2, -1, 2, 14, 2, 0);
  }

  renderSign(): void {
    this.signBoard.render(SCALE);
    this.signStick.render(SCALE);
  }
}

/** ModelBook: the enchanting table's book (covers, spine, page blocks and two flipping pages). */
export class ModelBook extends ModelBase {
  readonly coverRight = new ModelRenderer(this).setTextureOffset(0, 0).addBox(-6, -5, 0, 6, 10, 0);
  readonly coverLeft = new ModelRenderer(this).setTextureOffset(16, 0).addBox(0, -5, 0, 6, 10, 0);
  readonly pagesRight = new ModelRenderer(this).setTextureOffset(0, 10).addBox(0, -4, f(-0.99), 5, 8, 1);
  readonly pagesLeft = new ModelRenderer(this).setTextureOffset(12, 10).addBox(0, -4, f(-0.01), 5, 8, 1);
  readonly flippingPageRight = new ModelRenderer(this).setTextureOffset(24, 10).addBox(0, -4, 0, 5, 8, 0);
  readonly flippingPageLeft = new ModelRenderer(this).setTextureOffset(24, 10).addBox(0, -4, 0, 5, 8, 0);
  readonly bookSpine = new ModelRenderer(this).setTextureOffset(12, 0).addBox(-1, -5, 0, 2, 10, 0);

  constructor() {
    super();
    this.coverRight.setRotationPoint(0, 0, -1);
    this.coverLeft.setRotationPoint(0, 0, 1);
    this.bookSpine.rotateAngleY = f(Math.PI / 2);
  }

  /** (age, right page flip, left page flip, spread, unused, scale). */
  override render(e: Entity | null, age: number, flipRight: number, flipLeft: number, spread: number, unused: number, scale: number): void {
    this.setRotationAngles(age, flipRight, flipLeft, spread, unused, scale, e);
    this.coverRight.render(scale);
    this.coverLeft.render(scale);
    this.bookSpine.render(scale);
    this.pagesRight.render(scale);
    this.pagesLeft.render(scale);
    this.flippingPageRight.render(scale);
    this.flippingPageLeft.render(scale);
  }

  override setRotationAngles(age: number, flipRight: number, flipLeft: number, spread: number, _unused: number, _scale: number, _e: Entity | null): void {
    const open = f(f(f(MathHelper.sin(f(age * f(0.02))) * f(0.1)) + f(1.25)) * spread);
    this.coverRight.rotateAngleY = f(f(Math.PI) + open);
    this.coverLeft.rotateAngleY = -open;
    this.pagesRight.rotateAngleY = open;
    this.pagesLeft.rotateAngleY = -open;
    this.flippingPageRight.rotateAngleY = f(open - f(f(open * 2) * flipRight));
    this.flippingPageLeft.rotateAngleY = f(open - f(f(open * 2) * flipLeft));
    const shift = MathHelper.sin(open);
    this.pagesRight.rotationPointX = shift;
    this.pagesLeft.rotationPointX = shift;
    this.flippingPageRight.rotationPointX = shift;
    this.flippingPageLeft.rotationPointX = shift;
  }
}
