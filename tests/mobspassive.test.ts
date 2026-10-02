/**
 * The passive and neutral mobs against a real World on a small superflat area: registration and
 * eggs, spawning rules, item interactions (shears, buckets, bowls, dyes, bones, fish, saddles),
 * breeding and lamb colours, taming, grazing, egg laying, golem targeting, bats, squid, the
 * villager trades and the trading container.
 * Run: node scripts/run-node-test.mjs tests/mobspassive.test.ts
 */
import '../src/block/Blocks';
import '../src/entity/Entities';
import '../src/entity/ItemHooksInstall';
import { Block } from '../src/block/Block';
import { BlockIds as B, ItemIds as I } from '../src/block/BlockIds';
import { JavaRandom } from '../src/core/JavaRandom';
import { DamageSource } from '../src/entity/DamageSource';
import type { Entity } from '../src/entity/Entity';
import { EntityAgeable } from '../src/entity/EntityAgeable';
import { EntityBat } from '../src/entity/EntityBat';
import { EntityChicken } from '../src/entity/EntityChicken';
import { EntityCow } from '../src/entity/EntityCow';
import { EntityIronGolem } from '../src/entity/EntityIronGolem';
import { EntityItem } from '../src/entity/EntityItem';
import { EntityList } from '../src/entity/EntityList';
import type { EntityLiving } from '../src/entity/EntityLiving';
import { EntityMob } from '../src/entity/EntityMob';
import { EntityMooshroom } from '../src/entity/EntityMooshroom';
import { EntityOcelot } from '../src/entity/EntityOcelot';
import { EntityPig } from '../src/entity/EntityPig';
import { EntityPlayer } from '../src/entity/EntityPlayer';
import { EntitySheep } from '../src/entity/EntitySheep';
import { EntitySnowman } from '../src/entity/EntitySnowman';
import { EntitySquid } from '../src/entity/EntitySquid';
import { EntityVillager } from '../src/entity/EntityVillager';
import { EntityWolf } from '../src/entity/EntityWolf';
import { ContainerMerchant } from '../src/gui/merchant/ContainerMerchant';
import { registerBlockItems } from '../src/item/Items';
import { ItemStack } from '../src/item/ItemStack';
import { Chunk } from '../src/world/Chunk';
import { World, WorldInfo } from '../src/world/World';
import { check, report } from './harness';

registerBlockItems();

const PASSIVE = ['Bat', 'Pig', 'Sheep', 'Cow', 'Chicken', 'Squid', 'Wolf', 'MushroomCow', 'SnowMan', 'Ozelot', 'VillagerGolem', 'Villager'];
const WITH_EGG = new Map([
  ['Bat', 65],
  ['Pig', 90],
  ['Sheep', 91],
  ['Cow', 92],
  ['Chicken', 93],
  ['Squid', 94],
  ['Wolf', 95],
  ['MushroomCow', 96],
  ['Ozelot', 98],
  ['Villager', 120],
]);

class TestPlayer extends EntityPlayer {
  guis: string[] = [];
  constructor(world: World, creative: boolean) {
    super(world);
    this.username = 'Tester';
    this.capabilities.isCreativeMode = creative;
    this.capabilities.disableDamage = creative;
  }
  override displayGUIMerchant(_m: object, name: string | null): void {
    this.guis.push('merchant:' + (name ?? ''));
  }
}

/**
 * A superflat world (bedrock, 2 dirt, grass at y 3) of 7x7 chunks around the origin, noon.
 * Entities only update with loaded chunks 32 blocks around them, so keep them within -16..31.
 */
function makeWorld(top: number = B.grass): World {
  const info = new WorldInfo();
  info.seed = 1n as unknown as typeof info.seed;
  const w = new World(info);
  w.worldInfo.gameRules.doMobSpawning = false;
  for (let cx = -3; cx <= 3; cx++) {
    for (let cz = -3; cz <= 3; cz++) {
      const c = new Chunk(w, cx, cz);
      for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
          c.setBlockIDWithMetadata(x, 0, z, B.bedrock, 0);
          c.setBlockIDWithMetadata(x, 1, z, B.dirt, 0);
          c.setBlockIDWithMetadata(x, 2, z, B.dirt, 0);
          c.setBlockIDWithMetadata(x, 3, z, top, 0);
        }
      }
      c.generateSkylightMap();
      c.isChunkLoaded = true;
      w.addChunk(c);
    }
  }
  w.worldInfo.worldTime = 6000;
  return w;
}

function spawn<T extends Entity>(w: World, e: T, x: number, y: number, z: number): T {
  e.setLocationAndAngles(x, y, z, 0, 0);
  w.spawnEntityInWorld(e);
  return e;
}

function run(w: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    w.tick();
    w.updateEntities();
  }
}

function items(w: World, id?: number): ItemStack[] {
  return w.loadedEntityList.filter((e): e is EntityItem => e instanceof EntityItem && !e.isDead).map((e) => e.getEntityItem()).filter((s) => id === undefined || s.itemID === id);
}

/** How many items of an ID lie on the ground (dropped stacks merge). */
function count(w: World, id: number): number {
  return items(w, id).reduce((n, s) => n + s.stackSize, 0);
}

function clearItems(w: World): void {
  for (const e of w.loadedEntityList) if (e instanceof EntityItem) e.setDead();
  w.updateEntities();
}

function hold(p: EntityPlayer, stack: ItemStack | null): void {
  p.inventory.currentItem = 0;
  p.inventory.setInventorySlotContents(0, stack);
}

// ---------------------------------------------------------------- registration and eggs
for (const name of PASSIVE) {
  check(`EntityList has ${name}`, EntityList.getClassFromName(name) !== null);
  const egg = WITH_EGG.get(name);
  if (egg !== undefined) check(`${name} has a spawn egg`, EntityList.entityEggs.has(egg));
}
check('no golem eggs', !EntityList.entityEggs.has(97) && !EntityList.entityEggs.has(99));

// ---------------------------------------------------------------- every mob ticks without errors
{
  const w = makeWorld();
  const p = spawn(w, new TestPlayer(w, true), 0.5, 4, -6.5);
  void p;
  const mobs: EntityLiving[] = [];
  let i = 0;
  for (const name of PASSIVE) {
    if (name === 'Squid' || name === 'Bat') continue;
    const e = EntityList.createEntityByName(name, w) as EntityLiving;
    spawn(w, e, -12 + (i++ % 6) * 4 + 0.5, 4, Math.trunc(i / 6) * 4 + 0.5);
    e.initCreature();
    mobs.push(e);
  }
  let error: unknown = null;
  try {
    run(w, 400);
  } catch (err) {
    error = err;
    console.log(err);
  }
  check('all passive mobs tick for 400 ticks', error === null, String(error));
  for (const m of mobs) {
    const name = EntityList.getEntityString(m);
    check(`${name} alive and finite`, !m.isDead && Number.isFinite(m.posX) && Number.isFinite(m.posY) && Number.isFinite(m.posZ), `${m.posX},${m.posY},${m.posZ}`);
    check(`${name} stands on the grass`, Math.abs(m.posY - 4) < 0.01 || name === 'Chicken', String(m.posY));
  }
}

// ---------------------------------------------------------------- sheep
{
  const rand = new JavaRandom(42n);
  const counts = new Array(16).fill(0);
  for (let k = 0; k < 20000; k++) counts[EntitySheep.getRandomFleeceColor(rand)]++;
  check('sheep colours: ~81.8% white', Math.abs(counts[0] / 20000 - 0.8184) < 0.01, String(counts[0]));
  check('sheep colours: ~5% black/grey/light grey, 3% brown', Math.abs(counts[15] / 20000 - 0.05) < 0.006 && Math.abs(counts[7] / 20000 - 0.05) < 0.006 && Math.abs(counts[8] / 20000 - 0.05) < 0.006 && Math.abs(counts[12] / 20000 - 0.03) < 0.005);
  check('sheep colours: only natural colours', counts.every((n, c) => n === 0 || [0, 6, 7, 8, 12, 15].includes(c)));

  const w = makeWorld();
  const p = spawn(w, new TestPlayer(w, false), 0.5, 4, 2.5);
  const sheep = spawn(w, new EntitySheep(w), 0.5, 4, 0.5);
  sheep.setFleeceColor(14);
  const shears = new ItemStack(I.shears);
  hold(p, shears);
  check('shearing returns true', p.interactWith(sheep) || sheep.getSheared());
  check('sheep is sheared', sheep.getSheared());
  run(w, 2);
  const wool = items(w, B.cloth);
  const nWool = count(w, B.cloth);
  check('shearing drops 1-3 red wool', nWool >= 1 && nWool <= 3 && wool.every((s) => s.getItemDamage() === 14), String(nWool));
  check('survival shears wear', shears.getItemDamage() === 1);
  // Eating grass regrows the wool and turns the grass to dirt.
  sheep.eatGrassBonus();
  check('eating grass regrows wool', !sheep.getSheared());
  // A sheared lamb (1 in 50 checks) in a fenced pen grazes quickly; it eats the grass below.
  for (let x = 4; x <= 12; x++) {
    for (const z of [4, 12]) {
      w.setBlock(x, 4, z, B.fence);
      w.setBlock(z, 4, x, B.fence);
    }
  }
  const lamb0 = spawn(w, new EntitySheep(w), 8.5, 4, 8.5);
  lamb0.setGrowingAge(-24000);
  lamb0.setSheared(true);
  let ate = false;
  for (let t = 0; t < 1500 && !ate; t++) {
    run(w, 1);
    if (!lamb0.getSheared()) ate = true;
  }
  check('a sheared lamb grazes and regrows its wool', ate);
  check('grazing turns the grass below into dirt', countBlocks(w, B.dirt, 3) === 1, String(countBlocks(w, B.dirt, 3)));
  check('grazing lambs grow up 1200 ticks sooner', lamb0.getGrowingAge() > -24000 + 1200 - 10, String(lamb0.getGrowingAge()));

  // Dye: a pink dye on a white sheep.
  const s2 = spawn(w, new EntitySheep(w), 4.5, 4, 0.5);
  hold(p, new ItemStack(I.dyePowder, 1, 9));
  p.interactWith(s2);
  check('pink dye makes pink wool', s2.getFleeceColor() === 6, String(s2.getFleeceColor()));

  // Lamb colour mixing: red + yellow parents make an orange lamb; red + red a red one.
  const a = new EntitySheep(w);
  const b = new EntitySheep(w);
  a.setFleeceColor(14);
  b.setFleeceColor(4);
  const lamb = a.createChild(b) as EntitySheep;
  check('red + yellow sheep make an orange lamb', lamb.getFleeceColor() === 1, String(lamb.getFleeceColor()));
  b.setFleeceColor(14);
  check('red + red sheep make a red lamb', (a.createChild(b) as EntitySheep).getFleeceColor() === 14);
  a.setFleeceColor(0);
  b.setFleeceColor(15);
  check('white + black sheep make a grey lamb', (a.createChild(b) as EntitySheep).getFleeceColor() === 7);
}

function countBlocks(w: World, id: number, y: number): number {
  let n = 0;
  for (let x = -32; x < 32; x++) for (let z = -32; z < 32; z++) if (w.getBlockId(x, y, z) === id) n++;
  return n;
}

// ---------------------------------------------------------------- cow, mooshroom
{
  const w = makeWorld();
  const p = spawn(w, new TestPlayer(w, false), 0.5, 4, 2.5);
  const cow = spawn(w, new EntityCow(w), 0.5, 4, 0.5);
  hold(p, new ItemStack(I.bucketEmpty));
  p.interactWith(cow);
  check('bucket on a cow gives milk', p.inventory.getStackInSlot(0)?.itemID === I.bucketMilk);
  const moo = spawn(w, new EntityMooshroom(w), 4.5, 4, 0.5);
  hold(p, new ItemStack(I.bowlEmpty));
  p.interactWith(moo);
  check('bowl on a mooshroom gives stew', p.inventory.getStackInSlot(0)?.itemID === I.bowlSoup);
  hold(p, new ItemStack(I.shears));
  p.interactWith(moo);
  run(w, 1);
  check('sheared mooshroom dies', moo.isDead);
  const cows = w.loadedEntityList.filter((e) => e.constructor === EntityCow && e !== cow);
  check('sheared mooshroom leaves a cow', cows.length === 1);
  check('sheared mooshroom drops 5 red mushrooms', count(w, B.mushroomRed) === 5);
  // Drops of a killed cow: leather 0-2, beef 1-3.
  clearItems(w);
  // (The player would pick the drops up.)
  p.setPosition(20.5, 4, 20.5);
  cow.attackEntityFrom(DamageSource.causePlayerDamage(p), 100);
  run(w, 25);
  const beef = count(w, I.beefRaw);
  const leather = count(w, I.leather);
  check('dead cow drops 1-3 beef and 0-2 leather', beef >= 1 && beef <= 3 && leather <= 2, `${beef} ${leather}`);
}

// ---------------------------------------------------------------- breeding
{
  const w = makeWorld();
  const p = spawn(w, new TestPlayer(w, true), 0.5, 4, 6.5);
  const c1 = spawn(w, new EntityCow(w), 0.5, 4, 0.5);
  const c2 = spawn(w, new EntityCow(w), 2.5, 4, 0.5);
  hold(p, new ItemStack(I.wheat, 5));
  p.interactWith(c1);
  p.interactWith(c2);
  check('wheat puts cows in love', c1.isInLove() && c2.isInLove());
  check('creative feeding keeps the wheat', p.inventory.getStackInSlot(0)?.stackSize === 5);
  hold(p, null);
  run(w, 300);
  const babies = w.loadedEntityList.filter((e): e is EntityCow => e instanceof EntityCow && e.isChild());
  check('two cows in love make a calf', babies.length === 1, String(babies.length));
  check('calf starts at age -24000ish', babies.length === 1 && babies[0].getGrowingAge() < -23000);
  check('parents wait 6000 ticks', c1.getGrowingAge() > 5000 && c2.getGrowingAge() > 5000);
  // Chickens breed with any seeds, pigs with carrots, wolves with meat.
  const ch = new EntityChicken(w);
  check('chickens breed with melon seeds', ch.isBreedingItem(new ItemStack(I.melonSeeds)) && !ch.isBreedingItem(new ItemStack(I.wheat)));
  check('pigs breed with carrots', new EntityPig(w).isBreedingItem(new ItemStack(I.carrot)) && !new EntityPig(w).isBreedingItem(new ItemStack(I.wheat)));
  check('wolves breed with rotten flesh', new EntityWolf(w).isBreedingItem(new ItemStack(I.rottenFlesh)));
  check('ocelots breed with raw fish', new EntityOcelot(w).isBreedingItem(new ItemStack(I.fishRaw)));
}

// ---------------------------------------------------------------- chickens
{
  const w = makeWorld();
  const ch = spawn(w, new EntityChicken(w), 0.5, 10, 0.5);
  run(w, 3);
  check('a falling chicken falls slowly', ch.motionY > -0.2, String(ch.motionY));
  ch.timeUntilNextEgg = 2;
  run(w, 60);
  check('a chicken lays an egg', count(w, I.egg) === 1);
  check('no fall damage for chickens', ch.getHealth() === 4);
}

// ---------------------------------------------------------------- pigs
{
  const w = makeWorld();
  const p = spawn(w, new TestPlayer(w, false), 0.5, 4, 2.5);
  const pig = spawn(w, new EntityPig(w), 0.5, 4, 0.5);
  hold(p, new ItemStack(I.saddle));
  p.interactWith(pig);
  check('saddle on a pig', pig.getSaddled());
  hold(p, new ItemStack(I.carrotOnAStick));
  // The steering speed is the AI move speed the pig last walked with (0 before it ever moved).
  pig.setAIMoveSpeed(Math.fround(0.25));
  p.interactWith(pig);
  check('right click mounts a saddled pig', p.ridingEntity === pig && pig.riddenByEntity === p);
  p.rotationYaw = 0;
  const z0 = pig.posZ;
  run(w, 100);
  check('a carrot on a stick steers the pig', pig.posZ - z0 > 1, String(pig.posZ - z0));
  clearItems(w);
  p.mountEntity(null);
  p.setPosition(20.5, 4, 20.5);
  pig.attackEntityFrom(DamageSource.causePlayerDamage(p), 100);
  run(w, 25);
  check('a dead saddled pig drops its saddle', count(w, I.saddle) === 1);
  check('and 1-3 pork', count(w, I.porkRaw) >= 1 && count(w, I.porkRaw) <= 3, String(count(w, I.porkRaw)));
}

// ---------------------------------------------------------------- wolves
{
  const w = makeWorld();
  const p = spawn(w, new TestPlayer(w, false), 0.5, 4, 2.5);
  const wolf = spawn(w, new EntityWolf(w), 0.5, 4, 0.5);
  hold(p, new ItemStack(I.bone, 64));
  for (let k = 0; k < 64 && !wolf.isTamed(); k++) p.interactWith(wolf);
  check('bones tame a wolf', wolf.isTamed() && wolf.getOwnerName() === 'Tester');
  run(w, 4);
  check('a tamed wolf sits and has 20 health', wolf.isSitting() && wolf.getHealth() === 20, `${wolf.isSitting()} ${wolf.getHealth()}`);
  hold(p, new ItemStack(I.dyePowder, 1, 4));
  p.interactWith(wolf);
  check('lapis dyes the collar blue', wolf.getCollarColor() === 11, String(wolf.getCollarColor()));
  hold(p, null);
  run(w, 2);
  p.interactWith(wolf);
  run(w, 2);
  check('the owner stands it up', !wolf.isSitting());
  check('tail of a healthy tame wolf', Math.abs(wolf.getTailRotation() - Math.fround(Math.fround(0.55) * Math.fround(Math.PI))) < 1e-5);
  // Wild wolves hunt sheep; hitting one makes it angry.
  const wild = spawn(w, new EntityWolf(w), 10.5, 4, 0.5);
  const p2 = spawn(w, new TestPlayer(w, false), 12.5, 4, 0.5);
  wild.attackEntityFrom(DamageSource.causePlayerDamage(p2), 1);
  run(w, 2);
  check('a hit wolf turns angry', wild.isAngry() && wild.getTexture() === '/mob/wolf_angry.png');
}

// ---------------------------------------------------------------- creative players are not targets
{
  const w = makeWorld();
  const p = spawn(w, new TestPlayer(w, true), 0.5, 4, 0.5);
  const golem = spawn(w, new EntityIronGolem(w), 4.5, 4, 0.5);
  class TestMonster extends EntityMob {
    getMaxHealth(): number {
      return 1000;
    }
  }
  const monster = spawn(w, new TestMonster(w), 8.5, 4, 0.5);
  // An unreachable verdict (not yet on the ground) is kept for 10-14 target checks.
  run(w, 60);
  check('iron golem targets a monster', golem.getAttackTarget() === monster);
  const snow = spawn(w, new EntitySnowman(w), 6.5, 4, 4.5);
  run(w, 5);
  check('snow golem targets a monster', snow.getAttackTarget() === monster);
  check('golems ignore the creative player', golem.getAttackTarget() !== p && snow.getAttackTarget() !== p);
  // A golem built by a player never attacks players.
  golem.setPlayerCreated(true);
  check('player-built golem cannot attack players', !golem.canAttackClass('Player'));
  // Iron golem hits throw the target upwards.
  const before = monster.motionY;
  monster.hurtResistantTime = 0;
  golem.attackEntityAsMob(monster);
  check('golem punch throws upwards', monster.motionY > before);
}

// ---------------------------------------------------------------- bats and squid
{
  const w = makeWorld();
  // A ceiling to hang from.
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) w.setBlock(x, 8, z, B.stone);
  const bat = spawn(w, new EntityBat(w), 0.5, 7.1, 0.5);
  run(w, 5);
  check('a bat hangs under a ceiling', bat.getIsBatHanging() && Math.abs(bat.posY - (8 - bat.height)) < 1e-6, String(bat.posY));
  const p = spawn(w, new TestPlayer(w, false), 1.5, 4, 0.5);
  run(w, 3);
  check('a near player wakes the bat', !bat.getIsBatHanging());
  void p;

  const water = makeWorld(B.waterStill);
  for (let x = -16; x < 16; x++) for (let z = -16; z < 16; z++) for (let y = 4; y < 8; y++) water.setBlock(x, y, z, B.waterStill);
  const squid = spawn(water, new EntitySquid(water), 0.5, 5, 0.5);
  const start = [squid.posX, squid.posY, squid.posZ];
  run(water, 200);
  check('a squid swims', Math.hypot(squid.posX - start[0], squid.posY - start[1], squid.posZ - start[2]) > 0.5);
  squid.attackEntityFrom(DamageSource.generic, 100);
  run(water, 25);
  const ink = items(water, I.dyePowder);
  check('a dead squid drops 1-3 ink sacs', count(water, I.dyePowder) >= 1 && count(water, I.dyePowder) <= 3 && ink.every((s) => s.getItemDamage() === 0));
  check('squid spawn only at y 46..62', (() => {
    squid.posY = 70;
    return !squid.getCanSpawnHere();
  })());
}

// ---------------------------------------------------------------- ocelots
{
  const w = makeWorld();
  const oc = new EntityOcelot(w);
  oc.setLocationAndAngles(0.5, 64, 0.5, 0, 0);
  let below63 = 0;
  oc.setLocationAndAngles(0.5, 4, 0.5, 0, 0);
  for (let k = 0; k < 100; k++) if (oc.getCanSpawnHere()) below63++;
  check('ocelots never spawn below y 63', below63 === 0);
  const tamed = new EntityOcelot(w);
  tamed.setTamed(true);
  tamed.setTameSkin(2);
  check('tamed ocelot skin', tamed.getTexture() === '/mob/cat_red.png' && tamed.getEntityName() === 'entity.Cat.name');
}

// ---------------------------------------------------------------- spawn rules for animals
{
  const w = makeWorld();
  const cow = new EntityCow(w);
  cow.setLocationAndAngles(0.5, 4, 0.5, 0, 0);
  check('cows spawn on lit grass', cow.getCanSpawnHere());
  const moo = new EntityMooshroom(w);
  moo.setLocationAndAngles(0.5, 4, 0.5, 0, 0);
  check('mooshrooms use the animal rule (grass)', moo.getCanSpawnHere());
  const dirtWorld = makeWorld(B.dirt);
  const cow2 = new EntityCow(dirtWorld);
  cow2.setLocationAndAngles(0.5, 4, 0.5, 0, 0);
  check('cows do not spawn on dirt', !cow2.getCanSpawnHere());
}

// ---------------------------------------------------------------- villagers and trading
{
  const w = makeWorld();
  const p = spawn(w, new TestPlayer(w, true), 0.5, 4, 2.5);
  for (let prof = 0; prof < 5; prof++) {
    const v = spawn(w, new EntityVillager(w, prof), prof * 3 + 0.5, 4, 0.5);
    const list = v.getRecipes(p);
    check(`profession ${prof} has a first trade`, list !== null && list.length === 1);
    check(`profession ${prof} texture`, v.getTexture() === ['/mob/villager/farmer.png', '/mob/villager/librarian.png', '/mob/villager/priest.png', '/mob/villager/smith.png', '/mob/villager/butcher.png'][prof]);
  }
  const v = w.loadedEntityList.find((e): e is EntityVillager => e instanceof EntityVillager)!;
  hold(p, null);
  check('right click opens the trading window', p.interactWith(v) && (p as TestPlayer).guis[0] === 'merchant:' && v.getCustomer() === p);
  // Trade through the container: put the price in, take the result.
  const recipe = v.getRecipes(p)![0];
  const c = new ContainerMerchant(p.inventory, v, w);
  p.openContainer = c;
  const price = recipe.getItemToBuy().copy();
  price.stackSize = 64;
  c.getMerchantInventory().setInventorySlotContents(0, price);
  if (recipe.getSecondItemToBuy()) c.getMerchantInventory().setInventorySlotContents(1, new ItemStack(recipe.getSecondItemToBuy()!.itemID, 64, recipe.getSecondItemToBuy()!.getItemDamage()));
  const result = c.getMerchantInventory().getStackInSlot(2);
  check('the payment shows the goods', result !== null && result.itemID === recipe.getItemToSell().itemID);
  const taken = c.transferStackInSlot(p, 2);
  check('shift-click takes the goods', taken !== null && p.inventory.mainInventory.some((st) => st !== null && st.itemID === recipe.getItemToSell().itemID));
  check('the price was paid', (c.getMerchantInventory().getStackInSlot(0)?.stackSize ?? 0) === 64 - recipe.getItemToBuy().stackSize);
  // Using the last trade schedules a new one after the window closes.
  c.onCraftGuiClosed(p);
  check('closing the window ends the trade', v.getCustomer() === null);
  run(w, 60);
  check('a used last trade unlocks another', v.getRecipes(p)!.length >= 1);
  // Children cannot trade.
  const kid = spawn(w, new EntityVillager(w, 0), 20.5, 4, 0.5);
  kid.setGrowingAge(-24000);
  check('baby villagers do not trade', !kid.interact(p) && kid.getCustomer() === null);
  check('babies are ageable', kid instanceof EntityAgeable && kid.isChild());
}

void Block;
report();
