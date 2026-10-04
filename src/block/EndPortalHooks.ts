import type { Entity } from '../entity/Entity';

/**
 * What entering an end portal does, installed by main-thread code (block code is also loaded by
 * the workers). `enterExitPortal` runs on the authoritative world for a player in an end portal
 * in the End: EntityPlayerMP.travelToDimension(1) from dimension 1, i.e. the player conquered
 * the End (achievement, credits, then a respawn keeping everything). Installed by
 * src/client/WinGame.ts.
 */
export const EndPortalHooks = {
  enterExitPortal: null as ((player: Entity) => void) | null,
};
