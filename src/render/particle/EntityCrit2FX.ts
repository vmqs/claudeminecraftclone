import type { Entity } from '../../entity/Entity';
import type { World } from '../../world/World';
import type { Tessellator } from '../gl/Tessellator';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/** An invisible emitter: 16 crit particles around the hit entity for 3 ticks. */
export class EntityCrit2FX extends EntityFX {
  private currentLife = 0;
  private readonly maximumLife = 3;

  constructor(
    w: World,
    private readonly theEntity: Entity,
    private readonly particleName = 'crit',
  ) {
    super(w, theEntity.posX, theEntity.boundingBox.minY + f(theEntity.height / 2), theEntity.posZ, theEntity.motionX, theEntity.motionY, theEntity.motionZ);
    this.onUpdate();
  }

  override renderParticle(_t: Tessellator, _pt: number): void {}

  override onUpdate(): void {
    // Called from the super constructor before the fields exist.
    if (!this.theEntity) return;
    const e = this.theEntity;
    for (let i = 0; i < 16; i++) {
      const dx = f(this.rand.nextFloat() * 2 - 1);
      const dy = f(this.rand.nextFloat() * 2 - 1);
      const dz = f(this.rand.nextFloat() * 2 - 1);
      if (dx * dx + dy * dy + dz * dz > 1) continue;
      this.worldObj.spawnParticle(
        this.particleName,
        e.posX + (dx * e.width) / 4,
        e.boundingBox.minY + f(e.height / 2) + (dy * e.height) / 4,
        e.posZ + (dz * e.width) / 4,
        dx,
        dy + 0.2,
        dz,
      );
    }
    if (++this.currentLife >= this.maximumLife) this.setDead();
  }

  override getFXLayer(): number {
    return 3;
  }
}
