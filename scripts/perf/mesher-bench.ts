/**
 * Section meshing benchmark (Node): generated terrain around a seed's spawn is loaded into a
 * client World, then every non-empty section of the inner chunks is copied into a padded
 * snapshot (the main thread's part, RenderGlobal) and meshed (the mesher worker's part,
 * SectionMesher). Prints milliseconds per section for both, vertex counts, and a hash of all
 * mesh bytes so mesher changes can be checked for identical output.
 *
 *   node scripts/perf/bench.mjs mesher [seed] [radius] [ao] [fancy]
 */
import '../../src/block/Blocks';
import { Block } from '../../src/block/Block';
import { Blocks } from '../../src/block/Blocks';
import type { BlockLeaves } from '../../src/block/BlockLeaves';
import { GuiCreateWorld } from '../../src/gui/GuiCreateWorld';
import { RenderBlocks } from '../../src/render/RenderBlocks';
import { SectionMesher } from '../../src/render/SectionMesher';
import { fillSectionSnapshot } from '../../src/render/SectionSnapshotFill';
import { Icon, IconTableRegister, type IconTable } from '../../src/render/texture/Icon';
import { Chunk } from '../../src/world/Chunk';
import { allocSnapshot } from '../../src/world/ChunkCache';
import { ChunkSection } from '../../src/world/ChunkSection';
import { WorldGenServer } from '../../src/world/gen/WorldGenServer';
import { World, WorldInfo } from '../../src/world/World';

const seedText = process.argv[2] ?? 'claude';
const radius = Number(process.argv[3] ?? 3);
RenderBlocks.aoLevel = Number(process.argv[4] ?? 2);
const fancy = (process.argv[5] ?? '1') === '1';
RenderBlocks.fancyGrass = fancy;
(Blocks.leaves as BlockLeaves).setGraphicsLevel(fancy);

for (const b of Block.blocksList) b?.initializeBlock();
const register = new IconTableRegister();
const names: string[] = [];
const orig = register.registerIcon.bind(register);
register.registerIcon = (name: string) => {
  if (!names.includes(name)) names.push(name);
  return orig(name);
};
for (const b of Block.blocksList) if (b) b.registerIcons(register);
const table: IconTable = { sheetWidth: 1024, sheetHeight: 1024, icons: {}, missing: [0, 0, 16, 16] };
names.forEach((n, i) => (table.icons[n] = [((i % 63) + 1) * 16, Math.floor(i / 63) * 16, 16, 16]));
register.apply(table);
const missing = new Icon('missingno');
missing.setPlacement(1024, 1024, 0, 0, 16, 16);
RenderBlocks.missingIcon = missing;

// Terrain: the spawn area, then finalized chunks as the client receives them.
const seed = GuiCreateWorld.parseSeed(seedText)!;
const gen = new WorldGenServer({ seed, worldType: 'default', mapFeatures: true, initialRadius: radius + 3 });
const spawn = gen.createSpawnPosition();
const info = new WorldInfo();
const world = new World(info);
world.mobSpawner = null;
const scx = spawn[0] >> 4;
const scz = spawn[2] >> 4;
for (let dz = -radius - 1; dz <= radius + 1; dz++) {
  for (let dx = -radius - 1; dx <= radius + 1; dx++) {
    const m = gen.finalizeChunk(scx + dx, scz + dz);
    const c = new Chunk(world, m.cx, m.cz);
    for (const s of m.sections) c.sections[s.y >> 4] = new ChunkSection(s.y, { blocks: s.blocks, meta: s.meta, skyLight: s.skyLight, blockLight: s.blockLight });
    c.heightMap.set(m.heightMap);
    c.biomes.set(m.biomes);
    world.addChunk(c);
  }
}

const snap = allocSnapshot();
const mesher = new SectionMesher();
let fillMs = 0;
let meshMs = 0;
let sections = 0;
let verts = 0;
let h = 0x811c9dc5;
for (let rep = 0; rep < 2; rep++) {
  // The first round warms the JIT; the second is timed.
  fillMs = meshMs = sections = verts = 0;
  h = 0x811c9dc5;
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let sy = 0; sy < 16; sy++) {
        const sec = world.getChunkFromChunkCoords(scx + dx, scz + dz).sections[sy];
        if (!sec || sec.isEmpty()) continue;
        const t0 = performance.now();
        fillSectionSnapshot(world, snap, scx + dx, sy, scz + dz);
        const t1 = performance.now();
        const { passes, counts } = mesher.mesh(snap);
        const t2 = performance.now();
        fillMs += t1 - t0;
        meshMs += t2 - t1;
        sections++;
        verts += counts[0] + counts[1];
        for (const p of passes) {
          if (!p) continue;
          const u = new Uint8Array(p);
          for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 0x01000193);
        }
      }
    }
  }
}
console.log(
  JSON.stringify({
    seed: seedText,
    ao: RenderBlocks.aoLevel,
    fancy,
    sections,
    vertices: verts,
    fillMsPerSection: +(fillMs / sections).toFixed(3),
    meshMsPerSection: +(meshMs / sections).toFixed(3),
    totalMs: Math.round(fillMs + meshMs),
    meshHash: (h >>> 0).toString(16),
  }),
);
