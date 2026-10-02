import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import { ModelBase } from './ModelBase';
import { ModelRenderer } from './ModelRenderer';

const f = Math.fround;
const PI_F = f(Math.PI);
const RAD = f(180 / PI_F);

/**
 * The villager (ModelVillager, 64x64): big head with nose, robe, crossed arms and legs; zombie
 * villagers reuse the geometry.
 */
export class ModelVillager extends ModelBase {
  readonly villagerHead: ModelRenderer;
  readonly villagerBody: ModelRenderer;
  readonly villagerArms: ModelRenderer;
  readonly rightVillagerLeg: ModelRenderer;
  readonly leftVillagerLeg: ModelRenderer;
  /** field_82898_f: the nose. */
  readonly villagerNose: ModelRenderer;

  constructor(grow = 0, yOffset = 0, texW = 64, texH = 64) {
    super();
    this.villagerHead = new ModelRenderer(this).setTextureSize(texW, texH);
    this.villagerHead.setRotationPoint(0, 0 + yOffset, 0);
    this.villagerHead.setTextureOffset(0, 0).addBox(-4, -10, -4, 8, 10, 8, grow);
    this.villagerNose = new ModelRenderer(this).setTextureSize(texW, texH);
    this.villagerNose.setRotationPoint(0, f(yOffset - 2), 0);
    this.villagerNose.setTextureOffset(24, 0).addBox(-1, -1, -6, 2, 4, 2, grow);
    this.villagerHead.addChild(this.villagerNose);
    this.villagerBody = new ModelRenderer(this).setTextureSize(texW, texH);
    this.villagerBody.setRotationPoint(0, 0 + yOffset, 0);
    this.villagerBody.setTextureOffset(16, 20).addBox(-4, 0, -3, 8, 12, 6, grow);
    this.villagerBody.setTextureOffset(0, 38).addBox(-4, 0, -3, 8, 18, 6, f(grow + f(0.5)));
    this.villagerArms = new ModelRenderer(this).setTextureSize(texW, texH);
    this.villagerArms.setRotationPoint(0, f(0 + yOffset + 2), 0);
    this.villagerArms.setTextureOffset(44, 22).addBox(-8, -2, -2, 4, 8, 4, grow);
    this.villagerArms.setTextureOffset(44, 22).addBox(4, -2, -2, 4, 8, 4, grow);
    this.villagerArms.setTextureOffset(40, 38).addBox(-4, 2, -2, 8, 4, 4, grow);
    this.rightVillagerLeg = new ModelRenderer(this, 0, 22).setTextureSize(texW, texH);
    this.rightVillagerLeg.setRotationPoint(-2, f(12 + yOffset), 0);
    this.rightVillagerLeg.addBox(-2, 0, -2, 4, 12, 4, grow);
    this.leftVillagerLeg = new ModelRenderer(this, 0, 22).setTextureSize(texW, texH);
    this.leftVillagerLeg.mirror = true;
    this.leftVillagerLeg.setRotationPoint(2, f(12 + yOffset), 0);
    this.leftVillagerLeg.addBox(-2, 0, -2, 4, 12, 4, grow);
  }

  override render(e: Entity | null, ls: number, la: number, age: number, yaw: number, pitch: number, scale: number): void {
    this.setRotationAngles(ls, la, age, yaw, pitch, scale, e);
    this.villagerHead.render(scale);
    this.villagerBody.render(scale);
    this.rightVillagerLeg.render(scale);
    this.leftVillagerLeg.render(scale);
    this.villagerArms.render(scale);
  }

  override setRotationAngles(ls: number, la: number, _age: number, yaw: number, pitch: number, _scale: number, _e: Entity | null): void {
    this.villagerHead.rotateAngleY = f(yaw / RAD);
    this.villagerHead.rotateAngleX = f(pitch / RAD);
    this.villagerArms.rotationPointY = 3;
    this.villagerArms.rotationPointZ = -1;
    this.villagerArms.rotateAngleX = f(-0.75);
    const a = f(ls * f(0.6662));
    this.rightVillagerLeg.rotateAngleX = f(f(f(MathHelper.cos(a) * f(1.4)) * la) * f(0.5));
    this.leftVillagerLeg.rotateAngleX = f(f(f(MathHelper.cos(f(a + PI_F)) * f(1.4)) * la) * f(0.5));
    this.rightVillagerLeg.rotateAngleY = 0;
    this.leftVillagerLeg.rotateAngleY = 0;
  }
}
