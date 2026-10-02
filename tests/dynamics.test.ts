/**
 * Dynamic block behaviour against a real World: fluids, falling blocks, growth, decay, fire.
 * Run: node scripts/run-node-test.mjs tests/dynamics.test.ts
 */
import { BlockIds as B } from '../src/block/BlockIds';
import { Block } from '../src/block/Block';
import { BlockSapling } from '../src/block/BlockSapling';
import '../src/entity/EntityFallingSand';
import { WorldGenRegistry } from '../src/world/WorldGenRegistry';
import { WorldGenTrees } from '../src/world/gen/WorldGenTrees';
import { addFakePlayer } from './dynamicsWorld';
import { check, report } from './harness';
import { makeWorld, slice, tick } from './dynamicsWorld';

// --- water spreads 7 blocks over flat ground --------------------------------------------
{
  const w = makeWorld(2);
  w.setBlock(0, 4, 0, B.waterMoving, 0, 3);
  tick(w, 200);
  const id = (x: number, z: number) => w.getBlockId(x, 4, z);
  const m = (x: number, z: number) => w.getBlockMetadata(x, 4, z);
  check('water source stays', id(0, 0) === B.waterStill && m(0, 0) === 0, `${id(0, 0)}:${m(0, 0)}`);
  check('water spreads to 7', id(7, 0) === B.waterStill && m(7, 0) === 7, `${id(7, 0)}:${m(7, 0)}`);
  check('water stops at 8', id(8, 0) === 0, `${id(8, 0)}`);
  check('water diagonal decay', m(3, 3) === 6 && m(4, 3) === 7 && id(4, 4) === 0, `${m(3, 3)} ${m(4, 3)} ${id(4, 4)}`);
  console.log(slice(w, 4, -8, 8, -8, 8, (i, mm) => (i === 0 ? '.' : i === B.waterStill || i === B.waterMoving ? String(mm) : '#')));
}

// --- two sources make a third (infinite water) --------------------------------------------
{
  const w = makeWorld(1);
  // A 1-wide trench of stone so the sources flow only along it.
  for (let x = -3; x <= 3; x++) for (const z of [-1, 1]) w.setBlock(x, 4, z, B.stone);
  w.setBlock(-1, 4, 0, B.waterMoving, 0, 3);
  w.setBlock(1, 4, 0, B.waterMoving, 0, 3);
  tick(w, 60);
  check('infinite water source', w.getBlockId(0, 4, 0) === B.waterStill && w.getBlockMetadata(0, 4, 0) === 0, `${w.getBlockId(0, 4, 0)}:${w.getBlockMetadata(0, 4, 0)}`);
}

// --- lava flows 3 in the overworld, slowly ----------------------------------------------
{
  const w = makeWorld(1);
  w.setBlock(0, 4, 0, B.lavaMoving, 0, 3);
  tick(w, 30);
  check('lava waits 30 ticks', w.getBlockId(1, 4, 0) === B.lavaMoving || w.getBlockId(1, 4, 0) === 0);
  tick(w, 600);
  const m = (x: number) => (w.getBlockId(x, 4, 0) === 0 ? -1 : w.getBlockMetadata(x, 4, 0));
  check('lava spreads to 3', m(1) === 2 && m(2) === 4 && m(3) === 6 && m(4) === -1, `${m(1)} ${m(2)} ${m(3)} ${m(4)}`);
}

// --- lava meets water -------------------------------------------------------------------
{
  const w = makeWorld(1);
  w.setBlock(0, 4, 0, B.lavaStill, 0, 3);
  w.setBlock(1, 4, 0, B.waterMoving, 0, 3);
  tick(w, 5);
  check('lava source + water = obsidian', w.getBlockId(0, 4, 0) === B.obsidian, `${w.getBlockId(0, 4, 0)}`);
  const w2 = makeWorld(1);
  w2.setBlock(0, 4, 0, B.lavaMoving, 2, 3);
  w2.setBlock(1, 4, 0, B.waterMoving, 0, 3);
  check('flowing lava + water = cobblestone', w2.getBlockId(0, 4, 0) === B.cobblestone, `${w2.getBlockId(0, 4, 0)}`);
  const w3 = makeWorld(1);
  w3.setBlock(0, 3, 0, B.waterStill, 0, 3);
  w3.setBlock(0, 4, 0, B.lavaMoving, 0, 3);
  tick(w3, 40);
  check('lava flowing onto water = stone', w3.getBlockId(0, 3, 0) === B.stone, `${w3.getBlockId(0, 3, 0)}`);
}

// --- sand falls as an entity and lands --------------------------------------------------
{
  const w = makeWorld(3);
  w.setBlock(0, 10, 0, B.sand, 0, 3);
  for (let i = 0; i < 40; i++) {
    w.tick();
    w.updateEntities();
  }
  check('sand fell', w.getBlockId(0, 10, 0) === 0 && w.getBlockId(0, 4, 0) === B.sand, `${w.getBlockId(0, 10, 0)} ${w.getBlockId(0, 4, 0)}`);
  w.setBlock(0, 8, 0, B.gravel, 0, 3);
  w.setBlock(0, 5, 0, B.torchWood, 5, 3);
  for (let i = 0; i < 40; i++) {
    w.tick();
    w.updateEntities();
  }
  const items = w.loadedEntityList.filter((e) => (e as { getEntityItem?(): { itemID: number } }).getEntityItem?.().itemID === B.gravel).length;
  check('gravel on a torch pops as an item', w.getBlockId(0, 5, 0) === B.torchWood && w.getBlockId(0, 6, 0) === 0, `${w.getBlockId(0, 5, 0)} ${w.getBlockId(0, 6, 0)} items=${items}`);
}

// --- leaves decay once the trunk is cut, player-placed leaves stay ----------------------
{
  const w = makeWorld(2);
  addFakePlayer(w);
  for (let y = 4; y <= 8; y++) w.setBlock(0, y, 0, B.wood, 0, 3);
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) for (let y = 7; y <= 9; y++) if (w.isAirBlock(x, y, z)) w.setBlock(x, y, z, B.leaves, 0, 3);
  w.setBlock(5, 4, 5, B.leaves, 4, 3);
  w.setBlock(5, 5, 5, B.leaves, 4 | 8, 3);
  for (let y = 4; y <= 8; y++) w.setBlockToAir(0, y, 0);
  let left = 0;
  for (let i = 0; i < 6000; i++) w.tick();
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) for (let y = 7; y <= 9; y++) if (w.getBlockId(x, y, z) === B.leaves) left++;
  check('leaves decayed', left < 8, `${left} left`);
  check('player leaves stay', w.getBlockId(5, 4, 5) === B.leaves && w.getBlockId(5, 5, 5) === B.leaves);
  // Leaves with a log nearby keep (the check bit is cleared).
  const w2 = makeWorld(1);
  w2.setBlock(0, 4, 0, B.wood, 0, 3);
  w2.setBlock(3, 4, 0, B.leaves, 8, 3);
  w2.setBlock(1, 4, 0, B.leaves, 8, 3);
  w2.setBlock(2, 4, 0, B.leaves, 8, 3);
  Block.blocksList[B.leaves]!.updateTick(w2, 3, 4, 0, w2.rand);
  check('leaves near a log keep', w2.getBlockId(3, 4, 0) === B.leaves && w2.getBlockMetadata(3, 4, 0) === 0, `${w2.getBlockMetadata(3, 4, 0)}`);
}

// --- saplings grow trees ----------------------------------------------------------------
{
  WorldGenRegistry.register('WorldGenTrees', WorldGenTrees);
  const sapling = Block.blocksList[B.sapling] as BlockSapling;
  for (const type of [0, 1, 2, 3]) {
    const w = makeWorld(2);
    w.setBlock(0, 4, 0, B.sapling, type, 3);
    let grown = false;
    for (let i = 0; i < 40 && !grown; i++) {
      sapling.markOrGrowMarked(w, 0, 4, 0, w.rand);
      grown = w.getBlockId(0, 4, 0) === B.wood;
    }
    check(`sapling ${type} grows`, grown && (w.getBlockMetadata(0, 4, 0) & 3) === type, `${w.getBlockId(0, 4, 0)}:${w.getBlockMetadata(0, 4, 0)}`);
  }
  const w = makeWorld(2);
  w.setBlock(0, 4, 0, B.sapling, 0, 3);
  w.setBlock(0, 6, 0, B.stone, 0, 3);
  sapling.growTree(w, 0, 4, 0, w.rand);
  check('blocked sapling stays', w.getBlockId(0, 4, 0) === B.sapling);
}

// --- fire burns a wooden box away -------------------------------------------------------
{
  const w = makeWorld(2);
  addFakePlayer(w);
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) for (let y = 4; y <= 6; y++) w.setBlock(x, y, z, B.planks, 0, 3);
  w.setBlock(0, 7, 0, B.fire, 0, 3);
  let planks = 0;
  for (let i = 0; i < 4000; i++) w.tick();
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) for (let y = 4; y <= 6; y++) if (w.getBlockId(x, y, z) === B.planks) planks++;
  check('fire burns planks', planks < 40, `${planks} planks left of 75`);
  const w2 = makeWorld(1);
  w2.setBlock(0, 4, 0, B.fire, 0, 3);
  for (let i = 0; i < 400; i++) w2.tick();
  check('fire on grass burns out', w2.getBlockId(0, 4, 0) === 0);
  const w3 = makeWorld(1);
  w3.setBlock(0, 3, 0, B.netherrack, 0, 3);
  w3.setBlock(0, 4, 0, B.fire, 0, 3);
  for (let i = 0; i < 400; i++) w3.tick();
  check('fire on netherrack burns forever', w3.getBlockId(0, 4, 0) === B.fire);
}

// --- crops and farmland -----------------------------------------------------------------
{
  const w = makeWorld(1);
  addFakePlayer(w);
  for (let x = -1; x <= 1; x++) w.setBlock(x, 3, 0, B.tilledField, 0, 3);
  w.setBlock(0, 3, 2, B.waterStill, 0, 3);
  w.setBlock(0, 4, 0, B.crops, 0, 3);
  w.setBlock(-1, 4, 0, B.carrot, 0, 3);
  const crops = Block.blocksList[B.crops]!;
  const farmland = Block.blocksList[B.tilledField]!;
  farmland.updateTick(w, 0, 3, 0, w.rand);
  farmland.updateTick(w, 1, 3, 0, w.rand);
  check('wet farmland', w.getBlockMetadata(0, 3, 0) === 7 && w.getBlockMetadata(1, 3, 0) === 7);
  for (let i = 0; i < 400; i++) crops.updateTick(w, 0, 4, 0, w.rand);
  check('crops ripen', w.getBlockMetadata(0, 4, 0) === 7, `${w.getBlockMetadata(0, 4, 0)}`);
  w.setBlockToAir(0, 3, 2);
  farmland.updateTick(w, 1, 3, 0, w.rand);
  check('farmland dries', w.getBlockMetadata(1, 3, 0) === 6);
  for (let i = 0; i < 8; i++) farmland.updateTick(w, 1, 3, 0, w.rand);
  check('dry bare farmland turns to dirt', w.getBlockId(1, 3, 0) === B.dirt);
  for (let i = 0; i < 10; i++) farmland.updateTick(w, -1, 3, 0, w.rand);
  check('planted farmland stays', w.getBlockId(-1, 3, 0) === B.tilledField);
}

// --- stems grow a fruit -----------------------------------------------------------------
{
  const w = makeWorld(1);
  w.setBlock(0, 3, 0, B.tilledField, 7, 3);
  w.setBlock(0, 4, 0, B.pumpkinStem, 7, 3);
  const stem = Block.blocksList[B.pumpkinStem]!;
  for (let i = 0; i < 2000 && w.getBlockId(1, 4, 0) + w.getBlockId(-1, 4, 0) + w.getBlockId(0, 4, 1) + w.getBlockId(0, 4, -1) === 0; i++) stem.updateTick(w, 0, 4, 0, w.rand);
  const fruits = [w.getBlockId(1, 4, 0), w.getBlockId(-1, 4, 0), w.getBlockId(0, 4, 1), w.getBlockId(0, 4, -1)].filter((i) => i === B.pumpkin).length;
  check('stem grows one pumpkin', fruits === 1, `${fruits}`);
}

// --- performance: a big flood ------------------------------------------------------------
{
  const w = makeWorld(3);
  const t0 = performance.now();
  for (let x = -20; x <= 20; x += 8) for (let z = -20; z <= 20; z += 8) w.setBlock(x, 4, z, B.waterMoving, 0, 3);
  tick(w, 300);
  const ms = performance.now() - t0;
  let water = 0;
  for (let x = -40; x <= 40; x++) for (let z = -40; z <= 40; z++) if (w.getBlockMaterial(x, 4, z).isLiquid()) water++;
  console.log(`flood: ${water} water blocks in ${ms.toFixed(0)} ms for 300 ticks`);
  check('flood is fast', ms < 3000, `${ms.toFixed(0)} ms`);
}

report();
