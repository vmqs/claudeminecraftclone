/// <reference lib="webworker" />
import '../block/Blocks';
import { type ChunkGenerator, ChunkProviderGenerate } from '../world/gen/ChunkProviderGenerate';
import { DimensionGenerators } from '../world/gen/DimensionGenerators';
import '../world/gen/nether/NetherRegistration';
import { terrainTransferables, toTerrainChunk } from '../world/gen/TerrainChunk';
import type { TerrainRequest, TerrainResponse } from './worldgenProtocol';

declare const self: DedicatedWorkerGlobalScope;

/**
 * The terrain worker, started by the world-generation worker: it makes raw chunk terrain
 * (density noise, surface, caves, ravines; ChunkProviderGenerate.provideTerrain) ahead of
 * population, in parallel with it. Terrain is a pure function of seed and position, so the
 * result is the same as making it in the world-generation worker.
 */
let gen: ChunkGenerator | null = null;
let round: number | undefined;

self.onmessage = (e: MessageEvent<TerrainRequest>) => {
  const m = e.data;
  if (m.type === 'init') {
    const dimension = m.dimension ?? 0;
    gen =
      dimension === 0
        ? new ChunkProviderGenerate(BigInt(m.seed), false, m.worldType)
        : DimensionGenerators.create(dimension, { seed: BigInt(m.seed), worldType: m.worldType, mapFeatures: m.mapFeatures ?? true, generatorOptions: m.generatorOptions ?? null });
    round = m.round;
    return;
  }
  let reply: TerrainResponse;
  if (!gen || m.round !== round) {
    // A request of another world: answered so the sender's count of pending requests stays right.
    reply = { type: 'failed', cx: m.cx, cz: m.cz, round: m.round };
  } else {
    try {
      if (!gen.provideTerrain) throw new Error('this generator makes no separate terrain');
      reply = { type: 'terrain', chunk: toTerrainChunk(m.cx, m.cz, gen.provideTerrain(m.cx, m.cz)), round };
    } catch (err) {
      console.error(`[terrain] chunk ${m.cx},${m.cz} failed`, err);
      reply = { type: 'failed', cx: m.cx, cz: m.cz, round };
    }
  }
  self.postMessage(reply, reply.type === 'terrain' ? terrainTransferables(reply.chunk) : []);
};
