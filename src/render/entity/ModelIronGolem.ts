import type { Entity } from '../../entity/Entity';
import type { EntityIronGolem } from '../../entity/EntityIronGolem';
import type { EntityLiving } from '../../entity/EntityLiving';
import { ModelBase } from './ModelBase';
import { ModelRenderer } from './ModelRenderer';

const f = Math.fround;
const RAD = f(180 / f(Math.PI));

/** func_78172_a: a triangle wave of period `period`, from -1 to 1. */
export function golemTriangleWave(t: number, period: number): number {
  return f(f(Math.abs(f(f(t % period) - f(period * f(0.5)))) - f(period * f(0.25))) / f(period * f(0.25)));
}

/** The iron golem (ModelIronGolem, 128x128): stiff swinging limbs, arms raised to throw or hold a poppy. */
export class ModelIronGolem extends ModelBase {
  readonly ironGolemHead: ModelRenderer;
  readonly ironGolemBody: ModelRenderer;
  readonly ironGolemRightArm: ModelRenderer;
  readonly ironGolemLeftArm: ModelRenderer;
  readonly ironGolemLeftLeg: ModelRenderer;
  readonly ironGolemRightLeg: ModelRenderer;

  constructor(grow = 0, yOffset = -7) {
    super();
    const tw = 128;
    const th = 128;
    this.ironGolemHead = new ModelRenderer(this).setTextureSize(tw, th);
    this.ironGolemHead.setRotationPoint(0, 0 + yOffset, -2);
    this.ironGolemHead.setTextureOffset(0, 0).addBox(-4, -12, f(-5.5), 8, 10, 8, grow);
    this.ironGolemHead.setTextureOffset(24, 0).addBox(-1, -5, f(-7.5), 2, 4, 2, grow);
    this.ironGolemBody = new ModelRenderer(this).setTextureSize(tw, th);
    this.ironGolemBody.setRotationPoint(0, 0 + yOffset, 0);
    this.ironGolemBody.setTextureOffset(0, 40).addBox(-9, -2, -6, 18, 12, 11, grow);
    this.ironGolemBody.setTextureOffset(0, 70).addBox(f(-4.5), 10, -3, 9, 5, 6, f(grow + f(0.5)));
    this.ironGolemRightArm = new ModelRenderer(this).setTextureSize(tw, th);
    this.ironGolemRightArm.setRotationPoint(0, -7, 0);
    this.ironGolemRightArm.setTextureOffset(60, 21).addBox(-13, f(-2.5), -3, 4, 30, 6, grow);
    this.ironGolemLeftArm = new ModelRenderer(this).setTextureSize(tw, th);
    this.ironGolemLeftArm.setRotationPoint(0, -7, 0);
    this.ironGolemLeftArm.setTextureOffset(60, 58).addBox(9, f(-2.5), -3, 4, 30, 6, grow);
    this.ironGolemLeftLeg = new ModelRenderer(this, 0, 22).setTextureSize(tw, th);
    this.ironGolemLeftLeg.setRotationPoint(-4, 18 + yOffset, 0);
    this.ironGolemLeftLeg.setTextureOffset(37, 0).addBox(f(-3.5), -3, -3, 6, 16, 5, grow);
    this.ironGolemRightLeg = new ModelRenderer(this, 0, 22).setTextureSize(tw, th);
    this.ironGolemRightLeg.mirror = true;
    this.ironGolemRightLeg.setTextureOffset(60, 0).setRotationPoint(5, 18 + yOffset, 0);
    this.ironGolemRightLeg.addBox(f(-3.5), -3, -3, 6, 16, 5, grow);
  }

  override render(e: Entity | null, ls: number, la: number, age: number, yaw: number, pitch: number, scale: number): void {
    this.setRotationAngles(ls, la, age, yaw, pitch, scale, e);
    this.ironGolemHead.render(scale);
    this.ironGolemBody.render(scale);
    this.ironGolemLeftLeg.render(scale);
    this.ironGolemRightLeg.render(scale);
    this.ironGolemRightArm.render(scale);
    this.ironGolemLeftArm.render(scale);
  }

  override setRotationAngles(ls: number, la: number, _age: number, yaw: number, pitch: number, _scale: number, _e: Entity | null): void {
    this.ironGolemHead.rotateAngleY = f(yaw / RAD);
    this.ironGolemHead.rotateAngleX = f(pitch / RAD);
    this.ironGolemLeftLeg.rotateAngleX = f(f(f(-1.5) * golemTriangleWave(ls, 13)) * la);
    this.ironGolemRightLeg.rotateAngleX = f(f(f(1.5) * golemTriangleWave(ls, 13)) * la);
    this.ironGolemLeftLeg.rotateAngleY = 0;
    this.ironGolemRightLeg.rotateAngleY = 0;
  }

  override setLivingAnimations(e: EntityLiving, ls: number, la: number, pt: number): void {
    const golem = e as EntityIronGolem;
    const attack = golem.getAttackTimer();
    if (attack > 0) {
      const a = f(-2 + f(f(1.5) * golemTriangleWave(f(attack - pt), 10)));
      this.ironGolemRightArm.rotateAngleX = a;
      this.ironGolemLeftArm.rotateAngleX = a;
      return;
    }
    const rose = golem.getClientHoldRoseTick();
    if (rose > 0) {
      this.ironGolemRightArm.rotateAngleX = f(f(-0.8) + f(f(0.025) * golemTriangleWave(rose, 70)));
      this.ironGolemLeftArm.rotateAngleX = 0;
    } else {
      this.ironGolemRightArm.rotateAngleX = f(f(f(-0.2) + f(f(1.5) * golemTriangleWave(ls, 13))) * la);
      this.ironGolemLeftArm.rotateAngleX = f(f(f(-0.2) - f(f(1.5) * golemTriangleWave(ls, 13))) * la);
    }
  }
}
