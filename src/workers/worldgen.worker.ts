/// <reference lib="webworker" />
import '../block/Blocks';
import { WorldGenServer } from '../world/gen/WorldGenServer';
import { GenWorld } from '../world/gen/GenWorld';
import type { ChunkPayload, TerrainRequest, TerrainResponse, WorldGenRequest, WorldGenResponse } from './worldgenProtocol';

declare const self: DedicatedWorkerGlobalScope;

/**
 * The world-generation worker (see ARCHITECTURE.md §5.2): the spawn search and spawn area, then
 * finalized chunks nearest to the player first, and structure queries. Raw terrain is made ahead
 * by a pool of nested terrain workers (terrain.worker.ts) while this one populates and lights; it
 * falls back to making terrain itself when there is no terrain worker or they are behind. While
 * the spawn area loads, requested chunks it no longer changes are served already (serveEarly).
 */
let server: WorldGenServer | null = null;
const requested = new Map<number, [number, number]>();
let playerCX = 0;
let playerCZ = 0;
let keepRadius = 13;
/** More areas to keep and serve (a LAN host's guests): [cx, cz, radius]. */
let otherAreas: [number, number, number][] = [];

/** Squared chunk distance to the nearest area that wants chunks. */
function distanceSq(cx: number, cz: number): number {
  let d = (cx - playerCX) ** 2 + (cz - playerCZ) ** 2;
  for (const [ox, oz] of otherAreas) d = Math.min(d, (cx - ox) ** 2 + (cz - oz) ** 2);
  return d;
}

/** Whether a chunk lies within `extra` chunks beyond one of the other areas. */
function nearOtherArea(cx: number, cz: number, extra: number): boolean {
  for (const [ox, oz, r] of otherAreas) if (Math.max(Math.abs(cx - ox), Math.abs(cz - oz)) <= r + extra) return true;
  return false;
}
let sinceEvict = 0;
let scheduled = false;
/** The spawn area still to load (MinecraftServer.initialWorldChunkLoad), in order. */
let spawnQueue: [number, number][] | null = null;
let spawnIndex = 0;

/** A terrain worker and the chunks asked of it that are not back yet. */
interface TerrainWorker {
  worker: Worker;
  pending: number;
}

/**
 * The terrain workers. Terrain is a pure function of seed and position, so several make it in
 * parallel; they are started as soon as this worker loads (their modules load while the world
 * is being set up) and kept for the next world.
 */
const terrainPool: TerrainWorker[] = [];
/** Whether the terrain workers serve the current world (not for Superflat). */
let terrainActive = false;
/** Terrain chunks asked of a terrain worker and not back yet. */
const inFlight = new Set<number>();
/** Chunks a terrain worker failed on; made here instead. */
const localOnly = new Set<number>();
/** Terrain requests kept in flight per terrain worker. */
const PER_WORKER = 3;
/** Generation round: answers from terrain workers for an earlier world are ignored. */
let round = 0;

const key = GenWorld.key;

function post(m: WorldGenResponse, transfer: Transferable[] = []): void {
  self.postMessage(m, transfer);
}

/** One terrain worker per two spare cores, between 1 and 3. */
function terrainWorkerCount(): number {
  const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
  return Math.max(1, Math.min(3, cores - 2));
}

function spawnTerrainWorkers(): void {
  if (typeof Worker === 'undefined') return;
  const n = terrainWorkerCount();
  while (terrainPool.length < n) {
    let w: Worker;
    try {
      w = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      return;
    }
    const tw: TerrainWorker = { worker: w, pending: 0 };
    w.onmessage = (e: MessageEvent<TerrainResponse & { round?: number }>) => {
      tw.pending = Math.max(0, tw.pending - 1);
      const m = e.data;
      if (m.round !== round || !server || !terrainActive) return;
      if (m.type === 'terrain') {
        inFlight.delete(key(m.chunk.cx, m.chunk.cz));
        server.offerTerrain(m.chunk);
      } else {
        inFlight.delete(key(m.cx, m.cz));
        localOnly.add(key(m.cx, m.cz));
      }
      schedule();
    };
    w.onerror = (e) => {
      // Without terrain workers everything is made here.
      console.error('[terrain]', e.message);
      const i = terrainPool.indexOf(tw);
      if (i >= 0) terrainPool.splice(i, 1);
      inFlight.clear();
      schedule();
    };
    terrainPool.push(tw);
  }
}

function startTerrainWorkers(seed: string, worldType: string, dimension: number, mapFeatures: boolean, generatorOptions: string | null): void {
  round++;
  inFlight.clear();
  localOnly.clear();
  for (const tw of terrainPool) tw.pending = 0;
  terrainActive = !!server?.canPrefetchTerrain && terrainPool.length > 0;
  if (!terrainActive) return;
  for (const tw of terrainPool) tw.worker.postMessage({ type: 'init', seed, worldType, round, dimension, mapFeatures, generatorOptions } satisfies TerrainRequest);
}

/** Whether a terrain worker can take another chunk. */
function terrainSlotFree(): boolean {
  if (!terrainActive) return false;
  for (const tw of terrainPool) if (tw.pending < PER_WORKER) return true;
  return false;
}

function sendTerrain(cx: number, cz: number): void {
  let best = terrainPool[0];
  for (const tw of terrainPool) if (tw.pending < best.pending) best = tw;
  best.pending++;
  inFlight.add(key(cx, cz));
  best.worker.postMessage({ type: 'terrain', cx, cz, round } satisfies TerrainRequest);
}

/**
 * Gets the terrain of `need` (the next job) and `ahead` (the jobs after it) under way: asks the
 * terrain worker for what is missing, and makes one chunk here when the worker is busy.
 * 'ready': the job can run now; 'busy': a chunk was made here; 'wait': waiting for the worker.
 */
function arrangeTerrain(need: [number, number][], ahead: [number, number][]): 'ready' | 'busy' | 'wait' {
  // Without terrain workers the job makes its terrain itself, as it goes.
  if (!terrainActive) return 'ready';
  const s = server!;
  let waiting = false;
  let local: [number, number] | null = null;
  for (const [cx, cz] of need) {
    if (s.hasTerrain(cx, cz)) continue;
    const k = key(cx, cz);
    if (inFlight.has(k)) waiting = true;
    else if (terrainSlotFree() && !localOnly.has(k)) {
      sendTerrain(cx, cz);
      waiting = true;
    } else local ??= [cx, cz];
  }
  if (local) {
    s.prefetchTerrain(local[0], local[1]);
    return 'busy';
  }
  // Keep the terrain workers fed with what comes next.
  let spare: [number, number] | null = null;
  for (const [cx, cz] of ahead) {
    const k = key(cx, cz);
    if (s.hasTerrain(cx, cz) || inFlight.has(k)) continue;
    if (terrainSlotFree() && !localOnly.has(k)) sendTerrain(cx, cz);
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
    const d = distanceSq(cx, cz);
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
  const lookahead = 4 + PER_WORKER * terrainPool.length * 2;
  const state = arrangeTerrain([[cx, cz]], q.slice(spawnIndex + 1, spawnIndex + 1 + lookahead));
  if (state === 'ready') {
    s.loadSpawnAreaChunk(cx, cz);
    if (++spawnIndex >= q.length) finishSpawn();
  }
  if (state !== 'wait') schedule();
}

// ---------------------------------------------------------------- chunks served while the spawn area loads
//
// The spawn area is loaded in the original order, but the player does not wait for all of it:
// a requested chunk is finalized as soon as every population that writes into it or its
// neighbours has run (WorldGenServer.canFinalizeEarly), with its light computed into the payload
// only, so the rest of the spawn area generates exactly as it would have. Should a later
// population still change one of its neighbours, the chunk is sent again when the area is done.

/** Position of each chunk in the spawn queue. */
let spawnIndexOf: Map<number, number> | null = null;
/** Spawn-queue step after which a requested chunk may be ready (Infinity: after the area). */
const readyAt = new Map<number, number>();
/** The lowest readyAt among requested chunks not yet found ready. */
let nextReadyAt = Infinity;
/** Requested chunks whose populations are done, waiting to be finalized. */
const readyEarly = new Set<number>();
/** Chunks sent early, with the block writes of their neighbourhood when they were sent. */
const sentEarly = new Map<number, number>();

/** The step whose load completes the last population chunk (cx, cz) depends on. */
function earliestStep(cx: number, cz: number): number {
  const lo = spawnIndexOf!.get(key(cx - 3, cz - 3));
  const hi = spawnIndexOf!.get(key(cx + 3, cz + 3));
  return lo === undefined || hi === undefined ? Infinity : hi;
}

function noteRequestDuringSpawn(cx: number, cz: number): void {
  const at = earliestStep(cx, cz);
  const k = key(cx, cz);
  readyAt.set(k, at);
  if (at < spawnIndex) readyEarly.add(k);
  else if (at < nextReadyAt) nextReadyAt = at;
}

/** Moves requested chunks whose step has passed into readyEarly. */
function collectReady(): void {
  if (spawnIndex <= nextReadyAt) return;
  nextReadyAt = Infinity;
  for (const k of requested.keys()) {
    const at = readyAt.get(k);
    if (at === undefined || at === Infinity) continue;
    if (at < spawnIndex) {
      readyEarly.add(k);
      readyAt.delete(k);
    } else if (at < nextReadyAt) nextReadyAt = at;
  }
}

/** Finalizes the nearest early-ready chunk; false when there is none. */
function serveEarly(): boolean {
  collectReady();
  let best = -1;
  let bestD = Infinity;
  for (const k of readyEarly) {
    const c = requested.get(k);
    if (!c) {
      readyEarly.delete(k);
      continue;
    }
    const d = distanceSq(c[0], c[1]);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  if (best < 0) return false;
  readyEarly.delete(best);
  const [cx, cz] = requested.get(best)!;
  if (!server!.canFinalizeEarly(cx, cz)) {
    // Not yet after all (it waits for the end of the spawn area).
    return true;
  }
  requested.delete(best);
  sentEarly.set(best, server!.neighbourhoodWrites(cx, cz));
  sendChunk(server!.finalizeChunk(cx, cz, true));
  return true;
}

function finishSpawn(): void {
  const s = server!;
  s.finishSpawnArea();
  spawnQueue = null;
  spawnIndexOf = null;
  readyAt.clear();
  readyEarly.clear();
  nextReadyAt = Infinity;
  // A chunk whose neighbourhood changed after it was sent early goes out again.
  for (const [k, writes] of sentEarly) {
    const [cx, cz] = GenWorld.unkey(k);
    if (s.neighbourhoodWrites(cx, cz) === writes) continue;
    console.warn(`[worldgen] chunk ${cx},${cz} changed after it was sent; sending it again`);
    sendChunk({ ...s.finalizeChunk(cx, cz), replace: true });
  }
  sentEarly.clear();
}

function sendChunk(payload: ChunkPayload): void {
  const transfer: Transferable[] = [payload.heightMap.buffer, payload.biomes.buffer];
  for (const s of payload.sections) transfer.push(s.blocks.buffer, s.meta.buffer, s.skyLight.buffer, s.blockLight.buffer);
  post(payload, transfer);
}

function pump(): void {
  scheduled = false;
  if (!server) return;
  if (spawnQueue) {
    if (serveEarly()) schedule();
    else pumpSpawnArea();
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
  let payload: ChunkPayload;
  try {
    payload = server.finalizeChunk(cx, cz);
  } catch (err) {
    // Report and keep serving the other chunks rather than stalling the queue.
    console.error(`[worldgen] chunk ${cx},${cz} failed`, err);
    schedule();
    return;
  }
  sendChunk(payload);
  if (++sinceEvict >= 32) {
    sinceEvict = 0;
    // Keep two rings beyond the loaded area: finalizing needs populated neighbours.
    server.evict(playerCX, playerCZ, keepRadius, (k) => requested.has(k) || (otherAreas.length > 0 && nearOtherArea(...GenWorld.unkey(k), 3)));
    server.dropPrefetched(playerCX, playerCZ, keepRadius + 2, (cx, cz) => nearOtherArea(cx, cz, 5));
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

spawnTerrainWorkers();

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
        dimension: m.dimension ?? 0,
      });
      requested.clear();
      spawnQueue = null;
      spawnIndexOf = null;
      readyAt.clear();
      readyEarly.clear();
      sentEarly.clear();
      nextReadyAt = Infinity;
      startTerrainWorkers(m.seed, m.worldType, m.dimension ?? 0, m.mapFeatures, m.generatorOptions ?? null);
      post({ type: 'ready' });
      break;
    case 'request':
      requested.set(key(m.cx, m.cz), [m.cx, m.cz]);
      if (spawnQueue) noteRequestDuringSpawn(m.cx, m.cz);
      schedule();
      break;
    case 'cancel':
      requested.delete(key(m.cx, m.cz));
      break;
    case 'findSpawn': {
      // The spawn search runs at once and is answered; the spawn area then loads step by step
      // in the original order (pump), and requested chunks are served as soon as the part of
      // the area they depend on is done (serveEarly).
      const [x, y, z] = server!.findSpawnPoint();
      playerCX = x >> 4;
      playerCZ = z >> 4;
      spawnQueue = server!.spawnAreaOrder();
      spawnIndex = 0;
      spawnIndexOf = new Map(spawnQueue.map(([cx, cz], i) => [key(cx, cz), i]));
      nextReadyAt = Infinity;
      for (const [cx, cz] of requested.values()) noteRequestDuringSpawn(cx, cz);
      post({ type: 'spawn', x, y, z });
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
      otherAreas = m.others ?? [];
      break;
  }
};
