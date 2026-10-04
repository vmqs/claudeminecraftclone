/**
 * The End: terrain against hashes of the real 1.5.2 ChunkProviderEnd.generateTerrain (SHA-256 of
 * the 24x24 chunks around the origin, computed with the original classes), the decorator's
 * spikes, crystals and dragon through the world-generation server.
 *
 *   node scripts/run-node-test.mjs tests/end.test.ts
 */
import '../src/block/Blocks';
import { createHash } from 'node:crypto';
import { BlockIds } from '../src/block/BlockIds';
import { JavaRandom } from '../src/core/JavaRandom';
import { ChunkProviderEnd } from '../src/world/gen/end/ChunkProviderEnd';
import { WorldGenServer } from '../src/world/gen/WorldGenServer';
import { check, report } from './harness';

// ------------------------------------------------------------------ terrain
const GOLDEN: [bigint, string, number][] = [
  [123456789n, '6a256777ff45745959e10975e3e0f203e654887523a21408436b05c394b807fa', 1308662],
  [-4172144997902289642n, 'aa337f40bfa052d97e9f3447c0f2bd130aae902e1d2ee533b0051c2b525650c2', 960535],
];
for (const [seed, hash, solid] of GOLDEN) {
  const p = new ChunkProviderEnd(seed, new JavaRandom(1n));
  const h = createHash('sha256');
  let n = 0;
  for (let cx = -12; cx < 12; cx++) {
    for (let cz = -12; cz < 12; cz++) {
      const c = p.provideChunk(cx, cz);
      h.update(c.blocks);
      for (const b of c.blocks) if (b !== 0) n++;
      check(`biomes are Sky ${cx},${cz}`, c.biomes.every((b) => b === 9));
    }
  }
  const got = h.digest('hex');
  check(`end terrain seed ${seed}`, got === hash && n === solid, `${got} ${n}`);
}

// ------------------------------------------------------------------ decoration
{
  const server = new WorldGenServer({ seed: 123456789n, worldType: 'default', mapFeatures: true, dimension: 1, initialRadius: 0 });
  check('dimension 1 uses ChunkProviderEnd', server.provider instanceof ChunkProviderEnd);
  (server.provider as ChunkProviderEnd).populateRand.setSeed(42n);
  const crystals: { x: number; y: number; z: number }[] = [];
  let dragons = 0;
  const R = 6;
  for (let cx = -R; cx <= R; cx++) {
    for (let cz = -R; cz <= R; cz++) {
      const payload = server.finalizeChunk(cx, cz);
      for (const e of payload.entities ?? []) {
        if (e.name === 'EnderCrystal') crystals.push(e);
        if (e.name === 'EnderDragon') {
          dragons++;
          check('dragon at 0,128,0', e.x === 0 && e.y === 128 && e.z === 0 && cx === 0 && cz === 0, JSON.stringify(e));
        }
      }
    }
  }
  check('one dragon', dragons === 1, String(dragons));
  check('some spikes', crystals.length >= 3, String(crystals.length));
  const w = server.world;
  for (const c of crystals) {
    const x = Math.floor(c.x);
    const z = Math.floor(c.z);
    // Bedrock under the crystal, an obsidian column of 6-37 below it standing on end stone.
    check(`bedrock under crystal ${x},${c.y},${z}`, w.getBlockId(x, c.y, z) === BlockIds.bedrock);
    let h = 0;
    while (w.getBlockId(x, c.y - 1 - h, z) === BlockIds.obsidian) h++;
    check(`spike height ${x},${z}`, h >= 6 && h <= 37, String(h));
    check(`spike on end stone ${x},${z}`, w.getBlockId(x, c.y - 1 - h, z) === BlockIds.whiteStone);
    // The disc: radius 1..4 with the r^2 + 1 rule.
    let r = 0;
    while (r < 6 && w.getBlockId(x + r + 1, c.y - 1, z) === BlockIds.obsidian) r++;
    check(`spike radius ${x},${z}`, r >= 1 && r <= 4, String(r));
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const inside = dx * dx + dz * dz <= r * r + 1;
        if (inside !== (w.getBlockId(x + dx, c.y - 1, z + dz) === BlockIds.obsidian)) check(`spike disc ${x},${z} ${dx},${dz}`, false);
      }
    }
  }
}

report();
