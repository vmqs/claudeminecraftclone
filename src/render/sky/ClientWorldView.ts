import type { World } from '../../world/World';

/**
 * In 1.5.2 the client world (WorldClient) computes skylightSubtracted once, when it is created
 * at world time 0, and never again, so client-side light queries always see full daylight:
 * EntityRenderer's fog brightness and Entity.getBrightness for the vignette and the water
 * overlay do not darken at night. The world here is also the server, whose value follows the
 * time of day (mob spawning, burning undead), so client-side callers run their light queries
 * through this.
 */
export function withClientSkylight<T>(w: World, query: () => T): T {
  const saved = w.skylightSubtracted;
  w.skylightSubtracted = 0;
  try {
    return query();
  } finally {
    w.skylightSubtracted = saved;
  }
}
