import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import type { EntityLiving } from '../../entity/EntityLiving';
import type { EntityOcelot } from '../../entity/EntityOcelot';
import { GL } from '../gl/GL';
import { ModelBase } from './ModelBase';
import { ModelRenderer } from './ModelRenderer';

const f = Math.fround;
const PI_F = f(Math.PI);
const RAD = f(180 / PI_F);

/** Pose of ModelOcelot (field_78163_i): sneaking, walking, sprinting, sitting. */
const enum OcelotPose {
  Sneak = 0,
  Walk = 1,
  Sprint = 2,
  Sit = 3,
}

/** The ocelot and cats (ModelOcelot): named head boxes, two-part tail, crouch/sprint/sit poses. */
export class ModelOcelot extends ModelBase {
  private readonly ocelotBackLeftLeg: ModelRenderer;
  private readonly ocelotBackRightLeg: ModelRenderer;
  private readonly ocelotFrontLeftLeg: ModelRenderer;
  private readonly ocelotFrontRightLeg: ModelRenderer;
  private readonly ocelotTail: ModelRenderer;
  private readonly ocelotTail2: ModelRenderer;
  private readonly ocelotHead: ModelRenderer;
  private readonly ocelotBody: ModelRenderer;
  private pose: OcelotPose = OcelotPose.Walk;

  constructor() {
    super();
    this.setTextureOffset('head.main', 0, 0);
    this.setTextureOffset('head.nose', 0, 24);
    this.setTextureOffset('head.ear1', 0, 10);
    this.setTextureOffset('head.ear2', 6, 10);
    this.ocelotHead = new ModelRenderer(this, 'head');
    this.ocelotHead.addBoxNamed('main', f(-2.5), -2, -3, 5, 4, 5);
    this.ocelotHead.addBoxNamed('nose', f(-1.5), 0, -4, 3, 2, 2);
    this.ocelotHead.addBoxNamed('ear1', -2, -3, 0, 1, 1, 2);
    this.ocelotHead.addBoxNamed('ear2', 1, -3, 0, 1, 1, 2);
    this.ocelotHead.setRotationPoint(0, 15, -9);
    this.ocelotBody = new ModelRenderer(this, 20, 0);
    this.ocelotBody.addBox(-2, 3, -8, 4, 16, 6, 0);
    this.ocelotBody.setRotationPoint(0, 12, -10);
    this.ocelotTail = new ModelRenderer(this, 0, 15);
    this.ocelotTail.addBox(f(-0.5), 0, 0, 1, 8, 1);
    this.ocelotTail.rotateAngleX = f(0.9);
    this.ocelotTail.setRotationPoint(0, 15, 8);
    this.ocelotTail2 = new ModelRenderer(this, 4, 15);
    this.ocelotTail2.addBox(f(-0.5), 0, 0, 1, 8, 1);
    this.ocelotTail2.setRotationPoint(0, 20, 14);
    this.ocelotBackLeftLeg = new ModelRenderer(this, 8, 13);
    this.ocelotBackLeftLeg.addBox(-1, 0, 1, 2, 6, 2);
    this.ocelotBackLeftLeg.setRotationPoint(f(1.1), 18, 5);
    this.ocelotBackRightLeg = new ModelRenderer(this, 8, 13);
    this.ocelotBackRightLeg.addBox(-1, 0, 1, 2, 6, 2);
    this.ocelotBackRightLeg.setRotationPoint(f(-1.1), 18, 5);
    this.ocelotFrontLeftLeg = new ModelRenderer(this, 40, 0);
    this.ocelotFrontLeftLeg.addBox(-1, 0, 0, 2, 10, 2);
    this.ocelotFrontLeftLeg.setRotationPoint(f(1.2), f(13.8), -5);
    this.ocelotFrontRightLeg = new ModelRenderer(this, 40, 0);
    this.ocelotFrontRightLeg.addBox(-1, 0, 0, 2, 10, 2);
    this.ocelotFrontRightLeg.setRotationPoint(f(-1.2), f(13.8), -5);
  }

  override render(e: Entity | null, ls: number, la: number, age: number, yaw: number, pitch: number, scale: number): void {
    this.setRotationAngles(ls, la, age, yaw, pitch, scale, e);
    if (this.isChild) {
      const d = 2;
      GL.pushMatrix();
      GL.scale(f(1.5 / d), f(1.5 / d), f(1.5 / d));
      GL.translate(0, f(10 * scale), f(4 * scale));
      this.ocelotHead.render(scale);
      GL.popMatrix();
      GL.pushMatrix();
      GL.scale(1 / d, 1 / d, 1 / d);
      GL.translate(0, f(24 * scale), 0);
      this.ocelotBody.render(scale);
      this.ocelotBackLeftLeg.render(scale);
      this.ocelotBackRightLeg.render(scale);
      this.ocelotFrontLeftLeg.render(scale);
      this.ocelotFrontRightLeg.render(scale);
      this.ocelotTail.render(scale);
      this.ocelotTail2.render(scale);
      GL.popMatrix();
    } else {
      this.ocelotHead.render(scale);
      this.ocelotBody.render(scale);
      this.ocelotTail.render(scale);
      this.ocelotTail2.render(scale);
      this.ocelotBackLeftLeg.render(scale);
      this.ocelotBackRightLeg.render(scale);
      this.ocelotFrontLeftLeg.render(scale);
      this.ocelotFrontRightLeg.render(scale);
    }
  }

  override setRotationAngles(ls: number, la: number, _age: number, yaw: number, pitch: number, _scale: number, _e: Entity | null): void {
    this.ocelotHead.rotateAngleX = f(pitch / RAD);
    this.ocelotHead.rotateAngleY = f(yaw / RAD);
    if (this.pose === OcelotPose.Sit) return;
    this.ocelotBody.rotateAngleX = f(PI_F / 2);
    const a = f(ls * f(0.6662));
    if (this.pose === OcelotPose.Sprint) {
      this.ocelotBackLeftLeg.rotateAngleX = f(MathHelper.cos(a) * la);
      this.ocelotBackRightLeg.rotateAngleX = f(MathHelper.cos(f(a + f(0.3))) * la);
      this.ocelotFrontLeftLeg.rotateAngleX = f(MathHelper.cos(f(f(a + PI_F) + f(0.3))) * la);
      this.ocelotFrontRightLeg.rotateAngleX = f(MathHelper.cos(f(a + PI_F)) * la);
      this.ocelotTail2.rotateAngleX = f(f(1.7278761) + f(f(f(Math.PI / 10) * MathHelper.cos(ls)) * la));
    } else {
      this.ocelotBackLeftLeg.rotateAngleX = f(MathHelper.cos(a) * la);
      this.ocelotBackRightLeg.rotateAngleX = f(MathHelper.cos(f(a + PI_F)) * la);
      this.ocelotFrontLeftLeg.rotateAngleX = f(MathHelper.cos(f(a + PI_F)) * la);
      this.ocelotFrontRightLeg.rotateAngleX = f(MathHelper.cos(a) * la);
      const swing = this.pose === OcelotPose.Walk ? f(PI_F / 4) : f(0.47123894);
      this.ocelotTail2.rotateAngleX = f(f(1.7278761) + f(f(swing * MathHelper.cos(ls)) * la));
    }
  }

  override setLivingAnimations(e: EntityLiving, _ls: number, _la: number, _pt: number): void {
    const cat = e as EntityOcelot;
    this.ocelotBody.rotationPointY = 12;
    this.ocelotBody.rotationPointZ = -10;
    this.ocelotHead.rotationPointY = 15;
    this.ocelotHead.rotationPointZ = -9;
    this.ocelotTail.rotationPointY = 15;
    this.ocelotTail.rotationPointZ = 8;
    this.ocelotTail2.rotationPointY = 20;
    this.ocelotTail2.rotationPointZ = 14;
    this.ocelotFrontLeftLeg.rotationPointY = this.ocelotFrontRightLeg.rotationPointY = f(13.8);
    this.ocelotFrontLeftLeg.rotationPointZ = this.ocelotFrontRightLeg.rotationPointZ = -5;
    this.ocelotBackLeftLeg.rotationPointY = this.ocelotBackRightLeg.rotationPointY = 18;
    this.ocelotBackLeftLeg.rotationPointZ = this.ocelotBackRightLeg.rotationPointZ = 5;
    this.ocelotTail.rotateAngleX = f(0.9);
    if (cat.isSneaking()) {
      this.ocelotBody.rotationPointY++;
      this.ocelotHead.rotationPointY += 2;
      this.ocelotTail.rotationPointY++;
      this.ocelotTail2.rotationPointY += -4;
      this.ocelotTail2.rotationPointZ += 2;
      this.ocelotTail.rotateAngleX = f(PI_F / 2);
      this.ocelotTail2.rotateAngleX = f(PI_F / 2);
      this.pose = OcelotPose.Sneak;
    } else if (cat.isSprinting()) {
      this.ocelotTail2.rotationPointY = this.ocelotTail.rotationPointY;
      this.ocelotTail2.rotationPointZ += 2;
      this.ocelotTail.rotateAngleX = f(PI_F / 2);
      this.ocelotTail2.rotateAngleX = f(PI_F / 2);
      this.pose = OcelotPose.Sprint;
    } else if (cat.isSitting()) {
      this.ocelotBody.rotateAngleX = f(PI_F / 4);
      this.ocelotBody.rotationPointY += -4;
      this.ocelotBody.rotationPointZ += 5;
      this.ocelotHead.rotationPointY = f(this.ocelotHead.rotationPointY + f(-3.3));
      this.ocelotHead.rotationPointZ++;
      this.ocelotTail.rotationPointY += 8;
      this.ocelotTail.rotationPointZ += -2;
      this.ocelotTail2.rotationPointY += 2;
      this.ocelotTail2.rotationPointZ = f(this.ocelotTail2.rotationPointZ + f(-0.8));
      this.ocelotTail.rotateAngleX = f(1.7278761);
      this.ocelotTail2.rotateAngleX = f(2.670354);
      this.ocelotFrontLeftLeg.rotateAngleX = this.ocelotFrontRightLeg.rotateAngleX = f(-Math.PI / 20);
      this.ocelotFrontLeftLeg.rotationPointY = this.ocelotFrontRightLeg.rotationPointY = f(15.8);
      this.ocelotFrontLeftLeg.rotationPointZ = this.ocelotFrontRightLeg.rotationPointZ = -7;
      this.ocelotBackLeftLeg.rotateAngleX = this.ocelotBackRightLeg.rotateAngleX = f(-Math.PI / 2);
      this.ocelotBackLeftLeg.rotationPointY = this.ocelotBackRightLeg.rotationPointY = 21;
      this.ocelotBackLeftLeg.rotationPointZ = this.ocelotBackRightLeg.rotationPointZ = 1;
      this.pose = OcelotPose.Sit;
    } else {
      this.pose = OcelotPose.Walk;
    }
  }
}
