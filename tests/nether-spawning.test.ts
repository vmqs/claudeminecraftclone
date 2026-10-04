/**
 * Natural spawning in the Nether: a generated Nether area around a fortress (seed "claude") in a
 * World with the Nether's provider flags, the mob spawner run many times with a player on a
 * fortress bridge. Inside the fortress's pieces monsters come from the fortress list (blazes,
 * skeletons, which become wither skeletons with stone swords in the Nether, pigmen, magma cubes);
 * outside from the Hell biome (ghasts, pigmen, magma cubes).
 *
 *   node scripts/run-node-test.mjs tests/nether-spawning.test.ts
 */
import '../src/block/Blocks';
import { registerBlockItems } from '../src/item/Items';
import '../src/entity/Entities';
import '../src/world/gen/nether/NetherSpawning';
import { BlockIds, ItemIds } from '../src/block/BlockIds';
import type { EntityLiving } from '../src/entity/EntityLiving';
import { EntityList } from '../src/entity/EntityList';
import { EntityPlayer } from '../src/entity/EntityPlayer';
import { GuiCreateWorld } from '../src/gui/GuiCreateWorld';
import { EnumCreatureType } from '../src/world/biome/SpawnListEntry';
import { Chunk } from '../src/world/Chunk';
import { ChunkSection } from '../src/world/ChunkSection';
import { ChunkProviderHell } from '../src/world/gen/nether/ChunkProviderHell';
import '../src/world/gen/nether/NetherRegistration';
import { WorldGenServer } from '../src/world/gen/WorldGenServer';
import { PossibleCreatures } from '../src/world/PossibleCreatures';
import { SpawnerAnimals } from '../src/world/SpawnerAnimals';
import { TileEntity } from '../src/world/tileentity/TileEntity';
import { World, WorldInfo } from '../src/world/World';
import { check, report } from './harness';

registerBlockItems();

// Unseeded randoms (the world's, every entity's) come from Math.random and the clock: pin both
// so the run is repeatable.
let state = 12345;
Math.random = () => {
  state = (Math.imul(state, 1103515245) + 12345) >>> 0;
  return state / 2 ** 32;
};
Date.now = () => 0;

class TestPlayer extends EntityPlayer {}

const seed = GuiCreateWorld.parseSeed('claude')!;
/** The blaze spawner on the balcony (ComponentNetherBridgeThrone) of the fortress west of the origin. */
const THRONE = { x: -126, y: 70, z: 139 };

const info = new WorldInfo();
info.seed = seed;
info.spawnX = 8;
info.spawnY = 64;
info.spawnZ = 8;
const w = new World(info);
w.difficultySetting = 2;
w.mobSpawner = null;
// WorldProviderHell's flags and light table (the dimensions slice provides the real provider).
Object.assign(w.provider, { dimensionId: -1, isHellWorld: true, hasNoSky: true });
for (let i = 0; i <= 15; i++) {
  const v = 1 - i / 15;
  w.provider.lightBrightnessTable[i] = Math.fround(((1 - v) / (v * 3 + 1)) * (1 - 0.1) + 0.1);
}

const gen = new WorldGenServer({ seed, worldType: 'default', mapFeatures: true, dimension: -1 });
const pcx = THRONE.x >> 4;
const pcz = THRONE.z >> 4;
for (let cx = pcx - 8; cx <= pcx + 8; cx++) {
  for (let cz = pcz - 8; cz <= pcz + 8; cz++) {
    const m = gen.finalizeChunk(cx, cz);
    const c = new Chunk(w, cx, cz);
    for (const s of m.sections) c.sections[s.y >> 4] = new ChunkSection(s.y, { blocks: s.blocks, meta: s.meta, skyLight: s.skyLight, blockLight: s.blockLight });
    c.heightMap.set(m.heightMap);
    c.biomes.set(m.biomes);
    for (const tag of m.tileEntities) {
      const te = TileEntity.createAndLoadEntity(tag);
      if (te) c.addTileEntity(te);
    }
    w.addChunk(c);
  }
}

check('blaze spawner on the balcony', w.getBlockId(THRONE.x, THRONE.y, THRONE.z) === BlockIds.mobSpawner && w.getBlockTileEntity(THRONE.x, THRONE.y, THRONE.z) !== null);

const p = new TestPlayer(w);
p.capabilities.disableDamage = true;
p.setLocationAndAngles(THRONE.x + 0.5, THRONE.y + 1, THRONE.z + 0.5, 0, 0);
w.spawnEntityInWorld(p);

const hell = new ChunkProviderHell(seed);
const inFortress = (x: number, y: number, z: number) => hell.genNetherBridge.isInFortress(hell, Math.floor(x), Math.floor(y), Math.floor(z));
const nearFortress = (x: number, y: number, z: number, r: number) => {
  for (const st of hell.genNetherBridge.structureMap.values()) {
    for (const c of st.components) {
      const b = c.getBoundingBox();
      if (x >= b.minX - r && x <= b.maxX + 1 + r && z >= b.minZ - r && z <= b.maxZ + 1 + r && y >= b.minY && y <= b.maxY + 1) return true;
    }
  }
  return false;
};

// The main thread's list matches the generator's.
const mainInside = PossibleCreatures.get(w, EnumCreatureType.monster, THRONE.x, THRONE.y + 1, THRONE.z)?.map((e) => e.entityName).join() ?? 'biome';
check('main-thread fortress list', mainInside === 'Blaze,PigZombie,Skeleton,LavaSlime', mainInside);
check('main-thread list outside a fortress is the biome', PossibleCreatures.get(w, EnumCreatureType.monster, THRONE.x, 30, THRONE.z + 200) === null);

const seen = new Map<string, number>();
const where = { fortressOnly: 0, hellOnly: 0 };
let witherSkeletons = 0;
let stoneSwords = 0;
let skeletons = 0;
for (let round = 0; round < 120; round++) {
  SpawnerAnimals.findChunksForSpawning(w, true, false, false);
  for (const e of [...w.loadedEntityList]) {
    if (e === p || e.isDead) continue;
    const name = EntityList.getEntityString(e) ?? '?';
    const inside = inFortress(e.posX, e.posY, e.posZ);
    seen.set(`${name}${inside ? '@fortress' : ''}`, (seen.get(`${name}${inside ? '@fortress' : ''}`) ?? 0) + 1);
    // A pack keeps the species drawn at its first spot while it wanders up to 20 blocks away.
    if (name === 'Blaze' || name === 'Skeleton') where.fortressOnly += inside || nearFortress(e.posX, e.posY, e.posZ, 20) ? 0 : 1;
    if (name === 'Ghast') where.hellOnly += inside ? 1 : 0;
    if (name === 'Skeleton') {
      skeletons++;
      const sk = e as EntityLiving & { getSkeletonType?(): number };
      if (sk.getSkeletonType?.() === 1) witherSkeletons++;
      if (sk.getHeldItem()?.itemID === ItemIds.swordStone) stoneSwords++;
    }
    e.setDead();
  }
  w.updateEntities();
}
const summary = [...seen.entries()].sort().map(([k, v]) => `${k}=${v}`).join(' ');
console.log('  spawned:', summary);
check('blazes spawn in the fortress', (seen.get('Blaze@fortress') ?? 0) > 0, summary);
check('skeletons spawn in the fortress', skeletons > 0, summary);
check('fortress mobs only in and next to fortress pieces', where.fortressOnly === 0, summary);
check('ghasts spawn outside the fortress', (seen.get('Ghast') ?? 0) > 0, summary);
check('ghasts never come from the fortress list', where.hellOnly === 0, summary);
check('pigmen spawn', (seen.get('PigZombie') ?? 0) + (seen.get('PigZombie@fortress') ?? 0) > 0, summary);
check('most Nether skeletons are wither skeletons', witherSkeletons > skeletons / 2, `${witherSkeletons}/${skeletons}`);
check('wither skeletons hold stone swords', stoneSwords === witherSkeletons, `${stoneSwords}/${witherSkeletons}`);
const overworld = new Set(['Zombie', 'Creeper', 'Spider', 'CaveSpider', 'Enderman', 'Witch', 'Slime']);
check('no overworld monsters', ![...seen.keys()].some((k) => overworld.has(k.replace('@fortress', ''))), summary);
report();
