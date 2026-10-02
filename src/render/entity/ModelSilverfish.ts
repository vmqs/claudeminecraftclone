import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import { ModelBase } from './ModelBase';
import { ModelRenderer } from './ModelRenderer';

const f = Math.fround;

/** Segment sizes (x, y, z) and texture offsets, head first (ModelSilverfish). */
const BOX = [
  [3, 2, 2],
  [4, 3, 2],
  [6, 4, 3],
  [3, 3, 3],
  [2, 2, 3],
  [2, 1, 2],
  [1, 1, 2],
];
const TEX = [
  [0, 0],
  [0, 4],
  [0, 9],
  [0, 16],
  [0, 22],
  [11, 0],
  [13, 4],
];

/** The silverfish (ModelSilverfish): seven body segments wriggling sideways and three fins. */
export class ModelSilverfish extends ModelBase {
  private readonly bodyParts: ModelRenderer[] = [];
  private readonly wings: ModelRenderer[] = [];
  private readonly zPlacement: number[] = [];

  constructor() {
    super();
    let z = f(-3.5);
    for (let i = 0; i < BOX.length; i++) {
      const p = new ModelRenderer(this, TEX[i][0], TEX[i][1]);
      p.addBox(f(BOX[i][0] * f(-0.5)), 0, f(BOX[i][2] * f(-0.5)), BOX[i][0], BOX[i][1], BOX[i][2]);
      p.setRotationPoint(0, 24 - BOX[i][1], z);
      this.bodyParts.push(p);
      this.zPlacement[i] = z;
      if (i < BOX.length - 1) z = f(z + f((BOX[i][2] + BOX[i + 1][2]) * f(0.5)));
    }
    const w0 = new ModelRenderer(this, 20, 0);
    w0.addBox(-5, 0, f(BOX[2][2] * f(-0.5)), 10, 8, BOX[2][2]);
    w0.setRotationPoint(0, 16, this.zPlacement[2]);
    const w1 = new ModelRenderer(this, 20, 11);
    w1.addBox(-3, 0, f(BOX[4][2] * f(-0.5)), 6, 4, BOX[4][2]);
    w1.setRotationPoint(0, 20, this.zPlacement[4]);
    const w2 = new ModelRenderer(this, 20, 18);
    w2.addBox(-3, 0, f(BOX[4][2] * f(-0.5)), 6, 5, BOX[1][2]);
    w2.setRotationPoint(0, 19, this.zPlacement[1]);
    this.wings.push(w0, w1, w2);
  }

  override render(e: Entity | null, ls: number, la: number, age: number, headYaw: number, headPitch: number, scale: number): void {
    this.setRotationAngles(ls, la, age, headYaw, headPitch, scale, e);
    for (const p of this.bodyParts) p.render(scale);
    for (const w of this.wings) w.render(scale);
  }

  override setRotationAngles(_ls: number, _la: number, age: number, _hy: number, _hp: number, _scale: number, _e: Entity | null): void {
    const PI = f(Math.PI);
    for (let i = 0; i < this.bodyParts.length; i++) {
      const a = f(f(age * f(0.9)) + f(f(i * f(0.15)) * PI));
      this.bodyParts[i].rotateAngleY = f(f(f(MathHelper.cos(a) * PI) * f(0.05)) * (1 + Math.abs(i - 2)));
      this.bodyParts[i].rotationPointX = f(f(f(MathHelper.sin(a) * PI) * f(0.2)) * Math.abs(i - 2));
    }
    this.wings[0].rotateAngleY = this.bodyParts[2].rotateAngleY;
    this.wings[1].rotateAngleY = this.bodyParts[4].rotateAngleY;
    this.wings[1].rotationPointX = this.bodyParts[4].rotationPointX;
    this.wings[2].rotateAngleY = this.bodyParts[1].rotateAngleY;
    this.wings[2].rotationPointX = this.bodyParts[1].rotationPointX;
  }
}
