import { JavaRandom } from '../../core/JavaRandom';
import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import { GL } from '../gl/GL';
import { ModelBase } from './ModelBase';
import { ModelRenderer } from './ModelRenderer';

const f = Math.fround;

/**
 * The ghast (ModelGhast): a 16-pixel cube with nine 2x2 tentacles of length 8-14 (from a
 * Random seeded 1660) swaying with the tick count, drawn 0.6 lower.
 */
export class ModelGhast extends ModelBase {
  private readonly body: ModelRenderer;
  private readonly tentacles: ModelRenderer[] = [];

  constructor() {
    super();
    const y = -16;
    this.body = new ModelRenderer(this, 0, 0);
    this.body.addBox(-8, -8, -8, 16, 16, 16);
    this.body.rotationPointY += 24 + y;
    const rand = new JavaRandom(1660n);
    for (let i = 0; i < 9; i++) {
      const t = new ModelRenderer(this, 0, 0);
      const inner = f(f(f(i % 3) - f(f(Math.trunc(i / 3) % 2) * f(0.5))) + f(0.25));
      const x = f(f(f(f(inner / 2) * 2) - 1) * 5);
      const z = f(f(f(f(Math.trunc(i / 3) / 2) * 2) - 1) * 5);
      const len = rand.nextInt(7) + 8;
      t.addBox(-1, 0, -1, 2, len, 2);
      t.rotationPointX = x;
      t.rotationPointZ = z;
      t.rotationPointY = 31 + y;
      this.tentacles.push(t);
    }
  }

  override setRotationAngles(_ls: number, _la: number, age: number, _hy: number, _hp: number, _scale: number, _e: Entity | null): void {
    for (let i = 0; i < this.tentacles.length; i++) this.tentacles[i].rotateAngleX = f(f(f(0.2) * MathHelper.sin(f(f(age * f(0.3)) + i))) + f(0.4));
  }

  override render(e: Entity | null, ls: number, la: number, age: number, headYaw: number, headPitch: number, scale: number): void {
    this.setRotationAngles(ls, la, age, headYaw, headPitch, scale, e);
    GL.pushMatrix();
    GL.translate(0, f(0.6), 0);
    this.body.render(scale);
    for (const t of this.tentacles) t.render(scale);
    GL.popMatrix();
  }
}
