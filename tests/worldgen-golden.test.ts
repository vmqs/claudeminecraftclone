/**
 * World generation must stay byte-identical through performance work: the payloads the
 * world-generation worker sends (blocks, metadata, light, height map, biomes, ticks, tile
 * entities, entities) are hashed for fixed seeds and compared with hashes recorded before the
 * optimizations. Covers the spawn area in the original order, finalization, streaming away
 * from the spawn with eviction into the GenStore and back, and terrain made ahead by a separate
 * generator (what the terrain workers do).
 *
 *   node scripts/run-node-test.mjs tests/worldgen-golden.test.ts
 * Set GOLDEN_PRINT=1 to print the hashes instead of checking them.
 */
import '../src/block/Blocks';
import { GuiCreateWorld } from '../src/gui/GuiCreateWorld';
import { ChunkProviderGenerate } from '../src/world/gen/ChunkProviderGenerate';
import { toTerrainChunk } from '../src/world/gen/TerrainChunk';
import { WorldGenServer } from '../src/world/gen/WorldGenServer';
import type { ChunkPayload } from '../src/workers/worldgenProtocol';
import { check, report } from './harness';

class Hash {
  h1 = 0x811c9dc5;
  h2 = 0x01000193;
  bytes(a: Uint8Array | Int32Array): void {
    const u = a instanceof Uint8Array ? a : new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    let h1 = this.h1;
    let h2 = this.h2;
    for (let i = 0; i < u.length; i++) {
      h1 = Math.imul(h1 ^ u[i], 0x01000193);
      h2 = Math.imul(h2 ^ u[i], 0x5bd1e995) ^ (h2 >>> 13);
    }
    this.h1 = h1;
    this.h2 = h2;
  }
  text(s: string): void {
    this.bytes(new TextEncoder().encode(s));
  }
  hex(): string {
    return (this.h1 >>> 0).toString(16).padStart(8, '0') + (this.h2 >>> 0).toString(16).padStart(8, '0');
  }
}

const big = (_k: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);

function hashPayload(h: Hash, p: ChunkPayload): void {
  h.text(`${p.cx},${p.cz};`);
  for (const s of p.sections) {
    h.text(`s${s.y}`);
    h.bytes(s.blocks);
    h.bytes(s.meta);
    h.bytes(s.skyLight);
    h.bytes(s.blockLight);
  }
  h.bytes(p.heightMap);
  h.bytes(p.biomes);
  h.text(JSON.stringify(p.pendingTicks));
  h.text(JSON.stringify(p.tileEntities, big));
  h.text(JSON.stringify(p.entities, big));
}

interface Case {
  name: string;
  seed: string;
  type: string;
  initialRadius: number;
  generatorOptions?: string;
  /** Finalize radius around the spawn. */
  radius: number;
  /** Chunks to stream east of the spawn (radius 2 around a moving centre, with eviction). */
  stream: number;
  /** Make every terrain ahead with a second generator, as the terrain workers do. */
  prefetch?: boolean;
}

function run(c: Case): string {
  const seed = GuiCreateWorld.parseSeed(c.seed)!;
  const s = new WorldGenServer({ seed, worldType: c.type, mapFeatures: true, generatorOptions: c.generatorOptions ?? null, bonusChest: false, initialRadius: c.initialRadius });
  const ahead = c.prefetch && s.canPrefetchTerrain ? new ChunkProviderGenerate(seed, false, c.type) : null;
  const offer = (cx: number, cz: number) => {
    if (ahead && !s.hasTerrain(cx, cz)) s.offerTerrain(toTerrainChunk(cx, cz, ahead.provideTerrain(cx, cz)));
  };
  const spawn = s.findSpawnPoint();
  const order = s.spawnAreaOrder();
  for (let i = 0; i < order.length; i++) {
    // Terrain arrives ahead of need, a few chunks into the queue (any timing gives the same result).
    if (ahead) for (let j = i; j < Math.min(order.length, i + 5); j++) offer(order[j][0], order[j][1]);
    s.loadSpawnAreaChunk(order[i][0], order[i][1]);
  }
  s.finishSpawnArea();
  const h = new Hash();
  h.text(JSON.stringify(spawn));
  const scx = spawn[0] >> 4;
  const scz = spawn[2] >> 4;
  const want: [number, number, number][] = [];
  for (let dz = -c.radius; dz <= c.radius; dz++) for (let dx = -c.radius; dx <= c.radius; dx++) want.push([scx + dx, scz + dz, dx * dx + dz * dz]);
  want.sort((a, b) => a[2] - b[2] || a[0] - b[0] || a[1] - b[1]);
  for (const [cx, cz] of want) {
    if (ahead) for (const [x, z] of s.missingTerrainFor(cx, cz)) offer(x, z);
    hashPayload(h, s.finalizeChunk(cx, cz));
  }
  // Stream east and come back: evicted chunks are restored from the GenStore.
  const path: number[] = [];
  for (let i = 1; i <= c.stream; i++) path.push(i);
  for (let i = c.stream - 1; i >= 0; i--) path.push(i);
  for (const step of path) {
    const ccx = scx + c.radius + step;
    for (let dz = -2; dz <= 2; dz++) {
      if (ahead) for (const [x, z] of s.missingTerrainFor(ccx, scz + dz)) offer(x, z);
      hashPayload(h, s.finalizeChunk(ccx, scz + dz));
    }
    s.evict(ccx, scz, 5, () => false);
    s.dropPrefetched(ccx, scz, 7);
  }
  const st = s.stats();
  h.text(JSON.stringify(st));
  return h.hex();
}

const cases: Case[] = [
  { name: 'claude default r12', seed: 'claude', type: 'default', initialRadius: 12, radius: 3, stream: 14 },
  { name: 'claude default r12 prefetched', seed: 'claude', type: 'default', initialRadius: 12, radius: 3, stream: 14, prefetch: true },
  { name: '123456789 largeBiomes r6', seed: '123456789', type: 'largeBiomes', initialRadius: 6, radius: 2, stream: 8, prefetch: true },
  { name: 'flat village r4', seed: 'flat', type: 'flat', initialRadius: 4, generatorOptions: '2;7,2x3,2;1;village', radius: 2, stream: 6 },
];

/** Hashes recorded before the performance work (commit d0e00fc). */
const GOLDEN: Record<string, string> = {
  'claude default r12': '3c06f7c0f1cef4b1',
  'claude default r12 prefetched': '3c06f7c0f1cef4b1',
  '123456789 largeBiomes r6': '16413cfffcc9df9d',
  'flat village r4': '83406bf28012f510',
};

for (const c of cases) {
  const t0 = performance.now();
  const got = run(c);
  const ms = Math.round(performance.now() - t0);
  if (process.env.GOLDEN_PRINT) console.log(`  '${c.name}': '${got}', // ${ms} ms`);
  else check(`worldgen ${c.name}`, got === GOLDEN[c.name], `got ${got}, want ${GOLDEN[c.name]} (${ms} ms)`);
}
report();
