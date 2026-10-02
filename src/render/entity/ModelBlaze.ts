import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import { ModelBase } from './ModelBase';
import { ModelRenderer } from './ModelRenderer';

const f = Math.fround;
const RAD = f(180 / f(Math.PI));

/** The blaze (ModelBlaze): a head and three rings of four rods circling and bobbing at different speeds. */
export class ModelBlaze extends ModelBase {
  private readonly blazeSticks: ModelRenderer[] = [];
  private readonly blazeHead: ModelRenderer;

  constructor() {
    super();
    for (let i = 0; i < 12; i++) {
      const s = new ModelRenderer(this, 0, 16);
      s.addBox(0, 0, 0, 2, 8, 2);
      this.blazeSticks.push(s);
    }
    this.blazeHead = new ModelRenderer(this, 0, 0);
    this.blazeHead.addBox(-4, -4, -4, 8, 8, 8);
  }

  /** func_78104_a: model version (RenderBlaze rebuilds the model when it changes). */
  getModelVersion(): number {
    return 8;
  }

  override render(e: Entity | null, ls: number, la: number, age: number, headYaw: number, headPitch: number, scale: number): void {
    this.setRotationAngles(ls, la, age, headYaw, headPitch, scale, e);
    this.blazeHead.render(scale);
    for (const s of this.blazeSticks) s.render(scale);
  }

  override setRotationAngles(_ls: number, _la: number, age: number, headYaw: number, headPitch: number, _scale: number, _e: Entity | null): void {
    const PI = f(Math.PI);
    const S = this.blazeSticks;
    let a = f(f(age * PI) * f(-0.1));
    for (let i = 0; i < 4; i++) {
      S[i].rotationPointY = f(-2 + MathHelper.cos(f(f(i * 2 + age) * f(0.25))));
      S[i].rotationPointX = f(MathHelper.cos(a) * 9);
      S[i].rotationPointZ = f(MathHelper.sin(a) * 9);
      a = f(a + 1);
    }
    a = f(f(Math.PI / 4) + f(f(age * PI) * f(0.03)));
    for (let i = 4; i < 8; i++) {
      S[i].rotationPointY = f(2 + MathHelper.cos(f(f(i * 2 + age) * f(0.25))));
      S[i].rotationPointX = f(MathHelper.cos(a) * 7);
      S[i].rotationPointZ = f(MathHelper.sin(a) * 7);
      a = f(a + 1);
    }
    a = f(f(0.47123894) + f(f(age * PI) * f(-0.05)));
    for (let i = 8; i < 12; i++) {
      S[i].rotationPointY = f(11 + MathHelper.cos(f(f(f(i * f(1.5)) + age) * f(0.5))));
      S[i].rotationPointX = f(MathHelper.cos(a) * 5);
      S[i].rotationPointZ = f(MathHelper.sin(a) * 5);
      a = f(a + 1);
    }
    this.blazeHead.rotateAngleY = f(headYaw / RAD);
    this.blazeHead.rotateAngleX = f(headPitch / RAD);
  }
}
