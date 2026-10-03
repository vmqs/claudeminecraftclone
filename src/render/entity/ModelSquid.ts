import type { Entity } from '../../entity/Entity';
import { ModelBase } from './ModelBase';
import { ModelRenderer } from './ModelRenderer';

const f = Math.fround;

/** The squid (ModelSquid): a body and eight tentacles bent by the age argument (tentacle angle). */
export class ModelSquid extends ModelBase {
  private readonly squidBody: ModelRenderer;
  private readonly squidTentacles: ModelRenderer[] = [];

  constructor() {
    super();
    const yOff = -16;
    this.squidBody = new ModelRenderer(this, 0, 0);
    this.squidBody.addBox(-6, -8, -6, 12, 16, 12);
    this.squidBody.rotationPointY += 24 + yOff;
    for (let i = 0; i < 8; i++) {
      const t = new ModelRenderer(this, 48, 0);
      let a = (i * Math.PI * 2) / 8;
      t.addBox(-1, 0, -1, 2, 18, 2);
      t.rotationPointX = f(f(Math.cos(a)) * 5);
      t.rotationPointZ = f(f(Math.sin(a)) * 5);
      t.rotationPointY = 31 + yOff;
      a = (i * Math.PI * -2) / 8 + Math.PI / 2;
      t.rotateAngleY = f(a);
      this.squidTentacles.push(t);
    }
  }

  override setRotationAngles(_ls: number, _la: number, age: number, _yaw: number, _pitch: number, _scale: number, _e: Entity | null): void {
    for (const t of this.squidTentacles) t.rotateAngleX = age;
  }

  override render(e: Entity | null, ls: number, la: number, age: number, yaw: number, pitch: number, scale: number): void {
    this.setRotationAngles(ls, la, age, yaw, pitch, scale, e);
    this.squidBody.render(scale);
    for (const t of this.squidTentacles) t.render(scale);
  }
}
