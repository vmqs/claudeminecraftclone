import type { World } from '../../world/World';
import type { Tessellator } from '../gl/Tessellator';
import { EntityFX } from './EntityFX';

/**
 * "hugeexplosion": an invisible emitter (on the terrain layer, so it counts in F3's "P:") that
 * throws six "largeexplode" sprites per tick for 8 ticks within 4 blocks, each smaller than the
 * last (the x velocity carries the progress 0..7/8).
 */
export class EntityHugeExplodeFX extends EntityFX {
  private timeSinceStart = 0;
  private readonly maximumTime = 8;

  constructor(w: World, x: number, y: number, z: number, _vx: number, _vy: number, _vz: number) {
    super(w, x, y, z, 0, 0, 0);
  }

  override renderParticle(_t: Tessellator, _pt: number): void {}

  override onUpdate(): void {
    for (let i = 0; i < 6; i++) {
      const x = this.posX + (this.rand.nextDouble() - this.rand.nextDouble()) * 4;
      const y = this.posY + (this.rand.nextDouble() - this.rand.nextDouble()) * 4;
      const z = this.posZ + (this.rand.nextDouble() - this.rand.nextDouble()) * 4;
      this.worldObj.spawnParticle('largeexplode', x, y, z, Math.fround(this.timeSinceStart / this.maximumTime), 0, 0);
    }
    if (++this.timeSinceStart === this.maximumTime) this.setDead();
  }

  override getFXLayer(): number {
    return 1;
  }
}
