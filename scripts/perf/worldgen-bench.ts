/**
 * World-generation benchmark (Node, no browser): the work the world-generation worker does
 * between "Create New World" and a playable spawn, split into phases.
 *
 *   node scripts/perf/bench.mjs worldgen [seed] [type] [radius]
 *
 * Phases: the spawn search, the 25x25 spawn area in MinecraftServer.initialWorldChunkLoad
 * order (terrain, structure records, population), then finalization (population of the ring
 * around, light) of the chunks the client asks for: the 5x5 "Building terrain" area, then the
 * rest of the loaded area (radius = render radius + 1, 9 for Normal) nearest first.
 * Prints JSON with milliseconds per phase and per chunk.
 */
import '../../src/block/Blocks';
import { GuiCreateWorld } from '../../src/gui/GuiCreateWorld';
import { WorldGenServer } from '../../src/world/gen/WorldGenServer';
import * as GenLighting from '../../src/world/gen/GenLighting';

const args = process.argv.slice(2);
const seedText = args[0] ?? 'claude';
const type = args[1] ?? 'default';
const radius = Number(args[2] ?? 9);
const seed = GuiCreateWorld.parseSeed(seedText) ?? 1n;

const timers: Record<string, { ms: number; n: number }> = {};
function wrap<T extends object>(obj: T, name: keyof T & string, label: string): void {
  const orig = (obj as Record<string, unknown>)[name] as (...a: unknown[]) => unknown;
  if (typeof orig !== 'function') return;
  const t = (timers[label] ??= { ms: 0, n: 0 });
  let depth = 0;
  (obj as Record<string, unknown>)[name] = function (this: unknown, ...a: unknown[]) {
    if (depth > 0) return orig.apply(this, a);
    depth++;
    const t0 = performance.now();
    try {
      return orig.apply(this, a);
    } finally {
      t.ms += performance.now() - t0;
      t.n++;
      depth--;
    }
  };
}

const tInit = performance.now();
const server = new WorldGenServer({ seed, worldType: type, mapFeatures: true, generatorOptions: null, bonusChest: false });
const initMs = performance.now() - tInit;
const p = server.provider as unknown as Record<string, unknown>;
wrap(p as object, 'provideTerrain' as never, 'terrain');
wrap(p as object, 'recordStructures' as never, 'structures');
wrap(p as object, 'populate' as never, 'populate');
// computeChunkLight is imported by WorldGenServer through the module namespace; time it via finalize - populate.

const t0 = performance.now();
const spawn = server.findSpawnPoint();
const tSearch = performance.now();
const order = server.spawnAreaOrder();
for (const [cx, cz] of order) server.loadSpawnAreaChunk(cx, cz);
server.finishSpawnArea();
const tSpawnArea = performance.now();
const spawnPhase = JSON.parse(JSON.stringify(timers));
for (const k in timers) timers[k] = { ms: 0, n: 0 };

const scx = spawn[0] >> 4;
const scz = spawn[2] >> 4;
const want: [number, number, number][] = [];
for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) want.push([scx + dx, scz + dz, dx * dx + dz * dz]);
want.sort((a, b) => a[2] - b[2]);
let finalizeMs = 0;
let firstAreaMs = 0;
let bytes = 0;
const first = new Set<string>();
for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) first.add(`${scx + dx},${scz + dz}`);
let firstLeft = first.size;
for (const [cx, cz] of want) {
  const a = performance.now();
  const payload = server.finalizeChunk(cx, cz);
  finalizeMs += performance.now() - a;
  for (const s of payload.sections) bytes += 4 * 4096;
  if (first.has(`${cx},${cz}`) && --firstLeft === 0) firstAreaMs = finalizeMs;
}
const tEnd = performance.now();
void GenLighting;

const round = (v: number) => Math.round(v * 10) / 10;
const phase = (t: Record<string, { ms: number; n: number }>) =>
  Object.fromEntries(Object.entries(t).map(([k, v]) => [k, { ms: round(v.ms), n: v.n, perChunk: v.n ? round(v.ms / v.n) : 0 }]));
console.log(
  JSON.stringify(
    {
      seed: seedText,
      type,
      spawn,
      initMs: round(initMs),
      spawnSearchMs: round(tSearch - t0),
      spawnAreaMs: round(tSpawnArea - tSearch),
      spawnAreaChunks: order.length,
      spawnPhase: phase(spawnPhase),
      finalize: {
        chunks: want.length,
        totalMs: round(finalizeMs),
        perChunkMs: round(finalizeMs / want.length),
        first5x5Ms: round(firstAreaMs),
        lightAndCopyMs: round(finalizeMs - (timers.populate?.ms ?? 0) - (timers.terrain?.ms ?? 0) - (timers.structures?.ms ?? 0)),
        phases: phase(timers),
        payloadMB: round(bytes / 1048576),
      },
      totalMs: round(tEnd - t0),
      stats: server.stats(),
    },
    null,
    1,
  ),
);
