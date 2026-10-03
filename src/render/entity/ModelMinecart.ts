import type { Entity } from '../../entity/Entity';
import { ModelBase } from './ModelBase';
import { ModelRenderer } from './ModelRenderer';

const f = Math.fround;

/** The minecart body (ModelMinecart): floor, four walls and the inner floor (texture /item/cart.png). */
export class ModelMinecart extends ModelBase {
  readonly sideModels: ModelRenderer[] = [];

  constructor() {
    super();
    const s = this.sideModels;
    s[0] = new ModelRenderer(this, 0, 10);
    s[1] = new ModelRenderer(this, 0, 0);
    s[2] = new ModelRenderer(this, 0, 0);
    s[3] = new ModelRenderer(this, 0, 0);
    s[4] = new ModelRenderer(this, 0, 0);
    s[5] = new ModelRenderer(this, 44, 10);
    const w = 20;
    const h = 8;
    const d = 16;
    const y = 4;
    s[0].addBox(-w / 2, -d / 2, -1, w, d, 2, 0);
    s[0].setRotationPoint(0, y, 0);
    s[5].addBox(-w / 2 + 1, -d / 2 + 1, -1, w - 2, d - 2, 1, 0);
    s[5].setRotationPoint(0, y, 0);
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
    s[5].rotateAngleX = f(-Math.PI / 2);
  }

  override render(_e: Entity | null, _ls: number, _la: number, age: number, _yaw: number, _pitch: number, scale: number): void {
    this.sideModels[5].rotationPointY = f(4 - age);
    for (let i = 0; i < 6; i++) this.sideModels[i].render(scale);
  }
}
