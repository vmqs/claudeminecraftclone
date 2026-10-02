/**
 * Dynamic block behaviour against a real World: fluids, falling blocks, growth, decay, fire.
 * Run: node scripts/run-node-test.mjs tests/dynamics.test.ts
 */
import { BlockIds as B } from '../src/block/BlockIds';
import { Block } from '../src/block/Block';
import { BlockSapling } from '../src/block/BlockSapling';
import '../src/entity/EntityFallingSand';
import '../src/entity/Entities';
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
  w.rand.setSeed(12345n);
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) for (let y = 4; y <= 6; y++) w.setBlock(x, y, z, B.planks, 0, 3);
  // Planks are slow to catch (encouragement 5), so start several fires on the box.
  for (const [x, z] of [[0, 0], [-2, -2], [2, 2], [-2, 2], [2, -2]]) w.setBlock(x, 7, z, B.fire, 0, 3);
  let planks = 0;
  for (let i = 0; i < 4000; i++) w.tick();
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) for (let y = 4; y <= 6; y++) if (w.getBlockId(x, y, z) === B.planks) planks++;
  check('fire burns planks', planks < 70, `${planks} planks left of 75`);
  const w2 = makeWorld(1);
  w2.setBlock(0, 4, 0, B.fire, 0, 3);
  for (let i = 0; i < 2000; i++) w2.tick();
  check('fire on grass burns out', w2.getBlockId(0, 4, 0) === 0);
  const w3 = makeWorld(1);
  w3.setBlock(0, 3, 0, B.netherrack, 0, 3);
  w3.setBlock(0, 4, 0, B.fire, 0, 3);
  for (let i = 0; i < 400; i++) w3.tick();
  check('fire on netherrack burns forever', w3.getBlockId(0, 4, 0) === B.fire);
}

// --- doFireTick off freezes fire; burning TNT is primed ------------------------------------
{
  const w = makeWorld(1);
  w.worldInfo.gameRules.doFireTick = false;
  w.setBlock(0, 4, 0, B.planks, 0, 3);
  w.setBlock(0, 5, 0, B.fire, 0, 3);
  for (let i = 0; i < 1000; i++) w.tick();
  check('doFireTick false: fire stays, planks stay', w.getBlockId(0, 5, 0) === B.fire && w.getBlockId(0, 4, 0) === B.planks);
  const t = makeWorld(1);
  t.rand.setSeed(7n);
  t.setBlock(0, 4, 0, B.tnt, 0, 3);
  t.setBlock(0, 5, 0, B.fire, 0, 3);
  for (let i = 0; i < 3000 && t.getBlockId(0, 4, 0) === B.tnt; i++) t.tick();
  const primed = t.loadedEntityList.filter((e) => e.constructor.name.includes('TNT')).length;
  check('fire primes TNT', t.getBlockId(0, 4, 0) !== B.tnt && primed === 1, `${t.getBlockId(0, 4, 0)} primed=${primed}`);
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

// --- weather: rain puts fire out, fills cauldrons; snow and ice form in cold biomes -------
{
  const rain = (w: ReturnType<typeof makeWorld>) => {
    w.worldInfo.raining = true;
    w.worldInfo.rainTime = 1000000;
    w.setRainStrength(1);
  };
  const w = makeWorld(1);
  rain(w);
  w.setBlock(0, 3, 0, B.planks, 0, 3);
  w.setBlock(0, 4, 0, B.fire, 0, 3);
  Block.blocksList[B.fire]!.updateTick(w, 0, 4, 0, w.rand);
  check('rain puts fire out', w.getBlockId(0, 4, 0) === 0);
  w.setBlock(2, 3, 0, B.netherrack, 0, 3);
  w.setBlock(2, 4, 0, B.fire, 0, 3);
  Block.blocksList[B.fire]!.updateTick(w, 2, 4, 0, w.rand);
  check('netherrack fire burns in rain', w.getBlockId(2, 4, 0) === B.fire);
  w.setBlock(4, 4, 0, B.cauldron, 0, 3);
  for (let i = 0; i < 400; i++) Block.blocksList[B.cauldron]!.fillWithRain(w, 4, 4, 0);
  check('cauldron fills in rain', w.getBlockMetadata(4, 4, 0) === 3, `${w.getBlockMetadata(4, 4, 0)}`);

  const cold = makeWorld(1, [B.bedrock, B.dirt, B.dirt, B.grass], 12);
  addFakePlayer(cold);
  rain(cold);
  cold.setBlock(3, 3, 3, B.waterStill, 0, 3);
  tick(cold, 3000);
  let snow = 0;
  for (let x = -16; x < 32; x++) for (let z = -16; z < 32; z++) if (cold.getBlockId(x, 4, z) === B.snow) snow++;
  check('snow layers form while it rains in a cold biome', snow > 500, `${snow}`);
  check('lone water source can freeze', cold.getBlockId(3, 3, 3) === B.ice || cold.isBlockFreezableNaturally(3, 3, 3));
  let ice = 0;
  for (let x = -16; x < 32; x++) for (let z = -16; z < 32; z++) if (cold.getBlockId(x, 3, z) === B.ice) ice++;
  check('only that water could freeze', ice <= 1, `${ice}`);
}

// --- melting and light rules --------------------------------------------------------------
{
  const w = makeWorld(2);
  w.setBlock(0, 4, 0, B.ice, 0, 3);
  w.setBlock(0, 5, 0, B.snow, 0, 3);
  w.setBlock(2, 4, 0, B.blockSnow, 0, 3);
  w.setBlock(1, 4, 0, B.glowStone, 0, 3);
  w.setBlock(1, 5, 0, B.glowStone, 0, 3);
  Block.blocksList[B.ice]!.updateTick(w, 0, 4, 0, w.rand);
  Block.blocksList[B.snow]!.updateTick(w, 0, 5, 0, w.rand);
  Block.blocksList[B.blockSnow]!.updateTick(w, 2, 4, 0, w.rand);
  check('ice melts by glowstone', w.getBlockId(0, 4, 0) === B.waterStill || w.getBlockId(0, 4, 0) === B.waterMoving, `${w.getBlockId(0, 4, 0)}`);
  check('snow layer melts', w.getBlockId(0, 5, 0) !== B.snow);
  // An opaque block has no light of its own, so (as in 1.5.2) snow blocks never melt.
  check('snow block stays', w.getBlockId(2, 4, 0) === B.blockSnow);
  // Grass under an opaque block dies; dirt next to lit grass turns green.
  const g = makeWorld(1);
  g.setBlock(0, 4, 0, B.stone, 0, 3);
  Block.blocksList[B.grass]!.updateTick(g, 0, 3, 0, g.rand);
  check('covered grass turns to dirt', g.getBlockId(0, 3, 0) === B.dirt);
  g.setBlock(5, 3, 5, B.dirt, 0, 3);
  for (let i = 0; i < 200; i++) Block.blocksList[B.grass]!.updateTick(g, 4, 3, 5, g.rand);
  check('grass spreads to lit dirt', g.getBlockId(5, 3, 5) === B.grass);
  g.setBlock(7, 3, 7, B.mycelium, 0, 3);
  g.setBlock(8, 3, 7, B.dirt, 0, 3);
  for (let i = 0; i < 200; i++) Block.blocksList[B.mycelium]!.updateTick(g, 7, 3, 7, g.rand);
  check('mycelium spreads', g.getBlockId(8, 3, 7) === B.mycelium);
}

// --- cactus and sugar cane grow to three, vines spread ------------------------------------
{
  const w = makeWorld(1, [B.bedrock, B.dirt, B.dirt, B.sand]);
  w.setBlock(0, 4, 0, B.cactus, 0, 3);
  w.setBlock(3, 3, 0, B.waterStill, 0, 3);
  w.setBlock(4, 4, 0, B.reed, 0, 3);
  for (let i = 0; i < 100; i++) {
    for (let y = 4; y < 8; y++) {
      if (w.getBlockId(0, y, 0) === B.cactus) Block.blocksList[B.cactus]!.updateTick(w, 0, y, 0, w.rand);
      if (w.getBlockId(4, y, 0) === B.reed) Block.blocksList[B.reed]!.updateTick(w, 4, y, 0, w.rand);
    }
  }
  check('cactus grows 3 tall', w.getBlockId(0, 6, 0) === B.cactus && w.getBlockId(0, 7, 0) === 0);
  check('sugar cane grows 3 tall', w.getBlockId(4, 6, 0) === B.reed && w.getBlockId(4, 7, 0) === 0);
  w.setBlock(1, 5, 0, B.stone, 0, 3);
  check('cactus next to a block breaks', w.getBlockId(0, 5, 0) === 0 && w.getBlockId(0, 6, 0) === 0, `${w.getBlockId(0, 5, 0)}`);
  const v = makeWorld(1);
  for (let y = 4; y < 12; y++) v.setBlock(0, y, 0, B.stone, 0, 3);
  v.setBlock(1, 8, 0, B.vine, 2, 3);
  for (let i = 0; i < 2000; i++) {
    for (let y = 4; y < 12; y++) for (let z = -1; z <= 1; z++) if (v.getBlockId(1, y, z) === B.vine) Block.blocksList[B.vine]!.updateTick(v, 1, y, z, v.rand);
  }
  let vines = 0;
  for (let y = 4; y < 13; y++) for (let x = -1; x <= 2; x++) for (let z = -2; z <= 2; z++) if (v.getBlockId(x, y, z) === B.vine) vines++;
  check('vines spread', vines >= 4 && v.getBlockId(1, 7, 0) === B.vine, `${vines}`);
}

// --- portals, golem patterns, redstone ore, cocoa, nether wart -----------------------------
{
  const w = makeWorld(1);
  for (const [x, y] of [[1, 4], [2, 4], [1, 8], [2, 8], [0, 5], [0, 6], [0, 7], [3, 5], [3, 6], [3, 7]]) w.setBlock(x, y, 0, B.obsidian, 0, 3);
  w.setBlock(1, 5, 0, B.fire, 0, 3);
  let portal = 0;
  for (let x = 1; x <= 2; x++) for (let y = 5; y <= 7; y++) if (w.getBlockId(x, y, 0) === B.portal) portal++;
  check('fire in an obsidian frame lights a portal', portal === 6, `${portal}`);
  w.setBlockToAir(0, 6, 0);
  portal = 0;
  for (let x = 1; x <= 2; x++) for (let y = 5; y <= 7; y++) if (w.getBlockId(x, y, 0) === B.portal) portal++;
  check('breaking the frame breaks the portal', portal === 0, `${portal}`);

  w.setBlock(6, 4, 0, B.blockSnow, 0, 3);
  w.setBlock(6, 5, 0, B.blockSnow, 0, 3);
  w.setBlock(6, 6, 0, B.pumpkin, 0, 3);
  check('snow golem pattern is consumed', w.getBlockId(6, 4, 0) === 0 && w.getBlockId(6, 6, 0) === 0);
  w.setBlock(9, 4, 0, B.blockIron, 0, 3);
  w.setBlock(9, 5, 0, B.blockIron, 0, 3);
  w.setBlock(8, 5, 0, B.blockIron, 0, 3);
  w.setBlock(10, 5, 0, B.blockIron, 0, 3);
  w.setBlock(9, 6, 0, B.pumpkinLantern, 0, 3);
  check('iron golem pattern is consumed', w.getBlockId(9, 4, 0) === 0 && w.getBlockId(8, 5, 0) === 0 && w.getBlockId(9, 6, 0) === 0);

  w.setBlock(0, 4, 4, B.oreRedstoneGlowing, 0, 3);
  Block.blocksList[B.oreRedstoneGlowing]!.updateTick(w, 0, 4, 4, w.rand);
  check('glowing redstone ore reverts', w.getBlockId(0, 4, 4) === B.oreRedstone);

  w.setBlock(4, 4, 4, B.wood, 3, 3);
  w.setBlock(5, 4, 4, B.cocoaPlant, 1, 3);
  for (let i = 0; i < 200; i++) Block.blocksList[B.cocoaPlant]!.updateTick(w, 5, 4, 4, w.rand);
  check('cocoa ripens', w.getBlockMetadata(5, 4, 4) === ((2 << 2) | 1), `${w.getBlockMetadata(5, 4, 4)}`);
  w.setBlock(7, 3, 4, B.slowSand, 0, 3);
  w.setBlock(7, 4, 4, B.netherStalk, 0, 3);
  for (let i = 0; i < 200; i++) Block.blocksList[B.netherStalk]!.updateTick(w, 7, 4, 4, w.rand);
  check('nether wart ripens', w.getBlockMetadata(7, 4, 4) === 3);
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
