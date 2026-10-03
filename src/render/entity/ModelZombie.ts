import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import { ModelBiped } from './ModelBiped';

const f = Math.fround;

/**
 * The zombie arm pose shared by zombies, zombie villagers, pigmen and skeletons: both arms
 * held straight forward, swinging down with the attack and swaying with the idle bob.
 */
export function applyZombieArms(m: ModelBiped, age: number): void {
  const swing = MathHelper.sin(f(m.onGround * f(Math.PI)));
  const swing2 = MathHelper.sin(f(f(1 - f(f(1 - m.onGround) * f(1 - m.onGround))) * f(Math.PI)));
  const ra = m.bipedRightArm;
  const la = m.bipedLeftArm;
  ra.rotateAngleZ = 0;
  la.rotateAngleZ = 0;
  ra.rotateAngleY = -f(f(0.1) - f(swing * f(0.6)));
  la.rotateAngleY = f(f(0.1) - f(swing * f(0.6)));
  ra.rotateAngleX = f(-Math.PI / 2);
  la.rotateAngleX = f(-Math.PI / 2);
  ra.rotateAngleX = f(ra.rotateAngleX - f(f(swing * f(1.2)) - f(swing2 * f(0.4))));
  la.rotateAngleX = f(la.rotateAngleX - f(f(swing * f(1.2)) - f(swing2 * f(0.4))));
  const sway = f(f(MathHelper.cos(f(age * f(0.09))) * f(0.05)) + f(0.05));
  ra.rotateAngleZ = f(ra.rotateAngleZ + sway);
  la.rotateAngleZ = f(la.rotateAngleZ - sway);
  const nod = f(MathHelper.sin(f(age * f(0.067))) * f(0.05));
  ra.rotateAngleX = f(ra.rotateAngleX + nod);
  la.rotateAngleX = f(la.rotateAngleX - nod);
}

/** ModelZombie: a biped with the zombie arm pose; the body texture is 64x64 (armour layers 64x32). */
export class ModelZombie extends ModelBiped {
  constructor(grow = 0, armor = false, texW = 64, texH = armor ? 32 : 64) {
    super(grow, 0, texW, texH);
  }

  override setRotationAngles(limbSwing: number, limbAmount: number, age: number, headYaw: number, headPitch: number, scale: number, e: Entity | null): void {
    super.setRotationAngles(limbSwing, limbAmount, age, headYaw, headPitch, scale, e);
    applyZombieArms(this, age);
  }
}
