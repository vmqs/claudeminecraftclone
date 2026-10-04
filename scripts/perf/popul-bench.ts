/**
 * The world-generation worker's critical path at world creation, without terrain: terrain for
 * the whole spawn area is made first (as the terrain workers would), then the spawn area is
 * loaded in MinecraftServer.initialWorldChunkLoad order (structure records, population, light
 * kept up to date) and the 7x7 chunks around the spawn are finalized.
 *
 *   node scripts/perf/bench.mjs popul [seed] [type]
 */
import '../../src/block/Blocks';
import { GuiCreateWorld } from '../../src/gui/GuiCreateWorld';
import { ChunkProviderGenerate } from '../../src/world/gen/ChunkProviderGenerate';
import { toTerrainChunk } from '../../src/world/gen/TerrainChunk';
import { WorldGenServer } from '../../src/world/gen/WorldGenServer';

const seedText = process.argv[2] ?? 'claude';
const type = process.argv[3] ?? 'default';
const seed = GuiCreateWorld.parseSeed(seedText)!;
const s = new WorldGenServer({ seed, worldType: type, mapFeatures: true });
const gen = new ChunkProviderGenerate(seed, false, type);
const t0 = performance.now();
const spawn = s.findSpawnPoint();
const t1 = performance.now();
const order = s.spawnAreaOrder();
for (const [cx, cz] of order) if (!s.hasTerrain(cx, cz)) s.offerTerrain(toTerrainChunk(cx, cz, gen.provideTerrain(cx, cz)));
for (let dx = -13; dx <= 13; dx++) for (let dz = -13; dz <= 13; dz++) {
  const cx = (spawn[0] >> 4) + dx, cz = (spawn[2] >> 4) + dz;
  if (!s.hasTerrain(cx, cz)) s.offerTerrain(toTerrainChunk(cx, cz, gen.provideTerrain(cx, cz)));
}
const t2 = performance.now();
for (const [cx, cz] of order) s.loadSpawnAreaChunk(cx, cz);
s.finishSpawnArea();
const t3 = performance.now();
for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) s.finalizeChunk((spawn[0] >> 4) + dx, (spawn[2] >> 4) + dz);
const t4 = performance.now();
console.log(JSON.stringify({ seed: seedText, type, spawnSearchMs: Math.round(t1 - t0), terrainAheadMs: Math.round(t2 - t1), spawnAreaPopulateMs: Math.round(t3 - t2), perChunkMs: +((t3 - t2) / order.length).toFixed(2), finalize7x7Ms: Math.round(t4 - t3) }));
