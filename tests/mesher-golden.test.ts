/**
 * Section meshes must stay byte-identical through performance work: generated terrain (two
 * seeds' spawns and a desert village with doors, fences, stairs, crops, torches, ladders...)
 * is copied into snapshots (fillSectionSnapshot) and meshed (SectionMesher) with every smooth
 * lighting level and both graphics settings; the hashes of all mesh bytes were recorded before
 * the optimizations.
 *
 *   node scripts/run-node-test.mjs tests/mesher-golden.test.ts
 * Set GOLDEN_PRINT=1 to print the hashes instead of checking them.
 */
import '../src/block/Blocks';
import { Block } from '../src/block/Block';
import { Blocks } from '../src/block/Blocks';
import type { BlockLeaves } from '../src/block/BlockLeaves';
import { GuiCreateWorld } from '../src/gui/GuiCreateWorld';
import { RenderBlocks } from '../src/render/RenderBlocks';
import { SectionMesher } from '../src/render/SectionMesher';
import { fillSectionSnapshot } from '../src/render/SectionSnapshotFill';
import { Icon, IconTableRegister, type IconTable } from '../src/render/texture/Icon';
import { Chunk } from '../src/world/Chunk';
import { allocSnapshot } from '../src/world/ChunkCache';
import { ChunkSection } from '../src/world/ChunkSection';
import { WorldGenServer } from '../src/world/gen/WorldGenServer';
import { World, WorldInfo } from '../src/world/World';
import { check, report } from './harness';

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

/** Chunks around the spawn (or `at`, a chunk position) loaded into a client World. */
function load(seed: string, type: string, radius: number, at?: [number, number]): { world: World; cx: number; cz: number } {
  const gen = new WorldGenServer({ seed: GuiCreateWorld.parseSeed(seed)!, worldType: type, mapFeatures: true, initialRadius: radius + 3 });
  const spawn = gen.createSpawnPosition();
  const world = new World(new WorldInfo());
  world.mobSpawner = null;
  const cx = at ? at[0] : spawn[0] >> 4;
  const cz = at ? at[1] : spawn[2] >> 4;
  for (let dz = -radius - 1; dz <= radius + 1; dz++) {
    for (let dx = -radius - 1; dx <= radius + 1; dx++) {
      const m = gen.finalizeChunk(cx + dx, cz + dz);
      const c = new Chunk(world, m.cx, m.cz);
      for (const s of m.sections) c.sections[s.y >> 4] = new ChunkSection(s.y, { blocks: s.blocks, meta: s.meta, skyLight: s.skyLight, blockLight: s.blockLight });
      c.heightMap.set(m.heightMap);
      c.biomes.set(m.biomes);
      world.addChunk(c);
    }
  }
  return { world, cx, cz };
}

function meshAll(w: { world: World; cx: number; cz: number }, radius: number, ao: number, fancy: boolean): string {
  RenderBlocks.aoLevel = ao;
  RenderBlocks.fancyGrass = fancy;
  (Blocks.leaves as BlockLeaves).setGraphicsLevel(fancy);
  const snap = allocSnapshot();
  const mesher = new SectionMesher();
  let h = 0x811c9dc5;
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let sy = 0; sy < 16; sy++) {
        fillSectionSnapshot(w.world, snap, w.cx + dx, sy, w.cz + dz);
        const { passes, counts } = mesher.mesh(snap);
        h = Math.imul(h ^ counts[0], 0x01000193);
        h = Math.imul(h ^ counts[1], 0x01000193);
        for (const p of passes) {
          if (!p) continue;
          const u = new Uint8Array(p);
          for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 0x01000193);
        }
      }
    }
  }
  return (h >>> 0).toString(16);
}

/** Hashes recorded before the performance work (commit d0e00fc). */
const GOLDEN: Record<string, string> = {
  'claude ao0 fast': 'bcb85129',
  'claude ao0 fancy': 'bb80043d',
  'claude ao1 fast': 'e2bdbaf7',
  'claude ao1 fancy': '38fcb2b4',
  'claude ao2 fast': 'e2bdbaf7',
  'claude ao2 fancy': '38fcb2b4',
  '123456789 ao0 fast': 'd4263e85',
  '123456789 ao0 fancy': '600df1d',
  '123456789 ao1 fast': 'eb983445',
  '123456789 ao1 fancy': '6b640388',
  '123456789 ao2 fast': 'eb983445',
  '123456789 ao2 fancy': '6b640388',
  'claude village ao0 fast': '9fb7cbdf',
  'claude village ao0 fancy': '915a73eb',
  'claude village ao1 fast': '647d31ee',
  'claude village ao1 fancy': '2997f7a0',
  'claude village ao2 fast': '1f3565d8',
  'claude village ao2 fancy': 'd81ad3da',
};

const worlds: [string, ReturnType<typeof load>, number][] = [
  ['claude', load('claude', 'default', 2), 2],
  ['123456789', load('123456789', 'default', 2), 2],
  // The desert village of the worldgen scenario: sandstone houses, doors, fences, torches, crops.
  ['claude village', load('claude', 'default', 2, [4, 40]), 2],
];
for (const [name, w, r] of worlds) {
  for (const ao of [0, 1, 2]) {
    for (const fancy of [false, true]) {
      const k = `${name} ao${ao} ${fancy ? 'fancy' : 'fast'}`;
      const got = meshAll(w, r, ao, fancy);
      if (process.env.GOLDEN_PRINT) console.log(`  '${k}': '${got}',`);
      else check(`mesh ${k}`, got === GOLDEN[k], `got ${got}, want ${GOLDEN[k]}`);
    }
  }
}
report();
