import type { World } from '../../world/World';
import { EntityRainFX } from './EntityRainFX';

const f = Math.fround;

/**
 * "splash": a water drop (rain cell + 1) thrown up when something lands in water, a fish
 * bites or a drip hits the ground. A purely horizontal velocity is used as given (plus 0.1 up).
 */
export class EntitySplashFX extends EntityRainFX {
  constructor(w: World, x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    super(w, x, y, z);
    this.particleGravity = f(0.04);
    this.nextTextureIndexX();
    if (vy === 0 && (vx !== 0 || vz !== 0)) {
      this.motionX = vx;
      this.motionY = vy + 0.1;
      this.motionZ = vz;
    }
  }
}
