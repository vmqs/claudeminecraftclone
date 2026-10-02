import type { EntityLiving } from '../../entity/EntityLiving';
import { ModelRenderer } from './ModelRenderer';
import { ModelZombie } from './ModelZombie';
import type { MutableBiped } from './ModelZombieVillager';

/** The skeleton (ModelSkeleton): zombie pose with 2x12x2 limbs; wither skeletons aim (aimedBow). */
export class ModelSkeleton extends ModelZombie {
  constructor(grow = 0) {
    super(grow, false, 64, 32);
    const m = this as unknown as MutableBiped;
    m.bipedRightArm = new ModelRenderer(this, 40, 16);
    m.bipedRightArm.addBox(-1, -2, -1, 2, 12, 2, grow);
    m.bipedRightArm.setRotationPoint(-5, 2, 0);
    m.bipedLeftArm = new ModelRenderer(this, 40, 16);
    m.bipedLeftArm.mirror = true;
    m.bipedLeftArm.addBox(-1, -2, -1, 2, 12, 2, grow);
    m.bipedLeftArm.setRotationPoint(5, 2, 0);
    m.bipedRightLeg = new ModelRenderer(this, 0, 16);
    m.bipedRightLeg.addBox(-1, 0, -1, 2, 12, 2, grow);
    m.bipedRightLeg.setRotationPoint(-2, 12, 0);
    m.bipedLeftLeg = new ModelRenderer(this, 0, 16);
    m.bipedLeftLeg.mirror = true;
    m.bipedLeftLeg.addBox(-1, 0, -1, 2, 12, 2, grow);
    m.bipedLeftLeg.setRotationPoint(2, 12, 0);
  }

  override setLivingAnimations(e: EntityLiving, limbSwing: number, limbAmount: number, pt: number): void {
    this.aimedBow = (e as EntityLiving & { getSkeletonType?(): number }).getSkeletonType?.() === 1;
    super.setLivingAnimations(e, limbSwing, limbAmount, pt);
  }
}
