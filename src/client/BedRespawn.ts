import type { EntityPlayer } from '../entity/EntityPlayer';
import type { ChunkProviderClient } from '../world/ChunkProviderClient';
import { World } from '../world/World';

/**
 * Before ServerConfigurationManager.respawnPlayer looks for the bed (PlayerSpawning.respawn,
 * EntityPlayer.verifyRespawnCoordinates): the original loaded the chunks around the bed first.
 * Chunks the player changed are kept in memory when unloaded, so those around the bed are put
 * back into the world here.
 */
export function loadChunksAroundBed(old: EntityPlayer, w: World, chunks: ChunkProviderClient | null): void {
  const bed = old.getBedLocation();
  if (!bed || !chunks) return;
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
