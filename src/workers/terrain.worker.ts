/// <reference lib="webworker" />
import '../block/Blocks';
import { ChunkProviderGenerate } from '../world/gen/ChunkProviderGenerate';
import { terrainTransferables, toTerrainChunk } from '../world/gen/TerrainChunk';
import type { TerrainRequest, TerrainResponse } from './worldgenProtocol';

declare const self: DedicatedWorkerGlobalScope;

/**
 * The terrain worker, started by the world-generation worker: it makes raw chunk terrain
 * (density noise, surface, caves, ravines; ChunkProviderGenerate.provideTerrain) ahead of
 * population, in parallel with it. Terrain is a pure function of seed and position, so the
 * result is the same as making it in the world-generation worker.
 */
let gen: ChunkProviderGenerate | null = null;
let round: number | undefined;

self.onmessage = (e: MessageEvent<TerrainRequest>) => {
  const m = e.data;
  if (m.type === 'init') {
    gen = new ChunkProviderGenerate(BigInt(m.seed), false, m.worldType);
    round = m.round;
    return;
  }
  let reply: TerrainResponse;
  if (!gen || m.round !== round) {
    // A request of another world: answered so the sender's count of pending requests stays right.
    reply = { type: 'failed', cx: m.cx, cz: m.cz, round: m.round };
  } else {
    try {
      reply = { type: 'terrain', chunk: toTerrainChunk(m.cx, m.cz, gen.provideTerrain(m.cx, m.cz)), round };
    } catch (err) {
      console.error(`[terrain] chunk ${m.cx},${m.cz} failed`, err);
      reply = { type: 'failed', cx: m.cx, cz: m.cz, round };
    }
  }
  self.postMessage(reply, reply.type === 'terrain' ? terrainTransferables(reply.chunk) : []);
};
