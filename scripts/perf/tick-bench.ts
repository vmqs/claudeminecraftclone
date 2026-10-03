/**
 * World tick benchmark (Node): generated terrain around a seed's spawn in a client World with
 * world-generation animals, natural spawning at night and a stand-in player, ticked like the
 * game loop (updateEntities, then tick). Prints milliseconds per tick, entity counts and the
 * heap growth per tick (run with --expose-gc for collection counts).
 *
 *   node scripts/perf/bench.mjs tick [seed] [radius] [ticks]
 */
import '../../src/block/Blocks';

import '../../src/entity/Entities';
import { EntityList } from '../../src/entity/EntityList';
import { EntityPlayer } from '../../src/entity/EntityPlayer';
import { registerBlockItems } from '../../src/item/Items';
import type { EntityLiving } from '../../src/entity/EntityLiving';
import { GuiCreateWorld } from '../../src/gui/GuiCreateWorld';
import { Chunk } from '../../src/world/Chunk';
import { ChunkSection } from '../../src/world/ChunkSection';
import { TileEntity } from '../../src/world/tileentity/TileEntity';
import { WorldGenServer } from '../../src/world/gen/WorldGenServer';
import { World, WorldInfo } from '../../src/world/World';

registerBlockItems();
// Unseeded randoms (the world's, every entity's) come from Math.random and the clock: pin both
// so runs spawn the same mobs and compare.
let lcg = 12345;
Math.random = () => ((lcg = (Math.imul(lcg, 1103515245) + 12345) >>> 0) / 4294967296);
Date.now = () => 1_700_000_000_000;
const seedText = process.argv[2] ?? 'claude';
const radius = Number(process.argv[3] ?? 6);
const ticks = Number(process.argv[4] ?? 600);

const seed = GuiCreateWorld.parseSeed(seedText)!;
const gen = new WorldGenServer({ seed, worldType: 'default', mapFeatures: true });
const spawn = gen.createSpawnPosition();
const info = new WorldInfo();
info.seed = seed;
info.gameType = 0;
info.worldTime = 13000;
const world = new World(info);
const scx = spawn[0] >> 4;
const scz = spawn[2] >> 4;
for (let dz = -radius; dz <= radius; dz++) {
  for (let dx = -radius; dx <= radius; dx++) {
    const m = gen.finalizeChunk(scx + dx, scz + dz);
    const c = new Chunk(world, m.cx, m.cz);
    for (const s of m.sections) c.sections[s.y >> 4] = new ChunkSection(s.y, { blocks: s.blocks, meta: s.meta, skyLight: s.skyLight, blockLight: s.blockLight });
    c.heightMap.set(m.heightMap);
    c.biomes.set(m.biomes);
    c.pendingTicks = m.pendingTicks;
    for (const tag of m.tileEntities) {
      const te = TileEntity.createAndLoadEntity(tag);
      if (te) c.addTileEntity(te);
    }
    world.addChunk(c);
    for (const d of m.entities) {
      const e = EntityList.fromDescriptor(d, world);
      if (!e) continue;
      world.spawnEntityInWorld(e);
      if (e.isLivingEntity && d.init !== false) (e as EntityLiving).initCreature();
    }
  }
}
// A survival player standing at the spawn: random ticks, spawning and mob AI follow it.
class BenchPlayer extends EntityPlayer {}
world.difficultySetting = 2;
const player = new BenchPlayer(world);
player.setLocationAndAngles(spawn[0] + 0.5, world.getTopSolidOrLiquidBlock(spawn[0], spawn[2]) + 1, spawn[2] + 0.5, 0, 0);
world.spawnEntityInWorld(player);

const g = (globalThis as { gc?: () => void }).gc;
const heap = () => process.memoryUsage().heapUsed;
// Warm up (mobs spawn, fluids settle), then time.
for (let i = 0; i < 100; i++) {
  world.updateEntities();
  world.tick();
}
g?.();
const h0 = heap();
const cpu0 = process.cpuUsage();
const t0 = performance.now();
let worst = 0;
for (let i = 0; i < ticks; i++) {
  const a = performance.now();
  world.updateEntities();
  world.tick();
  worst = Math.max(worst, performance.now() - a);
}
const wall = performance.now() - t0;
const cpu = process.cpuUsage(cpu0);
const h1 = heap();
const living = world.loadedEntityList.filter((e) => e.isLivingEntity).length;
console.log(
  JSON.stringify({
    seed: seedText,
    chunks: world.loadedChunkCount,
    entities: world.loadedEntityList.length,
    living,
    tileEntities: world.loadedTileEntityList.length,
    msPerTick: +(wall / ticks).toFixed(3),
    cpuMsPerTick: +((cpu.user + cpu.system) / 1000 / ticks).toFixed(3),
    worstTickMs: +worst.toFixed(1),
    heapGrowthKBPerTick: g ? +((h1 - h0) / 1024 / ticks).toFixed(1) : null,
  }),
);
