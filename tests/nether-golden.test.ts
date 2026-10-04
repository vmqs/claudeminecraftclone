/**
 * The Nether generator against vanilla 1.5.2. The expected hashes were computed from dumps of the
 * original ChunkProviderHell (run headless from the 1.5.2 client jar): raw chunk terrain, the
 * layout of every fortress within 64 chunks of the origin, and three populated areas (with the
 * blaze spawners and the scheduled ticks population leaves). Population starts from the random
 * state the server has when the populated chunk was the last of its 2x2 group to be generated
 * (ChunkProviderHell.seedPopulateRandom); the dumps were made the same way. Also checks that the
 * worker's output does not depend on terrain being made ahead (the terrain workers) and that a
 * fortress's layout does not depend on which chunk is generated first.
 *
 *   node scripts/run-node-test.mjs tests/nether-golden.test.ts
 * Set GOLDEN_PRINT=1 to print the hashes instead of checking them.
 */
import '../src/block/Blocks';
import { GuiCreateWorld } from '../src/gui/GuiCreateWorld';
import { EnumCreatureType } from '../src/world/biome/SpawnListEntry';
import { GenWorld } from '../src/world/gen/GenWorld';
import { ChunkProviderHell } from '../src/world/gen/nether/ChunkProviderHell';
import { netherBridgePieceName } from '../src/world/gen/nether/NetherBridgePieces';
import '../src/world/gen/nether/NetherRegistration';
import { toTerrainChunk } from '../src/world/gen/TerrainChunk';
import { WorldGenServer } from '../src/world/gen/WorldGenServer';
import type { StructureStart } from '../src/world/gen/structure/StructureStart';
import type { ChunkPayload } from '../src/workers/worldgenProtocol';
import { check, report } from './harness';

class Hash {
  h1 = 0x811c9dc5;
  h2 = 0x01000193;
  bytes(u: Uint8Array): void {
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

const CLAUDE = GuiCreateWorld.parseSeed('claude')!;
const results: Record<string, string> = {};

/** Raw terrain (ids in the generator's x << 11 | z << 7 | y layout) of the chunks x0..x1, z0..z1. */
function terrain(seed: bigint, x0: number, z0: number, x1: number, z1: number): string {
  const g = new ChunkProviderHell(seed);
  const h = new Hash();
  for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) h.bytes(g.provideChunk(cx, cz).blocks);
  return h.hex();
}

/** Every fortress start within r chunks of the origin, sorted by chunk, piece by piece. */
function layoutText(g: ChunkProviderHell): string {
  const starts: [string, StructureStart][] = [];
  const entries = (g.genNetherBridge.structureMap as unknown as { entries: Map<number, { start: StructureStart }> }).entries;
  for (const [k, e] of entries) {
    const [cx, cz] = GenWorld.unkey(k);
    starts.push([`${String(cx + 50000).padStart(8, '0')},${String(cz + 50000).padStart(8, '0')}`, e.start]);
  }
  starts.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const lines: string[] = [];
  for (const [key, s] of starts) {
    const b = s.getBoundingBox();
    lines.push(`start ${key} ${s.components.length} ${b.minX} ${b.minY} ${b.minZ} ${b.maxX} ${b.maxY} ${b.maxZ}`);
    for (const c of s.components) {
      const cb = c.getBoundingBox();
      const name = netherBridgePieceName(c);
      lines.push(`  ${name} ${c.coordBaseMode} ${c.getComponentType()} ${cb.minX} ${cb.minY} ${cb.minZ} ${cb.maxX} ${cb.maxY} ${cb.maxZ}`);
    }
  }
  return lines.join('\n');
}

function fortresses(seed: bigint, r: number, reverse = false): string {
  const g = new ChunkProviderHell(seed);
  const points: [number, number][] = [];
  for (let cx = -r; cx <= r; cx += 8) for (let cz = -r; cz <= r; cz += 8) points.push([cx, cz]);
  if (reverse) points.reverse();
  for (const [cx, cz] of points) g.genNetherBridge.generate(g, cx, cz, null);
  const h = new Hash();
  h.text(layoutText(g));
  return h.hex();
}

/**
 * The area x0..x1, z0..z1 generated raw, then the chunks of `order` populated one after the
 * other: ids and metadata of the area, the spawners, and the scheduled ticks.
 */
function populated(seed: bigint, x0: number, z0: number, x1: number, z1: number, order: [number, number][]): string {
  const s = new WorldGenServer({ seed, worldType: 'default', mapFeatures: true, dimension: -1 });
  for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) s.ensureTerrain(cx, cz);
  for (const [cx, cz] of order) s.ensurePopulated(cx, cz);
  const h = new Hash();
  const ids = new Uint8Array(32768);
  const meta = new Uint8Array(32768);
  const ticks = new Set<string>();
  for (let cx = x0; cx <= x1; cx++) {
    for (let cz = z0; cz <= z1; cz++) {
      const c = s.world.chunks.get(GenWorld.key(cx, cz))!;
      for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
          for (let y = 0; y < 128; y++) {
            ids[(x << 11) | (z << 7) | y] = c.getBlockID(x, y, z);
            meta[(x << 11) | (z << 7) | y] = c.getBlockMetadata(x, y, z);
          }
        }
      }
      h.bytes(ids);
      h.bytes(meta);
      for (const t of c.pendingTicks) ticks.add(t.join(','));
    }
  }
  const spawners: string[] = [];
  for (const m of s.world.tileTags.values()) for (const t of m.values()) spawners.push(`${t.x},${t.y},${t.z},${t.EntityId}`);
  h.text(spawners.sort().join(';'));
  h.text([...ticks].sort().join(';'));
  return h.hex();
}

function rows(x0: number, x1: number, z0: number, z1: number): [number, number][] {
  const out: [number, number][] = [];
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) out.push([cx, cz]);
  return out;
}

function columnsReversed(x0: number, x1: number, z0: number, z1: number): [number, number][] {
  const out: [number, number][] = [];
  for (let cx = x1; cx >= x0; cx--) for (let cz = z1; cz >= z0; cz--) out.push([cx, cz]);
  return out;
}

const hashPayload = (h: Hash, p: ChunkPayload) => {
  h.text(`${p.cx},${p.cz};`);
  for (const s of p.sections) {
    h.text(`s${s.y}`);
    h.bytes(s.blocks);
    h.bytes(s.meta);
    h.bytes(s.skyLight);
    h.bytes(s.blockLight);
  }
  h.text(JSON.stringify(p.pendingTicks));
  h.text(JSON.stringify(p.tileEntities));
};

/** Finalized chunks around a fortress as the worker sends them, with or without terrain made ahead. */
function worker(prefetch: boolean): string {
  const s = new WorldGenServer({ seed: CLAUDE, worldType: 'default', mapFeatures: true, dimension: -1 });
  const ahead = prefetch ? new ChunkProviderHell(CLAUDE) : null;
  const h = new Hash();
  for (let cz = 7; cz <= 10; cz++) {
    for (let cx = 8; cx <= 11; cx++) {
      if (ahead) for (const [x, z] of s.missingTerrainFor(cx, cz)) s.offerTerrain(toTerrainChunk(x, z, ahead.provideTerrain(x, z)));
      hashPayload(h, s.finalizeChunk(cx, cz));
    }
  }
  return h.hex();
}

const t0 = performance.now();
results['terrain claude -2..2'] = terrain(CLAUDE, -2, -2, 2, 2);
results['terrain 123456789 (-40,95)..(-33,102)'] = terrain(123456789n, -40, 95, -33, 102);
results['fortresses claude r64'] = fortresses(CLAUDE, 64);
results['populated claude (0,3)..(9,12)'] = populated(CLAUDE, 0, 3, 9, 12, rows(1, 7, 4, 10));
results['populated claude (3,6)..(12,13) reversed'] = populated(CLAUDE, 3, 6, 12, 13, columnsReversed(4, 11, 7, 12));
results['populated claude (-13,4)..(-6,10)'] = populated(CLAUDE, -13, 4, -6, 10, rows(-12, -7, 5, 9));

/** Hashes of the vanilla 1.5.2 dumps (see the header). */
const VANILLA: Record<string, string> = {
  'terrain claude -2..2': 'af9fbb0630ca3998',
  'terrain 123456789 (-40,95)..(-33,102)': '1a0ebbc7636811f1',
  'fortresses claude r64': 'd35d3b04fe91425a',
  'populated claude (0,3)..(9,12)': '162371d518338993',
  'populated claude (3,6)..(12,13) reversed': 'acf8b801516c4440',
  'populated claude (-13,4)..(-6,10)': '02b44394e54a891f',
};

for (const [name, got] of Object.entries(results)) {
  if (process.env.GOLDEN_PRINT) console.log(`  '${name}': '${got}',`);
  else check(`nether ${name}`, got === VANILLA[name], `got ${got}, want ${VANILLA[name]}`);
}

// Fortress starts do not depend on the order chunks are generated in.
check('fortress layout independent of generation order', fortresses(CLAUDE, 64, true) === results['fortresses claude r64']);
// Terrain made ahead by another generator (the terrain workers) changes nothing.
check('worker output with terrain made ahead', worker(true) === worker(false));

// Monsters inside a fortress piece come from the fortress list, elsewhere from the Hell biome.
const g = new ChunkProviderHell(CLAUDE);
const inside = g.getPossibleCreatures(EnumCreatureType.monster, -126, 71, 139).map((e) => e.entityName);
const outside = g.getPossibleCreatures(EnumCreatureType.monster, 0, 40, 0).map((e) => e.entityName);
check('fortress spawn list', inside.join() === 'Blaze,PigZombie,Skeleton,LavaSlime', inside.join());
check('hell spawn list', outside.join() === 'Ghast,PigZombie,LavaSlime', outside.join());
check('no fortress creatures', g.getPossibleCreatures(EnumCreatureType.creature, -126, 71, 139).length === 0);

if (process.env.GOLDEN_PRINT) console.log(`(${Math.round(performance.now() - t0)} ms)`);
report();
