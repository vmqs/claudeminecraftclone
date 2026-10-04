import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import { ModelBase } from './ModelBase';
import { ModelRenderer } from './ModelRenderer';

const f = Math.fround;
const RAD = f(180 / f(Math.PI));

/**
 * The witch (ModelWitch on the villager geometry of ModelVillager, 64x128 texture): villager
 * head with a wobbling nose and its wart, the stepped hat (four nested, slightly tilted
 * tiers), robe, folded arms and legs. While she holds a potion the nose tips up.
 */
export class ModelWitch extends ModelBase {
  readonly villagerHead: ModelRenderer;
  readonly villagerBody: ModelRenderer;
  readonly villagerArms: ModelRenderer;
  readonly rightVillagerLeg: ModelRenderer;
  readonly leftVillagerLeg: ModelRenderer;
  /** The nose (ModelVillager.field_82898_f), a child of the head. */
  readonly villagerNose: ModelRenderer;
  /** Holding something: nose raised (field_82900_g). */
  holdingItem = false;
  private readonly wart: ModelRenderer;
  private readonly witchHat: ModelRenderer;

  constructor(grow = 0) {
    super();
    const tw = 64;
    const th = 128;
    const y = 0;
    this.villagerHead = new ModelRenderer(this).setTextureSize(tw, th);
    this.villagerHead.setRotationPoint(0, 0 + y, 0);
    this.villagerHead.setTextureOffset(0, 0).addBox(-4, -10, -4, 8, 10, 8, grow);
    this.villagerNose = new ModelRenderer(this).setTextureSize(tw, th);
    this.villagerNose.setRotationPoint(0, y - 2, 0);
    this.villagerNose.setTextureOffset(24, 0).addBox(-1, -1, -6, 2, 4, 2, grow);
    this.villagerHead.addChild(this.villagerNose);
    this.villagerBody = new ModelRenderer(this).setTextureSize(tw, th);
    this.villagerBody.setRotationPoint(0, 0 + y, 0);
    this.villagerBody.setTextureOffset(16, 20).addBox(-4, 0, -3, 8, 12, 6, grow);
    this.villagerBody.setTextureOffset(0, 38).addBox(-4, 0, -3, 8, 18, 6, f(grow + f(0.5)));
    this.villagerArms = new ModelRenderer(this).setTextureSize(tw, th);
    this.villagerArms.setRotationPoint(0, 0 + y + 2, 0);
    this.villagerArms.setTextureOffset(44, 22).addBox(-8, -2, -2, 4, 8, 4, grow);
    this.villagerArms.setTextureOffset(44, 22).addBox(4, -2, -2, 4, 8, 4, grow);
    this.villagerArms.setTextureOffset(40, 38).addBox(-4, 2, -2, 8, 4, 4, grow);
    this.rightVillagerLeg = new ModelRenderer(this, 0, 22).setTextureSize(tw, th);
    this.rightVillagerLeg.setRotationPoint(-2, 12 + y, 0);
    this.rightVillagerLeg.addBox(-2, 0, -2, 4, 12, 4, grow);
    this.leftVillagerLeg = new ModelRenderer(this, 0, 22).setTextureSize(tw, th);
    this.leftVillagerLeg.mirror = true;
    this.leftVillagerLeg.setRotationPoint(2, 12 + y, 0);
    this.leftVillagerLeg.addBox(-2, 0, -2, 4, 12, 4, grow);

    this.wart = new ModelRenderer(this).setTextureSize(tw, th);
    this.wart.setRotationPoint(0, -2, 0);
    this.wart.setTextureOffset(0, 0).addBox(0, 3, -6.75, 1, 1, 1, f(-0.25));
    this.villagerNose.addChild(this.wart);
    this.witchHat = new ModelRenderer(this).setTextureSize(tw, th);
    this.witchHat.setRotationPoint(-5, f(-10.03125), -5);
    this.witchHat.setTextureOffset(0, 64).addBox(0, 0, 0, 10, 2, 10);
    this.villagerHead.addChild(this.witchHat);
    const tier2 = new ModelRenderer(this).setTextureSize(tw, th);
    tier2.setRotationPoint(1.75, -4, 2);
    tier2.setTextureOffset(0, 76).addBox(0, 0, 0, 7, 4, 7);
    tier2.rotateAngleX = f(-0.05235988);
    tier2.rotateAngleZ = f(0.02617994);
    this.witchHat.addChild(tier2);
    const tier3 = new ModelRenderer(this).setTextureSize(tw, th);
    tier3.setRotationPoint(1.75, -4, 2);
    tier3.setTextureOffset(0, 87).addBox(0, 0, 0, 4, 4, 4);
    tier3.rotateAngleX = f(-0.10471976);
    tier3.rotateAngleZ = f(0.05235988);
    tier2.addChild(tier3);
    const tip = new ModelRenderer(this).setTextureSize(tw, th);
    tip.setRotationPoint(1.75, -2, 2);
    tip.setTextureOffset(0, 95).addBox(0, 0, 0, 1, 2, 1, f(0.25));
    tip.rotateAngleX = f(-Math.PI / 15);
    tip.rotateAngleZ = f(0.10471976);
    tier3.addChild(tip);
  }

  /** func_82899_a: model version (RenderWitch rebuilds the model when it changes). */
  getModelVersion(): number {
    return 0;
  }

  override render(e: Entity | null, ls: number, la: number, age: number, headYaw: number, headPitch: number, scale: number): void {
    this.setRotationAngles(ls, la, age, headYaw, headPitch, scale, e);
    this.villagerHead.render(scale);
    this.villagerBody.render(scale);
    this.rightVillagerLeg.render(scale);
    this.leftVillagerLeg.render(scale);
    this.villagerArms.render(scale);
  }

  override setRotationAngles(ls: number, la: number, _age: number, headYaw: number, headPitch: number, _scale: number, e: Entity | null): void {
    this.villagerHead.rotateAngleY = f(headYaw / RAD);
    this.villagerHead.rotateAngleX = f(headPitch / RAD);
    this.villagerArms.rotationPointY = 3;
    this.villagerArms.rotationPointZ = -1;
    this.villagerArms.rotateAngleX = f(-0.75);
    this.rightVillagerLeg.rotateAngleX = f(f(f(MathHelper.cos(f(ls * f(0.6662))) * f(1.4)) * la) * f(0.5));
    this.leftVillagerLeg.rotateAngleX = f(f(f(MathHelper.cos(f(f(ls * f(0.6662)) + f(Math.PI))) * f(1.4)) * la) * f(0.5));
    this.rightVillagerLeg.rotateAngleY = 0;
    this.leftVillagerLeg.rotateAngleY = 0;
    const nose = this.villagerNose;
    nose.offsetX = nose.offsetY = nose.offsetZ = 0;
    const id = e ? e.entityId : 0;
    const ticks = e ? e.ticksExisted : 0;
    const speed = f(f(0.01) * (id % 10));
    nose.rotateAngleX = f(f(f(f(MathHelper.sin(f(ticks * speed)) * f(4.5)) * f(Math.PI)) / 180));
    nose.rotateAngleY = 0;
    nose.rotateAngleZ = f(f(f(f(MathHelper.cos(f(ticks * speed)) * f(2.5)) * f(Math.PI)) / 180));
    if (this.holdingItem) {
      nose.rotateAngleX = f(-0.9);
      nose.offsetZ = f(-0.09375);
      nose.offsetY = f(0.1875);
    }
  }
}
