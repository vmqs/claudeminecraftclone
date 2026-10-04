/**
 * A chunk source for Node tests of the dimensions (no workers): chunks come from a
 * WorldGenServer of the world's dimension at once, around the requested centre.
 */
import type { ChunkProviderClient } from '../src/world/ChunkProviderClient';
import { Chunk } from '../src/world/Chunk';
import { WorldGenServer } from '../src/world/gen/WorldGenServer';
import type { World } from '../src/world/World';

export function fakeProvider(w: World): ChunkProviderClient {
  const gen = new WorldGenServer({ seed: w.getSeed(), worldType: 'flat', mapFeatures: false, generatorOptions: '2;7,3x1;1', dimension: w.provider.dimensionId });
  const fake = {
    world: w,
    loadRadius: 2,
    extraCenters: [] as { x: number; z: number; radius: number }[],
    pinnedSaved: null,
    saveHandler: null,
    installStructureLocator() {},
    requestSavedArea: () => true,
    processIncoming: () => 0,
    unloadAll() {
      for (const c of [...w.getLoadedChunks()]) w.removeChunk(c.xPosition, c.zPosition);
    },
    dispose() {},
    updateLoadedArea(x: number, z: number) {
      const centers = [{ x, z, radius: fake.loadRadius }, ...fake.extraCenters];
      for (const c of centers) {
        const cx = Math.floor(c.x) >> 4;
        const cz = Math.floor(c.z) >> 4;
        const r = Math.min(2, c.radius);
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            if (w.chunkExists(cx + dx, cz + dz)) continue;
            const m = gen.finalizeChunk(cx + dx, cz + dz);
            const ch = new Chunk(w, m.cx, m.cz);
            for (const sct of m.sections) for (let i = 0; i < 4096; i++) if (sct.blocks[i]) ch.setBlockIDWithMetadata(i & 15, sct.y + (i >> 8), (i >> 4) & 15, sct.blocks[i], sct.meta[i]);
            w.addChunk(ch);
          }
        }
      }
    },
  };
  return fake as unknown as ChunkProviderClient;
}
