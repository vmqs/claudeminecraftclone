import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import type { EntityBat } from '../../entity/EntityBat';
import { ModelBase } from './ModelBase';
import { ModelRenderer } from './ModelRenderer';

const f = Math.fround;
const PI_F = f(Math.PI);
const RAD = f(180 / PI_F);

/** The bat (ModelBat): head with ears, body, two-part wings flapping in flight, folded when hanging. */
export class ModelBat extends ModelBase {
  private readonly batHead: ModelRenderer;
  private readonly batBody: ModelRenderer;
  private readonly batRightWing: ModelRenderer;
  private readonly batLeftWing: ModelRenderer;
  private readonly batOuterRightWing: ModelRenderer;
  private readonly batOuterLeftWing: ModelRenderer;

  constructor() {
    super();
    this.textureWidth = 64;
    this.textureHeight = 64;
    this.batHead = new ModelRenderer(this, 0, 0);
    this.batHead.addBox(-3, -3, -3, 6, 6, 6);
    const rightEar = new ModelRenderer(this, 24, 0);
    rightEar.addBox(-4, -6, -2, 3, 4, 1);
    this.batHead.addChild(rightEar);
    const leftEar = new ModelRenderer(this, 24, 0);
    leftEar.mirror = true;
    leftEar.addBox(1, -6, -2, 3, 4, 1);
    this.batHead.addChild(leftEar);
    this.batBody = new ModelRenderer(this, 0, 16);
    this.batBody.addBox(-3, 4, -3, 6, 12, 6);
    this.batBody.setTextureOffset(0, 34).addBox(-5, 16, 0, 10, 6, 1);
    this.batRightWing = new ModelRenderer(this, 42, 0);
    this.batRightWing.addBox(-12, 1, f(1.5), 10, 16, 1);
    this.batOuterRightWing = new ModelRenderer(this, 24, 16);
    this.batOuterRightWing.setRotationPoint(-12, 1, f(1.5));
    this.batOuterRightWing.addBox(-8, 1, 0, 8, 12, 1);
    this.batLeftWing = new ModelRenderer(this, 42, 0);
    this.batLeftWing.mirror = true;
    this.batLeftWing.addBox(2, 1, f(1.5), 10, 16, 1);
    this.batOuterLeftWing = new ModelRenderer(this, 24, 16);
    this.batOuterLeftWing.mirror = true;
    this.batOuterLeftWing.setRotationPoint(12, 1, f(1.5));
    this.batOuterLeftWing.addBox(0, 1, 0, 8, 12, 1);
    this.batBody.addChild(this.batRightWing);
    this.batBody.addChild(this.batLeftWing);
    this.batRightWing.addChild(this.batOuterRightWing);
    this.batLeftWing.addChild(this.batOuterLeftWing);
  }

  getBatSize(): number {
    return 36;
  }

  override render(e: Entity | null, _ls: number, _la: number, age: number, yaw: number, pitch: number, scale: number): void {
    const bat = e as EntityBat;
    if (bat.getIsBatHanging()) {
      this.batHead.rotateAngleX = f(pitch / RAD);
      this.batHead.rotateAngleY = f(PI_F - f(yaw / RAD));
      this.batHead.rotateAngleZ = PI_F;
      this.batHead.setRotationPoint(0, -2, 0);
      this.batRightWing.setRotationPoint(-3, 0, 3);
      this.batLeftWing.setRotationPoint(3, 0, 3);
      this.batBody.rotateAngleX = PI_F;
      this.batRightWing.rotateAngleX = f(-Math.PI / 20);
      this.batRightWing.rotateAngleY = f((-Math.PI * 2) / 5);
      this.batOuterRightWing.rotateAngleY = f(-1.7278761);
      this.batLeftWing.rotateAngleX = this.batRightWing.rotateAngleX;
      this.batLeftWing.rotateAngleY = -this.batRightWing.rotateAngleY;
      this.batOuterLeftWing.rotateAngleY = -this.batOuterRightWing.rotateAngleY;
    } else {
      this.batHead.rotateAngleX = f(pitch / RAD);
      this.batHead.rotateAngleY = f(yaw / RAD);
      this.batHead.rotateAngleZ = 0;
      this.batHead.setRotationPoint(0, 0, 0);
      this.batRightWing.setRotationPoint(0, 0, 0);
      this.batLeftWing.setRotationPoint(0, 0, 0);
      this.batBody.rotateAngleX = f(f(PI_F / 4) + f(MathHelper.cos(f(age * f(0.1))) * f(0.15)));
      this.batBody.rotateAngleY = 0;
      this.batRightWing.rotateAngleY = f(f(MathHelper.cos(f(age * f(1.3))) * PI_F) * f(0.25));
      this.batLeftWing.rotateAngleY = -this.batRightWing.rotateAngleY;
      this.batOuterRightWing.rotateAngleY = f(this.batRightWing.rotateAngleY * f(0.5));
      this.batOuterLeftWing.rotateAngleY = f(-this.batRightWing.rotateAngleY * f(0.5));
    }
    this.batHead.render(scale);
    this.batBody.render(scale);
  }
}
