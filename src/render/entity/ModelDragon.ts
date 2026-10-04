import type { Entity } from '../../entity/Entity';
import type { EntityDragon } from '../../entity/EntityDragon';
import type { EntityLiving } from '../../entity/EntityLiving';
import { GL } from '../gl/GL';
import { ModelBase } from './ModelBase';
import { ModelRenderer } from './ModelRenderer';

const f = Math.fround;
const PI_F = f(Math.PI);

/** wrapAngleTo180 on doubles, returned as a float (ModelDragon.updateRotations). */
function updateRotations(a: number): number {
  while (a >= 180) a -= 360;
  while (a < -180) a += 360;
  return f(a);
}

/**
 * The Ender Dragon (ModelDragon, 256x256 texture): a head with a moving jaw on a neck of five
 * segments that follows the ring buffer, the body, two wings with folding tips, front and rear
 * legs (the right side is the left one mirrored by a negative scale) and a twelve-segment tail.
 * The wing beat comes from the dragon's animTime.
 */
export class ModelDragon extends ModelBase {
  private readonly head: ModelRenderer;
  private readonly neck: ModelRenderer;
  private readonly jaw: ModelRenderer;
  private readonly body: ModelRenderer;
  private readonly rearLeg: ModelRenderer;
  private readonly frontLeg: ModelRenderer;
  private readonly rearLegTip: ModelRenderer;
  private readonly frontLegTip: ModelRenderer;
  private readonly rearFoot: ModelRenderer;
  private readonly frontFoot: ModelRenderer;
  private readonly wing: ModelRenderer;
  private readonly wingTip: ModelRenderer;
  private partialTicks = 0;

  constructor(_scale = 0) {
    super();
    this.textureWidth = 256;
    this.textureHeight = 256;
    this.setTextureOffset('body.body', 0, 0);
    this.setTextureOffset('wing.skin', -56, 88);
    this.setTextureOffset('wingtip.skin', -56, 144);
    this.setTextureOffset('rearleg.main', 0, 0);
    this.setTextureOffset('rearfoot.main', 112, 0);
    this.setTextureOffset('rearlegtip.main', 196, 0);
    this.setTextureOffset('head.upperhead', 112, 30);
    this.setTextureOffset('wing.bone', 112, 88);
    this.setTextureOffset('head.upperlip', 176, 44);
    this.setTextureOffset('jaw.jaw', 176, 65);
    this.setTextureOffset('frontleg.main', 112, 104);
    this.setTextureOffset('wingtip.bone', 112, 136);
    this.setTextureOffset('frontfoot.main', 144, 104);
    this.setTextureOffset('neck.box', 192, 104);
    this.setTextureOffset('frontlegtip.main', 226, 138);
    this.setTextureOffset('body.scale', 220, 53);
    this.setTextureOffset('head.scale', 0, 0);
    this.setTextureOffset('neck.scale', 48, 0);
    this.setTextureOffset('head.nostril', 112, 0);
    const z0 = -16;
    this.head = new ModelRenderer(this, 'head');
    this.head.addBoxNamed('upperlip', -6, -1, -8 + z0, 12, 5, 16);
    this.head.addBoxNamed('upperhead', -8, -8, 6 + z0, 16, 16, 16);
    this.head.mirror = true;
    this.head.addBoxNamed('scale', -5, -12, 12 + z0, 2, 4, 6);
    this.head.addBoxNamed('nostril', -5, -3, -6 + z0, 2, 2, 4);
    this.head.mirror = false;
    this.head.addBoxNamed('scale', 3, -12, 12 + z0, 2, 4, 6);
    this.head.addBoxNamed('nostril', 3, -3, -6 + z0, 2, 2, 4);
    this.jaw = new ModelRenderer(this, 'jaw');
    this.jaw.setRotationPoint(0, 4, 8 + z0);
    this.jaw.addBoxNamed('jaw', -6, 0, -16, 12, 4, 16);
    this.head.addChild(this.jaw);
    this.neck = new ModelRenderer(this, 'neck');
    this.neck.addBoxNamed('box', -5, -5, -5, 10, 10, 10);
    this.neck.addBoxNamed('scale', -1, -9, -3, 2, 4, 6);
    this.body = new ModelRenderer(this, 'body');
    this.body.setRotationPoint(0, 4, 8);
    this.body.addBoxNamed('body', -12, 0, -16, 24, 24, 64);
    this.body.addBoxNamed('scale', -1, -6, -10, 2, 6, 12);
    this.body.addBoxNamed('scale', -1, -6, 10, 2, 6, 12);
    this.body.addBoxNamed('scale', -1, -6, 30, 2, 6, 12);
    this.wing = new ModelRenderer(this, 'wing');
    this.wing.setRotationPoint(-12, 5, 2);
    this.wing.addBoxNamed('bone', -56, -4, -4, 56, 8, 8);
    this.wing.addBoxNamed('skin', -56, 0, 2, 56, 0, 56);
    this.wingTip = new ModelRenderer(this, 'wingtip');
    this.wingTip.setRotationPoint(-56, 0, 0);
    this.wingTip.addBoxNamed('bone', -56, -2, -2, 56, 4, 4);
    this.wingTip.addBoxNamed('skin', -56, 0, 2, 56, 0, 56);
    this.wing.addChild(this.wingTip);
    this.frontLeg = new ModelRenderer(this, 'frontleg');
    this.frontLeg.setRotationPoint(-12, 20, 2);
    this.frontLeg.addBoxNamed('main', -4, -4, -4, 8, 24, 8);
    this.frontLegTip = new ModelRenderer(this, 'frontlegtip');
    this.frontLegTip.setRotationPoint(0, 20, -1);
    this.frontLegTip.addBoxNamed('main', -3, -1, -3, 6, 24, 6);
    this.frontLeg.addChild(this.frontLegTip);
    this.frontFoot = new ModelRenderer(this, 'frontfoot');
    this.frontFoot.setRotationPoint(0, 23, 0);
    this.frontFoot.addBoxNamed('main', -4, 0, -12, 8, 4, 16);
    this.frontLegTip.addChild(this.frontFoot);
    this.rearLeg = new ModelRenderer(this, 'rearleg');
    this.rearLeg.setRotationPoint(-16, 16, 42);
    this.rearLeg.addBoxNamed('main', -8, -4, -8, 16, 32, 16);
    this.rearLegTip = new ModelRenderer(this, 'rearlegtip');
    this.rearLegTip.setRotationPoint(0, 32, -4);
    this.rearLegTip.addBoxNamed('main', -6, -2, 0, 12, 32, 12);
    this.rearLeg.addChild(this.rearLegTip);
    this.rearFoot = new ModelRenderer(this, 'rearfoot');
    this.rearFoot.setRotationPoint(0, 31, 4);
    this.rearFoot.addBoxNamed('main', -9, 0, -20, 18, 6, 24);
    this.rearLegTip.addChild(this.rearFoot);
  }

  override setLivingAnimations(_e: EntityLiving, _limbSwing: number, _limbAmount: number, pt: number): void {
    this.partialTicks = pt;
  }

  override render(e: Entity | null, _ls: number, _la: number, _age: number, _head: number, _pitch: number, scale: number): void {
    GL.pushMatrix();
    const d = e as EntityDragon;
    const pt = this.partialTicks;
    const anim = f(d.prevAnimTime + f((d.animTime - d.prevAnimTime) * pt));
    this.jaw.rotateAngleX = f(f(Math.sin(f(f(anim * PI_F) * 2)) + 1) * f(0.2));
    let bob = f(Math.sin(f(f(f(anim * PI_F) * 2) - 1)) + 1);
    bob = f(f(f(f(bob * bob) * 1) + f(bob * 2)) * f(0.05));
    GL.translate(0, f(bob - 2), -3);
    GL.rotate(f(bob * 2), 1, 0, 0);
    let y = 0;
    let x = 0;
    const k = f(1.5);
    const off6 = d.getMovementOffsets(6, pt);
    const turn = updateRotations(d.getMovementOffsets(5, pt)[0] - d.getMovementOffsets(10, pt)[0]);
    const roll = updateRotations(d.getMovementOffsets(5, pt)[0] + turn / 2);
    let beat = f(f(anim * PI_F) * 2);
    y = 20;
    let z = -12;
    const neck = this.neck;
    for (let i = 0; i < 5; i++) {
      const off = d.getMovementOffsets(5 - i, pt);
      const wave = f(f(Math.cos(f(f(i * f(0.45)) + beat))) * f(0.15));
      neck.rotateAngleY = f(f(f(f(updateRotations(off[0] - off6[0]) * PI_F) / 180) * k));
      neck.rotateAngleX = f(wave + f(f(f(f(f(off[1] - off6[1]) * PI_F) / 180) * k) * 5));
      neck.rotateAngleZ = f(f(f(-updateRotations(off[0] - roll) * PI_F) / 180) * k);
      neck.rotationPointY = y;
      neck.rotationPointZ = z;
      neck.rotationPointX = x;
      y = f(y + Math.sin(neck.rotateAngleX) * 10);
      z = f(z - Math.cos(neck.rotateAngleY) * Math.cos(neck.rotateAngleX) * 10);
      x = f(x - Math.sin(neck.rotateAngleY) * Math.cos(neck.rotateAngleX) * 10);
      neck.render(scale);
    }
    this.head.rotationPointY = y;
    this.head.rotationPointZ = z;
    this.head.rotationPointX = x;
    let off = d.getMovementOffsets(0, pt);
    this.head.rotateAngleY = f(f(f(updateRotations(off[0] - off6[0]) * PI_F) / 180) * 1);
    this.head.rotateAngleZ = f(f(f(-updateRotations(off[0] - roll) * PI_F) / 180) * 1);
    this.head.render(scale);
    GL.pushMatrix();
    GL.translate(0, 1, 0);
    GL.rotate(f(f(-turn * k) * 1), 0, 0, 1);
    GL.translate(0, -1, 0);
    this.body.rotateAngleZ = 0;
    this.body.render(scale);
    for (let side = 0; side < 2; side++) {
      GL.enable(GL.CULL_FACE);
      const a = f(f(anim * PI_F) * 2);
      this.wing.rotateAngleX = f(f(0.125) - f(f(Math.cos(a)) * f(0.2)));
      this.wing.rotateAngleY = f(0.25);
      this.wing.rotateAngleZ = f(f(Math.sin(a) + 0.125) * f(0.8));
      this.wingTip.rotateAngleZ = -f(f(Math.sin(f(a + 2)) + 0.5) * f(0.75));
      this.rearLeg.rotateAngleX = f(1 + f(bob * f(0.1)));
      this.rearLegTip.rotateAngleX = f(f(0.5) + f(bob * f(0.1)));
      this.rearFoot.rotateAngleX = f(f(0.75) + f(bob * f(0.1)));
      this.frontLeg.rotateAngleX = f(f(1.3) + f(bob * f(0.1)));
      this.frontLegTip.rotateAngleX = f(f(-0.5) - f(bob * f(0.1)));
      this.frontFoot.rotateAngleX = f(f(0.75) + f(bob * f(0.1)));
      this.wing.render(scale);
      this.frontLeg.render(scale);
      this.rearLeg.render(scale);
      GL.scale(-1, 1, 1);
      if (side === 0) GL.cullFace(GL.FRONT);
    }
    GL.popMatrix();
    GL.cullFace(GL.BACK);
    GL.disable(GL.CULL_FACE);
    let sway = f(-f(Math.sin(f(f(anim * PI_F) * 2))) * 0);
    beat = f(f(anim * PI_F) * 2);
    y = 10;
    z = 60;
    x = 0;
    const off11 = d.getMovementOffsets(11, pt);
    for (let i = 0; i < 12; i++) {
      off = d.getMovementOffsets(12 + i, pt);
      sway = f(sway + Math.sin(f(f(i * f(0.45)) + beat)) * f(0.05));
      neck.rotateAngleY = f(f(f(f(updateRotations(off[0] - off11[0]) * k) + 180) * PI_F) / 180);
      neck.rotateAngleX = f(sway + f(f(f(f(f(off[1] - off11[1]) * PI_F) / 180) * k) * 5));
      neck.rotateAngleZ = f(f(f(updateRotations(off[0] - roll) * PI_F) / 180) * k);
      neck.rotationPointY = y;
      neck.rotationPointZ = z;
      neck.rotationPointX = x;
      y = f(y + Math.sin(neck.rotateAngleX) * 10);
      z = f(z - Math.cos(neck.rotateAngleY) * Math.cos(neck.rotateAngleX) * 10);
      x = f(x - Math.sin(neck.rotateAngleY) * Math.cos(neck.rotateAngleX) * 10);
      neck.render(scale);
    }
    GL.popMatrix();
  }
}
