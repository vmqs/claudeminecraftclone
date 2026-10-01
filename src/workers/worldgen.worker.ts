/// <reference lib="webworker" />
import '../block/Blocks';
import { Chunk } from '../world/Chunk';
import { ChunkSection } from '../world/ChunkSection';
import { ChunkProviderGenerate } from '../world/gen/ChunkProviderGenerate';
import { computeChunkLight } from '../world/gen/GenLighting';
import { GenWorld } from '../world/gen/GenWorld';
import type { ChunkPayload, SectionPayload, WorldGenRequest } from './worldgenProtocol';

declare const self: DedicatedWorkerGlobalScope;

let provider: ChunkProviderGenerate | null = null;
let world: GenWorld | null = null;
const populated = new Set<number>();
const requested = new Map<number, [number, number]>();
let playerCX = 0;
let playerCZ = 0;
let keepRadius = 13;
let sinceEvict = 0;
let scheduled = false;

const key = GenWorld.key;

function ensureTerrain(cx: number, cz: number): Chunk {
  const w = world!;
  const k = key(cx, cz);
  let c = w.chunks.get(k);
  if (c) return c;
  const gen = provider!.provideChunk(cx, cz);
  c = new Chunk(w, cx, cz);
  const src = gen.blocks;
  for (let sy = 0; sy < 8; sy++) {
    let s: ChunkSection | null = null;
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        const base = (x << 11) | (z << 7) | (sy << 4);
        for (let y = 0; y < 16; y++) {
          const id = src[base + y];
          if (id === 0) continue;
          if (!s) s = new ChunkSection(sy << 4);
          s.blocks[(y << 8) | (z << 4) | x] = id;
        }
      }
    }
    if (s) {
      s.recount();
      c.sections[sy] = s;
    }
  }
  c.biomes.set(gen.biomes);
  w.chunks.set(k, c);
  c.generateSkylightMap();
  // Replay population writes that neighbours already made into this chunk.
  const logs = w.foreignWrites.get(k);
  if (logs) {
    const ops: number[][] = [];
    for (const [srcKey, list] of logs) {
      if (!populated.has(srcKey)) continue;
      for (let i = 0; i < list.length; i += 6) ops.push(list.slice(i, i + 6));
    }
    ops.sort((a, b) => a[5] - b[5]);
    for (const [x, y, z, id, meta] of ops) c.setBlockIDWithMetadata(x & 15, y, z & 15, id, meta);
  }
  return c;
}

function ensurePopulated(cx: number, cz: number): void {
  const k = key(cx, cz);
  if (populated.has(k)) return;
  for (let dx = 0; dx <= 1; dx++) for (let dz = 0; dz <= 1; dz++) ensureTerrain(cx + dx, cz + dz);
  const w = world!;
  w.populatingKey = k;
  try {
    provider!.populate(w, cx, cz);
  } finally {
    w.populatingKey = null;
  }
  populated.add(k);
}

function finalizeChunk(cx: number, cz: number): ChunkPayload {
  for (let dx = -2; dx <= 1; dx++) for (let dz = -2; dz <= 1; dz++) ensurePopulated(cx + dx, cz + dz);
  const around: Chunk[] = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) around.push(ensureTerrain(cx + dx, cz + dz));
  const c = around[4];
  computeChunkLight(around, c);
  const sections: SectionPayload[] = [];
  for (const s of c.sections) {
    if (!s || s.isEmpty()) continue;
    sections.push({ y: s.yBase, blocks: s.blocks.slice(), meta: s.meta.slice(), skyLight: s.skyLight.slice(), blockLight: s.blockLight.slice() });
  }
  const ticks = c.pendingTicks.filter((t) => t[0] >> 4 === cx && t[2] >> 4 === cz);
  return { type: 'chunk', cx, cz, sections, heightMap: c.heightMap.slice(), biomes: c.biomes.slice(), pendingTicks: ticks, tileEntities: [] };
}

function evict(): void {
  const w = world!;
  const far = (k: number, c: Chunk) => Math.max(Math.abs(c.xPosition - playerCX), Math.abs(c.zPosition - playerCZ)) > keepRadius && !requested.has(k);
  const drop = new Set<number>();
  for (const [k, c] of w.chunks) if (far(k, c)) drop.add(k);
  // A populated chunk stays while a chunk its population wrote into is kept.
  let changed = true;
  while (changed) {
    changed = false;
    for (const k of drop) {
      if (!populated.has(k)) continue;
      const c = w.chunks.get(k)!;
      for (const [dx, dz] of [[1, 0], [0, 1], [1, 1]]) {
        const t = key(c.xPosition + dx, c.zPosition + dz);
        if (w.chunks.has(t) && !drop.has(t)) {
          drop.delete(k);
          changed = true;
          break;
        }
      }
    }
  }
  for (const k of drop) {
    w.chunks.delete(k);
    if (populated.delete(k)) for (const logs of w.foreignWrites.values()) logs.delete(k);
  }
  for (const [t, logs] of w.foreignWrites) if (logs.size === 0) w.foreignWrites.delete(t);
}

function pump(): void {
  scheduled = false;
  if (!provider || requested.size === 0) return;
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
  const payload = finalizeChunk(cx, cz);
  const transfer: Transferable[] = [payload.heightMap.buffer, payload.biomes.buffer];
  for (const s of payload.sections) transfer.push(s.blocks.buffer, s.meta.buffer, s.skyLight.buffer, s.blockLight.buffer);
  self.postMessage(payload, transfer);
  if (++sinceEvict >= 32) {
    sinceEvict = 0;
    evict();
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
    case 'init': {
      const seed = BigInt(m.seed);
      provider = new ChunkProviderGenerate(seed, m.mapFeatures);
      world = new GenWorld(provider.biomeSource);
      populated.clear();
      requested.clear();
      self.postMessage({ type: 'ready' });
      break;
    }
    case 'request':
      requested.set(key(m.cx, m.cz), [m.cx, m.cz]);
      schedule();
      break;
    case 'cancel':
      requested.delete(key(m.cx, m.cz));
      break;
    case 'player':
      playerCX = m.cx;
      playerCZ = m.cz;
      keepRadius = m.radius + 3;
      break;
  }
};
