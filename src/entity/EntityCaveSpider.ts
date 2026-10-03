import { PotionEffect } from '../potion/PotionEffect';
import type { World } from '../world/World';
import type { Entity } from './Entity';
import type { EntityLiving } from './EntityLiving';
import { EntitySpider } from './EntitySpider';
import { PotionId, type PotionEffectLike } from './PotionEffects';

const f = Math.fround;

/** A cave spider (EntityCaveSpider): a 0.7-scale spider with 12 health whose bite poisons (7 s Normal, 15 s Hard). */
export class EntityCaveSpider extends EntitySpider {
  constructor(world: World) {
    super(world);
    this.texture = '/mob/cavespider.png';
    this.setSize(f(0.7), f(0.5));
  }

  override getMaxHealth(): number {
    return 12;
  }

  override spiderScaleAmount(): number {
    return f(0.7);
  }

  override attackEntityAsMob(target: Entity): boolean {
    if (!super.attackEntityAsMob(target)) return false;
    if (target.isLivingEntity) {
      const diff = this.worldObj.difficultySetting;
      const seconds = diff === 2 ? 7 : diff === 3 ? 15 : 0;
      if (seconds > 0) (target as EntityLiving).addPotionEffect(new PotionEffect(PotionId.poison, seconds * 20, 0) as unknown as PotionEffectLike);
    }
    return true;
  }

  /** No jockeys. */
  override initCreature(): void {}
}
