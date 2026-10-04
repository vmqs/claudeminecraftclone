import type { World } from '../../world/World';
import type { TextureMap, TextureStitched } from './TextureMap';

/** What the needles follow: the world and player the client shows (null in the menus). */
export interface NeedleSource {
  readonly theWorld: World | null;
  readonly thePlayer: { posX: number; posZ: number; rotationYaw: number } | null;
}

/**
 * TextureCompass and TextureClock: the compass needle turns towards the world spawn and the
 * clock's dial follows the sun, both easing towards their target every tick (a tenth of the
 * difference, damped by 0.8). Outside surface worlds (the Nether, the End) the target is random
 * every tick, so both spin wildly. The frame shown is picked through TextureStitched.frameSelector.
 */
export function installCompassAndClock(items: TextureMap, source: NeedleSource): void {
  const compass = items.registerIcon('compass') as TextureStitched;
  let angle = 0;
  let angleDelta = 0;
  compass.frameSelector = (icon) => {
    const w = source.theWorld;
    const p = source.thePlayer;
    let target = 0;
    if (w && p) {
      const spawn = w.getSpawnPoint();
      const dx = spawn.x - p.posX;
      const dz = spawn.z - p.posZ;
      const yaw = p.rotationYaw % 360;
      target = -(((yaw - 90) * Math.PI) / 180 - Math.atan2(dz, dx));
      if (!w.provider.isSurfaceWorld()) target = Math.random() * Math.PI * 2;
    }
    let d = target - angle;
    while (d < -Math.PI) d += Math.PI * 2;
    while (d >= Math.PI) d -= Math.PI * 2;
    if (d < -1) d = -1;
    if (d > 1) d = 1;
    angleDelta += d * 0.1;
    angleDelta *= 0.8;
    angle += angleDelta;
    return frameOf(angle / (Math.PI * 2), icon.frames.length);
  };

  const clock = items.registerIcon('clock') as TextureStitched;
  let time = 0;
  let timeDelta = 0;
  clock.frameSelector = (icon) => {
    const w = source.theWorld;
    let target = 0;
    if (w && source.thePlayer) {
      target = w.getCelestialAngle(1);
      if (!w.provider.isSurfaceWorld()) target = Math.random();
    }
    let d = target - time;
    while (d < -0.5) d++;
    while (d >= 0.5) d--;
    if (d < -1) d = -1;
    if (d > 1) d = 1;
    timeDelta += d * 0.1;
    timeDelta *= 0.8;
    time += timeDelta;
    return frameOf(time, icon.frames.length);
  };
}

/** (int)((turns + 1) * n) % n, wrapped into 0..n-1. */
function frameOf(turns: number, n: number): number {
  if (n <= 0) return 0;
  let i = Math.trunc((turns + 1) * n) % n;
  while (i < 0) i = (i + n) % n;
  return i;
}
