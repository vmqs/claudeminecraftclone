import { EntityPlayer } from '../entity/EntityPlayer';
import type { ChunkProviderClient } from '../world/ChunkProviderClient';
import { World } from '../world/World';

const f = Math.fround;

/**
 * The spawn-point part of ServerConfigurationManager.respawnPlayer: a player whose bed (or
 * forced /spawnpoint) is still valid comes back next to it and keeps it as spawn point;
 * otherwise the new player stays at the world spawn and reads "Your home bed was missing or
 * obstructed" (Packet70GameEvent 0). Chunks the player changed are kept in memory when
 * unloaded, so the ones around the bed are put back first (the original loaded them).
 */
export function respawnAtBedLocation(old: EntityPlayer, p: EntityPlayer, w: World, chunks: ChunkProviderClient | null): void {
  const bed = old.getBedLocation();
  if (!bed) return;
  const forced = old.isSpawnForced();
  if (chunks) {
    for (const [dx, dz] of [
      [-3, -3],
      [3, -3],
      [-3, 3],
      [3, 3],
    ]) {
      const cx = (bed.posX + dx) >> 4;
      const cz = (bed.posZ + dz) >> 4;
      const k = World.chunkKey(cx, cz);
      const kept = chunks.stored.get(k);
      if (kept && !w.chunkExists(cx, cz)) {
        chunks.stored.delete(k);
        w.addChunk(kept);
      }
    }
  }
  const spot = EntityPlayer.verifyRespawnCoordinates(w, bed, forced);
  if (spot) {
    p.setLocationAndAngles(f(spot.posX + f(0.5)), f(spot.posY + f(0.1)), f(spot.posZ + f(0.5)), 0, 0);
    p.setSpawnChunk(bed, forced);
  } else {
    p.addChatMessage('tile.bed.notValid');
  }
  while (w.getCollidingBoundingBoxes(p, p.boundingBox).length > 0) p.setPosition(p.posX, p.posY + 1, p.posZ);
}
