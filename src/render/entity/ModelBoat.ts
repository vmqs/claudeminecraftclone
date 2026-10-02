import type { Entity } from '../../entity/Entity';
import { ModelBase } from './ModelBase';
import { ModelRenderer } from './ModelRenderer';

const f = Math.fround;

/** The boat (ModelBoat): a flat bottom and four low walls (texture /item/boat.png). */
export class ModelBoat extends ModelBase {
  readonly boatSides: ModelRenderer[] = [];

  constructor() {
    super();
    const s = this.boatSides;
    s[0] = new ModelRenderer(this, 0, 8);
    s[1] = new ModelRenderer(this, 0, 0);
    s[2] = new ModelRenderer(this, 0, 0);
    s[3] = new ModelRenderer(this, 0, 0);
    s[4] = new ModelRenderer(this, 0, 0);
    const w = 24;
    const h = 6;
    const d = 20;
    const y = 4;
    s[0].addBox(-w / 2, -d / 2 + 2, -3, w, d - 4, 4, 0);
    s[0].setRotationPoint(0, y, 0);
    s[1].addBox(-w / 2 + 2, -h - 1, -1, w - 4, h, 2, 0);
    s[1].setRotationPoint(-w / 2 + 1, y, 0);
    s[2].addBox(-w / 2 + 2, -h - 1, -1, w - 4, h, 2, 0);
    s[2].setRotationPoint(w / 2 - 1, y, 0);
    s[3].addBox(-w / 2 + 2, -h - 1, -1, w - 4, h, 2, 0);
    s[3].setRotationPoint(0, y, -d / 2 + 1);
    s[4].addBox(-w / 2 + 2, -h - 1, -1, w - 4, h, 2, 0);
    s[4].setRotationPoint(0, y, d / 2 - 1);
    s[0].rotateAngleX = f(Math.PI / 2);
    s[1].rotateAngleY = f((Math.PI * 3) / 2);
    s[2].rotateAngleY = f(Math.PI / 2);
    s[3].rotateAngleY = f(Math.PI);
  }

  override render(_e: Entity | null, _ls: number, _la: number, _age: number, _yaw: number, _pitch: number, scale: number): void {
    for (let i = 0; i < 5; i++) this.boatSides[i].render(scale);
  }
}
