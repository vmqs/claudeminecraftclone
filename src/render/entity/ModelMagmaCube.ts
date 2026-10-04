import type { Entity } from '../../entity/Entity';
import type { EntityLiving } from '../../entity/EntityLiving';
import { ModelBase } from './ModelBase';
import { ModelRenderer } from './ModelRenderer';

const f = Math.fround;

/** What the model reads of the magma cube (EntityMagmaCube squish). */
interface Squishing {
  squishFactor: number;
  prevSquishFactor: number;
}

/**
 * The magma cube (ModelMagmaCube): eight 8x1x8 slices around a 4x4x4 core that spread apart
 * vertically with the squish (1.7 per slice step).
 */
export class ModelMagmaCube extends ModelBase {
  private readonly slices: ModelRenderer[] = [];
  private readonly core: ModelRenderer;

  constructor() {
    super();
    for (let i = 0; i < 8; i++) {
      let u = 0;
      let v = i;
      if (i === 2) {
        u = 24;
        v = 10;
      } else if (i === 3) {
        u = 24;
        v = 19;
      }
      const s = new ModelRenderer(this, u, v);
      s.addBox(-4, 16 + i, -4, 8, 1, 8);
      this.slices.push(s);
    }
    this.core = new ModelRenderer(this, 0, 16);
    this.core.addBox(-2, 18, -2, 4, 4, 4);
  }

  /** func_78107_a: model version (RenderMagmaCube rebuilds the model when it changes). */
  getModelVersion(): number {
    return 5;
  }

  override setLivingAnimations(e: EntityLiving, _ls: number, _la: number, pt: number): void {
    const c = e as EntityLiving & Squishing;
    let s = f(c.prevSquishFactor + f(f(c.squishFactor - c.prevSquishFactor) * pt));
    if (s < 0) s = 0;
    for (let i = 0; i < this.slices.length; i++) this.slices[i].rotationPointY = f(f(-(4 - i) * s) * f(1.7));
  }

  override render(e: Entity | null, ls: number, la: number, age: number, headYaw: number, headPitch: number, scale: number): void {
    this.setRotationAngles(ls, la, age, headYaw, headPitch, scale, e);
    this.core.render(scale);
    for (const s of this.slices) s.render(scale);
  }
}
