import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import { ModelBase } from './ModelBase';
import { ModelRenderer } from './ModelRenderer';

const f = Math.fround;
const RAD = f(180 / f(Math.PI));

/** The spider (ModelSpider): head, neck, abdomen and eight 16-long legs with the scuttling gait. */
export class ModelSpider extends ModelBase {
  readonly spiderHead: ModelRenderer;
  readonly spiderNeck: ModelRenderer;
  readonly spiderBody: ModelRenderer;
  /** Legs 1-8: odd ones on the right (pointing -x), even ones on the left. */
  readonly legs: ModelRenderer[] = [];

  constructor() {
    super();
    const y = 15;
    this.spiderHead = new ModelRenderer(this, 32, 4);
    this.spiderHead.addBox(-4, -4, -8, 8, 8, 8, 0);
    this.spiderHead.setRotationPoint(0, y, -3);
    this.spiderNeck = new ModelRenderer(this, 0, 0);
    this.spiderNeck.addBox(-3, -3, -3, 6, 6, 6, 0);
    this.spiderNeck.setRotationPoint(0, y, 0);
    this.spiderBody = new ModelRenderer(this, 0, 12);
    this.spiderBody.addBox(-5, -4, -6, 10, 8, 12, 0);
    this.spiderBody.setRotationPoint(0, y, 9);
    const z = [2, 2, 1, 1, 0, 0, -1, -1];
    for (let i = 0; i < 8; i++) {
      const leg = new ModelRenderer(this, 18, 0);
      const right = i % 2 === 0;
      leg.addBox(right ? -15 : -1, -1, -1, 16, 2, 2, 0);
      leg.setRotationPoint(right ? -4 : 4, y, z[i]);
      this.legs.push(leg);
    }
  }

  override render(e: Entity | null, ls: number, la: number, age: number, headYaw: number, headPitch: number, scale: number): void {
    this.setRotationAngles(ls, la, age, headYaw, headPitch, scale, e);
    this.spiderHead.render(scale);
    this.spiderNeck.render(scale);
    this.spiderBody.render(scale);
    for (const leg of this.legs) leg.render(scale);
  }

  override setRotationAngles(ls: number, la: number, _age: number, headYaw: number, headPitch: number, _scale: number, _e: Entity | null): void {
    this.spiderHead.rotateAngleY = f(headYaw / RAD);
    this.spiderHead.rotateAngleX = f(headPitch / RAD);
    const q = f(Math.PI / 4);
    const L = this.legs;
    L[0].rotateAngleZ = -q;
    L[1].rotateAngleZ = q;
    L[2].rotateAngleZ = f(-q * f(0.74));
    L[3].rotateAngleZ = f(q * f(0.74));
    L[4].rotateAngleZ = f(-q * f(0.74));
    L[5].rotateAngleZ = f(q * f(0.74));
    L[6].rotateAngleZ = -q;
    L[7].rotateAngleZ = q;
    const e8 = f(Math.PI / 8);
    L[0].rotateAngleY = f(e8 * 2);
    L[1].rotateAngleY = f(-e8 * 2);
    L[2].rotateAngleY = e8;
    L[3].rotateAngleY = -e8;
    L[4].rotateAngleY = -e8;
    L[5].rotateAngleY = e8;
    L[6].rotateAngleY = f(-e8 * 2);
    L[7].rotateAngleY = f(e8 * 2);
    const p = f(f(ls * f(0.6662)) * 2);
    const phases = [0, f(Math.PI), f(Math.PI / 2), f((Math.PI * 3) / 2)];
    for (let k = 0; k < 4; k++) {
      const yaw = f(-f(MathHelper.cos(f(p + phases[k])) * f(0.4)) * la);
      const roll = f(Math.abs(f(MathHelper.sin(f(f(ls * f(0.6662)) + phases[k])) * f(0.4))) * la);
      L[2 * k].rotateAngleY = f(L[2 * k].rotateAngleY + yaw);
      L[2 * k + 1].rotateAngleY = f(L[2 * k + 1].rotateAngleY - yaw);
      L[2 * k].rotateAngleZ = f(L[2 * k].rotateAngleZ + roll);
      L[2 * k + 1].rotateAngleZ = f(L[2 * k + 1].rotateAngleZ - roll);
    }
  }
}
