import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import type { EntityLiving } from '../../entity/EntityLiving';
import type { EntityWither } from '../../entity/EntityWither';
import { ModelBase } from './ModelBase';
import { ModelRenderer } from './ModelRenderer';

const f = Math.fround;
const DEG = f(180 / f(Math.PI));

/**
 * The Wither (ModelWither, 64x64): a shoulder bar, a spine with three ribs that sways, a tail
 * piece hanging from it, the big middle head (which follows the look) and two smaller side
 * heads aimed by the entity's own head yaw and pitch.
 */
export class ModelWither extends ModelBase {
  /** field_82905_a: shoulders, spine with ribs, tail. */
  private readonly body: ModelRenderer[];
  /** field_82904_b: the middle head and the two side heads. */
  private readonly heads: ModelRenderer[];

  constructor() {
    super();
    this.textureWidth = 64;
    this.textureHeight = 64;
    const shoulders = new ModelRenderer(this, 0, 16);
    shoulders.addBox(-10, f(3.9), f(-0.5), 20, 3, 3);
    const spine = new ModelRenderer(this).setTextureSize(this.textureWidth, this.textureHeight);
    spine.setRotationPoint(-2, f(6.9), f(-0.5));
    spine.setTextureOffset(0, 22).addBox(0, 0, 0, 3, 10, 3);
    spine.setTextureOffset(24, 22).addBox(-4, f(1.5), f(0.5), 11, 2, 2);
    spine.setTextureOffset(24, 22).addBox(-4, 4, f(0.5), 11, 2, 2);
    spine.setTextureOffset(24, 22).addBox(-4, f(6.5), f(0.5), 11, 2, 2);
    const tail = new ModelRenderer(this, 12, 22);
    tail.addBox(0, 0, 0, 3, 6, 3);
    this.body = [shoulders, spine, tail];
    const middle = new ModelRenderer(this, 0, 0);
    middle.addBox(-4, -4, -4, 8, 8, 8);
    const left = new ModelRenderer(this, 32, 0);
    left.addBox(-4, -4, -4, 6, 6, 6);
    left.rotationPointX = -8;
    left.rotationPointY = 4;
    const right = new ModelRenderer(this, 32, 0);
    right.addBox(-4, -4, -4, 6, 6, 6);
    right.rotationPointX = 10;
    right.rotationPointY = 4;
    this.heads = [middle, left, right];
  }

  /** func_82903_a: the model version RenderWither checks. */
  getModelVersion(): number {
    return 32;
  }

  override render(e: Entity | null, ls: number, la: number, age: number, headYaw: number, headPitch: number, scale: number): void {
    this.setRotationAngles(ls, la, age, headYaw, headPitch, scale, e);
    for (const h of this.heads) h.render(scale);
    for (const b of this.body) b.render(scale);
  }

  override setRotationAngles(_ls: number, _la: number, age: number, headYaw: number, headPitch: number, _scale: number, _e: Entity | null): void {
    const c = MathHelper.cos(f(age * f(0.1)));
    const spine = this.body[1];
    spine.rotateAngleX = f(f(f(0.065) + f(f(0.05) * c)) * f(Math.PI));
    this.body[2].setRotationPoint(-2, f(f(6.9) + f(MathHelper.cos(spine.rotateAngleX) * 10)), f(f(-0.5) + f(MathHelper.sin(spine.rotateAngleX) * 10)));
    this.body[2].rotateAngleX = f(f(f(0.265) + f(f(0.1) * c)) * f(Math.PI));
    this.heads[0].rotateAngleY = f(headYaw / DEG);
    this.heads[0].rotateAngleX = f(headPitch / DEG);
  }

  override setLivingAnimations(e: EntityLiving, _ls: number, _la: number, _pt: number): void {
    const w = e as EntityWither;
    for (let i = 1; i < 3; i++) {
      this.heads[i].rotateAngleY = f(f(w.getHeadYRotation(i - 1) - e.renderYawOffset) / DEG);
      this.heads[i].rotateAngleX = f(w.getHeadXRotation(i - 1) / DEG);
    }
  }
}
