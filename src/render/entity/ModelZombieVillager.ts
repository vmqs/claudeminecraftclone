import type { Entity } from '../../entity/Entity';
import { ModelBiped } from './ModelBiped';
import { ModelRenderer } from './ModelRenderer';
import { applyZombieArms } from './ModelZombie';

/** ModelBiped with writable parts, for models that swap them as the original's subclasses do. */
export type MutableBiped = { -readonly [K in keyof ModelBiped]: ModelBiped[K] };

/**
 * The zombie villager (ModelZombieVillager): a villager head (8x10x8 with the nose, texture row
 * 32) on the zombie body; the armour variants keep a plain 8x6x8 head box.
 */
export class ModelZombieVillager extends ModelBiped {
  constructor(grow = 0, yOffset = 0, armor = false) {
    super(grow, 0, 64, armor ? 32 : 64);
    const m = this as MutableBiped;
    if (armor) {
      m.bipedHead = new ModelRenderer(this, 0, 0);
      m.bipedHead.addBox(-4, -10, -4, 8, 6, 8, grow);
      m.bipedHead.setRotationPoint(0, 0 + yOffset, 0);
    } else {
      m.bipedHead = new ModelRenderer(this);
      m.bipedHead.setRotationPoint(0, 0 + yOffset, 0);
      m.bipedHead.setTextureOffset(0, 32).addBox(-4, -10, -4, 8, 10, 8, grow);
      m.bipedHead.setTextureOffset(24, 32).addBox(-1, -3, -6, 2, 4, 2, grow);
    }
  }

  /** func_82897_a: model version (RenderZombie rebuilds its models when it changes). */
  getModelVersion(): number {
    return 10;
  }

  override setRotationAngles(limbSwing: number, limbAmount: number, age: number, headYaw: number, headPitch: number, scale: number, e: Entity | null): void {
    super.setRotationAngles(limbSwing, limbAmount, age, headYaw, headPitch, scale, e);
    applyZombieArms(this, age);
  }
}
