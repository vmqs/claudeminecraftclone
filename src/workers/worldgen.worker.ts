/// <reference lib="webworker" />
import '../block/Blocks';
import { WorldGenServer } from '../world/gen/WorldGenServer';
import { GenWorld } from '../world/gen/GenWorld';
import type { TerrainRequest, TerrainResponse, WorldGenRequest, WorldGenResponse } from './worldgenProtocol';

declare const self: DedicatedWorkerGlobalScope;

/**
 * The world-generation worker (see ARCHITECTURE.md §5.2): the spawn search and spawn area, then
 * finalized chunks nearest to the player first, and structure queries. Raw terrain is made ahead
 * by a nested terrain worker (terrain.worker.ts) while this one populates and lights; it falls
 * back to making terrain itself when there is no terrain worker or it is behind.
 */
let server: WorldGenServer | null = null;
const requested = new Map<number, [number, number]>();
let playerCX = 0;
let playerCZ = 0;
let keepRadius = 13;
let sinceEvict = 0;
let scheduled = false;
/** The spawn area still to load (MinecraftServer.initialWorldChunkLoad), in order. */
let spawnQueue: [number, number][] | null = null;
let spawnIndex = 0;

let terrainWorker: Worker | null = null;
/** Terrain chunks asked of the terrain worker and not back yet. */
const inFlight = new Set<number>();
/** Chunks the terrain worker failed on; made here instead. */
const localOnly = new Set<number>();
const MAX_IN_FLIGHT = 4;
const SPAWN_LOOKAHEAD = 8;

const key = GenWorld.key;

function post(m: WorldGenResponse, transfer: Transferable[] = []): void {
  self.postMessage(m, transfer);
}

function startTerrainWorker(seed: string, worldType: string): void {
  terrainWorker?.terminate();
  terrainWorker = null;
  inFlight.clear();
  localOnly.clear();
  if (!server?.canPrefetchTerrain || typeof Worker === 'undefined') return;
  let w: Worker;
  try {
    w = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return;
  }
  const owner = server;
  w.onmessage = (e: MessageEvent<TerrainResponse>) => {
    if (server !== owner) return;
    const m = e.data;
    if (m.type === 'terrain') {
      inFlight.delete(key(m.chunk.cx, m.chunk.cz));
      owner.offerTerrain(m.chunk);
    } else {
      inFlight.delete(key(m.cx, m.cz));
      localOnly.add(key(m.cx, m.cz));
    }
    schedule();
  };
  w.onerror = (e) => {
    // Without a terrain worker everything is made here.
    console.error('[terrain]', e.message);
    if (terrainWorker === w) terrainWorker = null;
    inFlight.clear();
    schedule();
  };
  w.postMessage({ type: 'init', seed, worldType } satisfies TerrainRequest);
  terrainWorker = w;
}

function sendTerrain(cx: number, cz: number): void {
  inFlight.add(key(cx, cz));
  terrainWorker!.postMessage({ type: 'terrain', cx, cz } satisfies TerrainRequest);
}

/**
 * Gets the terrain of `need` (the next job) and `ahead` (the jobs after it) under way: asks the
 * terrain worker for what is missing, and makes one chunk here when the worker is busy.
 * 'ready': the job can run now; 'busy': a chunk was made here; 'wait': waiting for the worker.
 */
function arrangeTerrain(need: [number, number][], ahead: [number, number][]): 'ready' | 'busy' | 'wait' {
  // Without a terrain worker the job makes its terrain itself, as it goes.
  if (!terrainWorker) return 'ready';
  const s = server!;
  let waiting = false;
  let local: [number, number] | null = null;
  for (const [cx, cz] of need) {
    if (s.hasTerrain(cx, cz)) continue;
    const k = key(cx, cz);
    if (inFlight.has(k)) waiting = true;
    else if (terrainWorker && inFlight.size < MAX_IN_FLIGHT && !localOnly.has(k)) {
      sendTerrain(cx, cz);
      waiting = true;
    } else local ??= [cx, cz];
  }
  if (local) {
    s.prefetchTerrain(local[0], local[1]);
    return 'busy';
  }
  // Keep the terrain worker fed with what comes next.
  let spare: [number, number] | null = null;
  for (const [cx, cz] of ahead) {
    const k = key(cx, cz);
    if (s.hasTerrain(cx, cz) || inFlight.has(k)) continue;
    if (terrainWorker && inFlight.size < MAX_IN_FLIGHT && !localOnly.has(k)) sendTerrain(cx, cz);
    else spare ??= [cx, cz];
  }
  if (!waiting) return 'ready';
  // Waiting for the worker: make a later chunk's terrain here meanwhile.
  if (spare) {
    s.prefetchTerrain(spare[0], spare[1]);
    return 'busy';
  }
  return 'wait';
}

/** The `n` requested chunks nearest to the player, nearest first. */
function nearestRequested(n: number): [number, number][] {
  const best: [number, number, number][] = [];
  for (const [cx, cz] of requested.values()) {
    const d = (cx - playerCX) ** 2 + (cz - playerCZ) ** 2;
    if (best.length === n && d >= best[n - 1][2]) continue;
    let i = best.length < n ? best.length : n - 1;
    best[i] = [cx, cz, d];
    while (i > 0 && best[i - 1][2] > d) {
      const t = best[i - 1];
      best[i - 1] = best[i];
      best[i] = t;
      i--;
    }
  }
  return best.map(([cx, cz]) => [cx, cz]);
}

function pumpSpawnArea(): void {
  const s = server!;
  const q = spawnQueue!;
  const [cx, cz] = q[spawnIndex];
  const state = arrangeTerrain([[cx, cz]], q.slice(spawnIndex + 1, spawnIndex + 1 + SPAWN_LOOKAHEAD));
  if (state === 'ready') {
    s.loadSpawnAreaChunk(cx, cz);
    if (++spawnIndex >= q.length) finishSpawn();
  }
  if (state !== 'wait') schedule();
}

function finishSpawn(): void {
  const s = server!;
  s.finishSpawnArea();
  spawnQueue = null;
  const [x, y, z] = s.spawn!;
  post({ type: 'spawn', x, y, z });
}

function pump(): void {
  scheduled = false;
  if (!server) return;
  if (spawnQueue) {
    pumpSpawnArea();
    return;
  }
  if (requested.size === 0) return;
  const next = nearestRequested(3);
  const [cx, cz] = next[0];
  const ahead: [number, number][] = [];
  for (let i = 1; i < next.length; i++) server.missingTerrainFor(next[i][0], next[i][1], ahead);
  const state = arrangeTerrain(server.missingTerrainFor(cx, cz), ahead);
  if (state !== 'ready') {
    if (state === 'busy') schedule();
    return;
  }
  requested.delete(key(cx, cz));
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
    server.dropPrefetched(playerCX, playerCZ, keepRadius + 2);
  }
  schedule();
}

const channel = new MessageChannel();
channel.port1.onmessage = pump;

function schedule(): void {
  if (scheduled || (requested.size === 0 && !spawnQueue)) return;
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
      spawnQueue = null;
      startTerrainWorker(m.seed, m.worldType);
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
      // The spawn search runs at once; the spawn area then loads step by step (pump), and the
      // 'spawn' answer is sent when it is done, like the original's world creation.
      const [x, , z] = server!.findSpawnPoint();
      playerCX = x >> 4;
      playerCZ = z >> 4;
      spawnQueue = server!.spawnAreaOrder();
      spawnIndex = 0;
      if (spawnQueue.length === 0) finishSpawn();
      else schedule();
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
