import type { Entity } from '../../entity/Entity';
import { ModelBiped } from './ModelBiped';
import { ModelRenderer } from './ModelRenderer';
import type { MutableBiped } from './ModelZombieVillager';

const f = Math.fround;

/**
 * The enderman (ModelEnderman): a biped lifted 14 pixels with 30-long thin limbs, the head
 * overlay shrunk into the jaw (texture row 16), limb swings halved and clamped to 0.4, arms
 * forward while carrying a block and the head raised 5 pixels (open jaw) while screaming.
 */
export class ModelEnderman extends ModelBiped {
  isCarrying = false;
  isAttacking = false;

  constructor() {
    super(0, -14, 64, 32);
    const y = -14;
    const m = this as MutableBiped;
    m.bipedHeadwear = new ModelRenderer(this, 0, 16);
    m.bipedHeadwear.addBox(-4, -8, -4, 8, 8, 8, f(-0.5));
    m.bipedHeadwear.setRotationPoint(0, 0 + y, 0);
    m.bipedBody = new ModelRenderer(this, 32, 16);
    m.bipedBody.addBox(-4, 0, -2, 8, 12, 4, 0);
    m.bipedBody.setRotationPoint(0, 0 + y, 0);
    m.bipedRightArm = new ModelRenderer(this, 56, 0);
    m.bipedRightArm.addBox(-1, -2, -1, 2, 30, 2, 0);
    m.bipedRightArm.setRotationPoint(-3, 2 + y, 0);
    m.bipedLeftArm = new ModelRenderer(this, 56, 0);
    m.bipedLeftArm.mirror = true;
    m.bipedLeftArm.addBox(-1, -2, -1, 2, 30, 2, 0);
    m.bipedLeftArm.setRotationPoint(5, 2 + y, 0);
    m.bipedRightLeg = new ModelRenderer(this, 56, 0);
    m.bipedRightLeg.addBox(-1, 0, -1, 2, 30, 2, 0);
    m.bipedRightLeg.setRotationPoint(-2, 12 + y, 0);
    m.bipedLeftLeg = new ModelRenderer(this, 56, 0);
    m.bipedLeftLeg.mirror = true;
    m.bipedLeftLeg.addBox(-1, 0, -1, 2, 30, 2, 0);
    m.bipedLeftLeg.setRotationPoint(2, 12 + y, 0);
  }

  override setRotationAngles(ls: number, la: number, age: number, headYaw: number, headPitch: number, scale: number, e: Entity | null): void {
    super.setRotationAngles(ls, la, age, headYaw, headPitch, scale, e);
    this.bipedHead.showModel = true;
    const y = -14;
    this.bipedBody.rotateAngleX = 0;
    this.bipedBody.rotationPointY = y;
    this.bipedBody.rotationPointZ = -0;
    const ra = this.bipedRightArm;
    const la2 = this.bipedLeftArm;
    const rl = this.bipedRightLeg;
    const ll = this.bipedLeftLeg;
    rl.rotateAngleX = f(rl.rotateAngleX - 0);
    ll.rotateAngleX = f(ll.rotateAngleX - 0);
    ra.rotateAngleX = f(ra.rotateAngleX * 0.5);
    la2.rotateAngleX = f(la2.rotateAngleX * 0.5);
    rl.rotateAngleX = f(rl.rotateAngleX * 0.5);
    ll.rotateAngleX = f(ll.rotateAngleX * 0.5);
    const lim = f(0.4);
    for (const p of [ra, la2, rl, ll]) {
      if (p.rotateAngleX > lim) p.rotateAngleX = lim;
      if (p.rotateAngleX < -lim) p.rotateAngleX = -lim;
    }
    if (this.isCarrying) {
      ra.rotateAngleX = f(-0.5);
      la2.rotateAngleX = f(-0.5);
      ra.rotateAngleZ = f(0.05);
      la2.rotateAngleZ = f(-0.05);
    }
    ra.rotationPointZ = 0;
    la2.rotationPointZ = 0;
    rl.rotationPointZ = 0;
    ll.rotationPointZ = 0;
    rl.rotationPointY = 9 + y;
    ll.rotationPointY = 9 + y;
    this.bipedHead.rotationPointZ = -0;
    this.bipedHead.rotationPointY = y + 1;
    const hw = this.bipedHeadwear;
    hw.rotationPointX = this.bipedHead.rotationPointX;
    hw.rotationPointY = this.bipedHead.rotationPointY;
    hw.rotationPointZ = this.bipedHead.rotationPointZ;
    hw.rotateAngleX = this.bipedHead.rotateAngleX;
    hw.rotateAngleY = this.bipedHead.rotateAngleY;
    hw.rotateAngleZ = this.bipedHead.rotateAngleZ;
    if (this.isAttacking) this.bipedHead.rotationPointY -= 5;
  }
}
