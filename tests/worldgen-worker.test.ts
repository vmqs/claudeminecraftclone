/**
 * The world-generation worker's scheduling under Node (fake worker globals): terrain from a
 * pool of nested terrain workers with random delays, the spawn area in the original order, and
 * chunks served while the spawn area still loads. Every chunk the worker sends must equal the
 * chunk a plain WorldGenServer finalizes after the whole spawn area (byte for byte), whatever
 * the timing, and none may need sending again.
 *
 *   node scripts/run-node-test.mjs tests/worldgen-worker.test.ts
 */
import { FakeWorker, listeners, nested, send } from './fakeWorkerEnv';
import '../src/block/Blocks';
import '../src/workers/worldgen.worker';
import { GuiCreateWorld } from '../src/gui/GuiCreateWorld';
import { ChunkProviderGenerate } from '../src/world/gen/ChunkProviderGenerate';
import { toTerrainChunk } from '../src/world/gen/TerrainChunk';
import { WorldGenServer } from '../src/world/gen/WorldGenServer';
import type { ChunkPayload, TerrainRequest, WorldGenResponse } from '../src/workers/worldgenProtocol';
import { check, report } from './harness';

// Nested terrain workers: a generator per fake worker, as terrain.worker.ts does.
nested.handler = (raw, w: FakeWorker) => {
  const m = raw as TerrainRequest;
  if (m.type === 'init') {
    w.state.gen = new ChunkProviderGenerate(BigInt(m.seed), false, m.worldType);
    w.state.round = m.round;
    return null;
  }
  const gen = w.state.gen as ChunkProviderGenerate | undefined;
  if (!gen || m.round !== w.state.round) return { type: 'failed', cx: m.cx, cz: m.cz, round: m.round };
  return { type: 'terrain', chunk: toTerrainChunk(m.cx, m.cz, gen.provideTerrain(m.cx, m.cz)), round: m.round };
};

function digest(p: ChunkPayload): string {
  let h = 0x811c9dc5;
  const mix = (u: Uint8Array) => {
    for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 0x01000193);
  };
  for (const s of p.sections) {
    mix(new Uint8Array([s.y]));
    mix(s.blocks);
    mix(s.meta);
    mix(s.skyLight);
    mix(s.blockLight);
  }
  mix(new Uint8Array(p.heightMap.buffer, p.heightMap.byteOffset, p.heightMap.byteLength));
  mix(p.biomes);
  const big = (_k: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);
  mix(new TextEncoder().encode(JSON.stringify([p.pendingTicks, p.tileEntities, p.entities], big)));
  return (h >>> 0).toString(16);
}

interface Run {
  spawn: [number, number, number];
  chunks: Map<string, string>;
  order: string[];
  replaced: number;
  spawnAt: number;
  firstNearAt: number;
  doneAt: number;
}

/** Drives the worker like ChunkProviderClient: init, findSpawn, then the area around the spawn. */
function drive(seed: string, type: string, radius: number, maxDelay: number): Promise<Run> {
  nested.maxDelay = maxDelay;
  return new Promise((resolve) => {
    const t0 = performance.now();
    const run: Run = { spawn: [0, 0, 0], chunks: new Map(), order: [], replaced: 0, spawnAt: 0, firstNearAt: 0, doneAt: 0 };
    let want = 0;
    let near = 0;
    const l = (raw: unknown) => {
      const m = raw as WorldGenResponse;
      if (m.type === 'spawn') {
        run.spawnAt = performance.now() - t0;
        run.spawn = [m.x, m.y, m.z];
        const cx = m.x >> 4;
        const cz = m.z >> 4;
        send({ type: 'player', cx, cz, radius });
        for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) send({ type: 'request', cx: cx + dx, cz: cz + dz });
        want = (2 * radius + 1) ** 2;
      } else if (m.type === 'chunk') {
        const k = `${m.cx},${m.cz}`;
        if (m.replace) run.replaced++;
        run.chunks.set(k, digest(m));
        run.order.push(k);
        const [sx, , sz] = run.spawn;
        if (Math.abs(m.cx - (sx >> 4)) <= 2 && Math.abs(m.cz - (sz >> 4)) <= 2 && ++near === 25) run.firstNearAt = performance.now() - t0;
        if (run.chunks.size === want) {
          run.doneAt = performance.now() - t0;
          listeners.splice(listeners.indexOf(l), 1);
          // Let the spawn area finish (and any resend) before resolving.
          setTimeout(() => resolve(run), 50);
        }
      }
    };
    listeners.push(l);
    send({ type: 'init', seed: String(GuiCreateWorld.parseSeed(seed)), worldType: type, mapFeatures: true, generatorOptions: null, bonusChest: false });
    send({ type: 'findSpawn' });
  });
}

/** The reference: the whole spawn area first, then every chunk finalized. */
function reference(seed: string, type: string, radius: number, spawn: [number, number, number]): Map<string, string> {
  const s = new WorldGenServer({ seed: GuiCreateWorld.parseSeed(seed)!, worldType: type, mapFeatures: true });
  const sp = s.createSpawnPosition();
  check(`${seed} spawn point`, sp.join() === spawn.join(), `${sp} vs ${spawn}`);
  const out = new Map<string, string>();
  const cx = sp[0] >> 4;
  const cz = sp[2] >> 4;
  for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) out.set(`${cx + dx},${cz + dz}`, digest(s.finalizeChunk(cx + dx, cz + dz)));
  return out;
}

for (const [seed, type, radius, delay] of [
  ['claude', 'default', 9, 3],
  ['123456789', 'default', 6, 0],
] as [string, string, number, number][]) {
  const run = await drive(seed, type, radius, delay);
  const ref = reference(seed, type, radius, run.spawn);
  let same = 0;
  const diff: string[] = [];
  for (const [k, v] of ref) {
    if (run.chunks.get(k) === v) same++;
    else diff.push(k);
  }
  check(`${seed} every chunk equals the reference`, diff.length === 0, `${diff.length} differ: ${diff.slice(0, 8).join(' ')}`);
  check(`${seed} no chunk sent again`, run.replaced === 0, `${run.replaced}`);
  check(`${seed} the spawn's 5x5 arrive before the whole area`, run.firstNearAt > 0 && run.firstNearAt < run.doneAt, `${run.firstNearAt} / ${run.doneAt}`);
  console.log(`  ${seed}: ${same}/${ref.size} equal; spawn answered at ${Math.round(run.spawnAt)} ms, 5x5 at ${Math.round(run.firstNearAt)} ms, all at ${Math.round(run.doneAt)} ms`);
}
report();
process.exit(process.exitCode ?? 0);
