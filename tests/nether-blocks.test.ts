/**
 * Block behaviour that changes in the Nether (WorldProvider.isHellWorld / hasNoSky, or the Hell
 * biome): lava flows 7 blocks and faster, water poured from a bucket fizzes away, ice melts to
 * nothing, nether wart only stays on soul sand. (Exploding beds are the dimensions slice's.)
 *
 *   node scripts/run-node-test.mjs tests/nether-blocks.test.ts
 */
import { Block } from '../src/block/Block';
import { BlockIds as B, ItemIds as I } from '../src/block/BlockIds';
import '../src/entity/Entities';
import { EntityPlayer } from '../src/entity/EntityPlayer';
import { Item } from '../src/item/Item';
import { ItemStack } from '../src/item/ItemStack';
import { registerBlockItems } from '../src/item/Items';
import type { World } from '../src/world/World';
import { makeWorld, tick } from './dynamicsWorld';
import { check, report } from './harness';

registerBlockItems();

class TestPlayer extends EntityPlayer {}

/** The Nether's provider flags on a test world (the dimensions slice provides WorldProviderHell). */
function hellify(w: World): World {
  Object.assign(w.provider, { dimensionId: -1, isHellWorld: true, hasNoSky: true });
  return w;
}

// --- lava flows 7 blocks every 10 ticks in the Nether -----------------------------------
{
  const w = hellify(makeWorld(1));
  w.setBlock(0, 4, 0, B.lavaMoving, 0, 3);
  tick(w, 12);
  check('hell lava moves after 10 ticks', w.getBlockId(1, 4, 0) === B.lavaMoving, `${w.getBlockId(1, 4, 0)}`);
  tick(w, 600);
  const m = (x: number) => (w.getBlockId(x, 4, 0) === 0 ? -1 : w.getBlockMetadata(x, 4, 0));
  check('hell lava spreads to 7', m(1) === 1 && m(4) === 4 && m(7) === 7 && m(8) === -1, `${m(1)} ${m(4)} ${m(7)} ${m(8)}`);
}

// --- a water bucket fizzes, a lava bucket pours ------------------------------------------
{
  const w = hellify(makeWorld(1));
  const p = new TestPlayer(w);
  p.setLocationAndAngles(0.5, 5, -2.5, 0, 45);
  w.spawnEntityInWorld(p);
  const bucket = Item.itemsList[I.bucketWater] as Item & { tryPlaceContainedLiquid(w: World, px: number, py: number, pz: number, x: number, y: number, z: number): boolean };
  check('water bucket empties in the Nether', bucket.tryPlaceContainedLiquid(w, 0, 5, 0, 0, 5, 0));
  check('no water placed in the Nether', w.getBlockId(0, 5, 0) === 0, `${w.getBlockId(0, 5, 0)}`);
  const lava = Item.itemsList[I.bucketLava] as typeof bucket;
  lava.tryPlaceContainedLiquid(w, 0, 5, 2, 0, 5, 2);
  check('lava pours in the Nether', w.getBlockId(0, 5, 2) === B.lavaMoving, `${w.getBlockId(0, 5, 2)}`);
}

// --- ice broken in the Nether leaves no water --------------------------------------------
for (const nether of [true, false]) {
  const w = makeWorld(1);
  if (nether) hellify(w);
  const p = new TestPlayer(w);
  // Survival breaking removes the block, then harvests it (PlayerControllerMP).
  w.setBlock(0, 4, 0, B.ice, 0, 3);
  w.setBlockToAir(0, 4, 0);
  Block.blocksList[B.ice]!.harvestBlock(w, p, 0, 4, 0, 0);
  const id = w.getBlockId(0, 4, 0);
  check(`broken ice leaves ${nether ? 'nothing in the Nether' : 'water in the overworld'}`, nether ? id === 0 : id === B.waterMoving, `${id}`);
}

// --- nether wart grows on soul sand only ---------------------------------------------------
{
  const w = hellify(makeWorld(1));
  w.setBlock(0, 4, 0, B.slowSand, 0, 3);
  const wart = Block.blocksList[B.netherStalk]!;
  check('nether wart stays on soul sand', wart.canBlockStay(w, 0, 5, 0));
  check('nether wart does not stay on grass', !wart.canBlockStay(w, 2, 4, 0));
  const seeds = new ItemStack(I.netherStalkSeeds, 1, 0);
  const p = new TestPlayer(w);
  p.inventory.mainInventory[0] = seeds;
  seeds.tryPlaceItemIntoWorld(p, w, 2, 3, 0, 1, 0.5, 1, 0.5);
  check('nether wart seeds plant on soul sand', seeds.tryPlaceItemIntoWorld(p, w, 0, 4, 0, 1, 0.5, 1, 0.5) && w.getBlockId(0, 5, 0) === B.netherStalk, `${w.getBlockId(0, 5, 0)}`);
  check('nether wart seeds need soul sand', w.getBlockId(2, 4, 0) !== B.netherStalk, `${w.getBlockId(2, 4, 0)}`);
}

report();
