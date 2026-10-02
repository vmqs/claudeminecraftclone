/// <reference lib="webworker" />
import '../block/Blocks';
import { WorldGenServer } from '../world/gen/WorldGenServer';
import { GenWorld } from '../world/gen/GenWorld';
import type { WorldGenRequest, WorldGenResponse } from './worldgenProtocol';

declare const self: DedicatedWorkerGlobalScope;

/**
 * The world-generation worker (see ARCHITECTURE.md §5.2): answers chunk requests nearest to
 * the player first with finalized chunks, the spawn search and structure queries.
 */
let server: WorldGenServer | null = null;
const requested = new Map<number, [number, number]>();
let playerCX = 0;
let playerCZ = 0;
let keepRadius = 13;
let sinceEvict = 0;
let scheduled = false;

const key = GenWorld.key;

function post(m: WorldGenResponse, transfer: Transferable[] = []): void {
  self.postMessage(m, transfer);
}

function pump(): void {
  scheduled = false;
  if (!server || requested.size === 0) return;
  let best = -1;
  let bestD = Infinity;
  for (const [k, [cx, cz]] of requested) {
    const d = (cx - playerCX) ** 2 + (cz - playerCZ) ** 2;
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  const [cx, cz] = requested.get(best)!;
  requested.delete(best);
  let payload: ReturnType<WorldGenServer['finalizeChunk']>;
  try {
    payload = server.finalizeChunk(cx, cz);
  } catch (err) {
    // Report and keep serving the other chunks rather than stalling the queue.
    console.error(`[worldgen] chunk ${cx},${cz} failed`, err);
    schedule();
    return;
  }
  const transfer: Transferable[] = [payload.heightMap.buffer, payload.biomes.buffer];
  for (const s of payload.sections) transfer.push(s.blocks.buffer, s.meta.buffer, s.skyLight.buffer, s.blockLight.buffer);
  post(payload, transfer);
  if (++sinceEvict >= 32) {
    sinceEvict = 0;
    // Keep two rings beyond the loaded area: finalizing needs populated neighbours.
    server.evict(playerCX, playerCZ, keepRadius, (k) => requested.has(k));
  }
  schedule();
}

const channel = new MessageChannel();
channel.port1.onmessage = pump;

function schedule(): void {
  if (scheduled || requested.size === 0) return;
  scheduled = true;
  channel.port2.postMessage(0);
}

self.onmessage = (e: MessageEvent<WorldGenRequest>) => {
  const m = e.data;
  switch (m.type) {
    case 'init':
      server = new WorldGenServer({
        seed: BigInt(m.seed),
        worldType: m.worldType,
        mapFeatures: m.mapFeatures,
        generatorOptions: m.generatorOptions ?? null,
        bonusChest: m.bonusChest ?? false,
        initialRadius: m.initialRadius,
      });
      requested.clear();
      post({ type: 'ready' });
      break;
    case 'request':
      requested.set(key(m.cx, m.cz), [m.cx, m.cz]);
      schedule();
      break;
    case 'cancel':
      requested.delete(key(m.cx, m.cz));
      break;
    case 'findSpawn': {
      const [x, y, z] = server!.createSpawnPosition();
      post({ type: 'spawn', x, y, z });
      playerCX = x >> 4;
      playerCZ = z >> 4;
      break;
    }
    case 'findStructure': {
      const pos = server!.findClosestStructure(m.name, m.x, m.y, m.z);
      post({ type: 'structure', id: m.id, pos });
      break;
    }
    case 'player':
      playerCX = m.cx;
      playerCZ = m.cz;
      keepRadius = m.radius + 3;
      break;
  }
};
