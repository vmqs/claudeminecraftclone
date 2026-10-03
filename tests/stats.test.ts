/**
 * Statistics and achievements: the registry (StatList / AchievementList), the stat file (per
 * user, saved and loaded), the achievement parent rule and toast, value formats, and the
 * gameplay hooks against a real World with the local player class.
 * Run: node scripts/run-node-test.mjs tests/stats.test.ts
 */
import '../src/block/Blocks';
import '../src/entity/Entities';
import { BlockIds as B, ItemIds as I } from '../src/block/BlockIds';
import { registerBlockItems } from '../src/item/Items';
import { AchievementList } from '../src/stats/AchievementList';
import { ClientStats } from '../src/stats/ClientStats';
import { formatDecimal, formatInteger, type StatBase } from '../src/stats/StatBase';
import { StatFileWriter, type StatStorage } from '../src/stats/StatFileWriter';
import { AchievementIds as A, StatIds as S } from '../src/stats/StatIds';
import { StatList } from '../src/stats/StatList';
import { EntityPlayerSP } from '../src/client/EntityPlayerSP';
import { PlayerControllerMP } from '../src/client/PlayerControllerMP';
import { DamageSource } from '../src/entity/DamageSource';
import type { Entity } from '../src/entity/Entity';
import { EntityItem } from '../src/entity/EntityItem';
import { EntityList } from '../src/entity/EntityList';
import type { EntityLiving } from '../src/entity/EntityLiving';
import { PlayerSpawning } from '../src/entity/PlayerSpawning';
import { ClickMode, OUTSIDE_WINDOW } from '../src/gui/inventory/Container';
import { ContainerFurnace } from '../src/gui/inventory/ContainerFurnace';
import { ContainerWorkbench } from '../src/gui/inventory/ContainerWorkbench';
import { ItemStack } from '../src/item/ItemStack';
import { EntityClientPlayerMP } from '../src/net/client/EntityClientPlayerMP';
import { EntityPlayerMP } from '../src/net/server/EntityPlayerMP';
import type { Packet } from '../src/net/protocol/Packets';
import { Chunk } from '../src/world/Chunk';
import { TileEntityFurnace } from '../src/world/tileentity/TileEntityFurnace';
import { World, WorldInfo } from '../src/world/World';
import { check, report } from './harness';

registerBlockItems();

/** An in-memory stat storage (localStorage stand-in). */
function memoryStorage(): StatStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, load: (u) => data.get(u) ?? null, save: (u, d) => void data.set(u, d) };
}

const toasts: string[] = [];
/** Installs a fresh writer (and a toast that records what it shows) as the local player's sink. */
function freshWriter(user = 'Player', storage = memoryStorage()): StatFileWriter {
  const w = new StatFileWriter(user, storage);
  ClientStats.writer = w;
  ClientStats.toast = {
    queueTakenAchievement: (a: { key: string }) => toasts.push(a.key),
    queueAchievementInformation: () => undefined,
  } as never;
  toasts.length = 0;
  return w;
}
const value = (w: StatFileWriter, id: number) => {
  const s = StatList.resolve(id);
  return s ? w.writeStat(s) : -1;
};

// ------------------------------------------------------------------ registry
StatList.init();
check('23 general statistics', StatList.generalStats.length === 23, String(StatList.generalStats.length));
check('general order starts with startGame, ends with fishCaught', StatList.generalStats[0].statId === S.startGame && StatList.generalStats[22].statId === S.fishCaught);
check('27 achievements', AchievementList.achievementList.length === 27);
check('map bounds', AchievementList.minDisplayColumn === -4 && AchievementList.minDisplayRow === -5 && AchievementList.maxDisplayColumn === 8 && AchievementList.maxDisplayRow === 13);
check('openInventory is independent, mineWood is not', AchievementList.openInventory.isIndependent && !AchievementList.mineWood.isIndependent);
check('special achievements', ['onARail', 'flyPig', 'snipeSkeleton', 'ghast', 'theEnd', 'theEnd2', 'overkill'].every((k) => (AchievementList as never as Record<string, { getSpecial(): boolean }>)[k].getSpecial()));
check('walk is independent, damage dealt is not', ClientStats.isIndependent(S.walkOneCm) && !ClientStats.isIndependent(S.damageDealt));
check('mined stone exists', StatList.resolve(S.mineBlock(B.stone)) !== null);
check('grass counts as dirt', StatList.resolve(S.mineBlock(B.grass)) === StatList.resolve(S.mineBlock(B.dirt)));
check('farmland counts as dirt', StatList.resolve(S.mineBlock(B.tilledField)) === StatList.resolve(S.mineBlock(B.dirt)));
check('lit furnace counts as furnace', StatList.resolve(S.mineBlock(B.furnaceBurning)) === StatList.resolve(S.mineBlock(B.furnaceIdle)));
check('red mushroom counts as brown', StatList.resolve(S.mineBlock(B.mushroomRed)) === StatList.resolve(S.mineBlock(B.mushroomBrown)));
check('beds have no mined statistic', StatList.resolve(S.mineBlock(B.bed)) === null);
check('grass not on the Blocks page', !StatList.objectMineStats.some((s) => s.getItemID() === B.grass));
check('dirt on the Blocks page', StatList.objectMineStats.some((s) => s.getItemID() === B.dirt));
check('crafted planks, workbench, iron ingot (smelted)', [B.planks, B.workbench, I.ingotIron].every((id) => StatList.resolve(S.craftItem(id)) !== null));
check('no crafted dirt', StatList.resolve(S.craftItem(B.dirt)) === null);
check('double slab craft stat is the slab one', StatList.resolve(S.craftItem(B.stoneDoubleSlab)) === StatList.resolve(S.craftItem(B.stoneSingleSlab)) && StatList.resolve(S.craftItem(B.stoneSingleSlab)) !== null);
check('depleted only for damageable items', StatList.resolve(S.breakItem(I.pickaxeWood)) !== null && StatList.resolve(S.breakItem(I.bread)) === null);
check('used for every item', StatList.resolve(S.useItem(I.bread)) !== null && StatList.itemStats.every((s) => s.getItemID() >= 256));
check('items page in id order', StatList.itemStats.every((s, i, a) => i === 0 || a[i - 1].getItemID() < s.getItemID()));
check('unknown id', StatList.resolve(123456) === null);

// ------------------------------------------------------------------ formats
const fmt = (id: number, v: number) => (StatList.resolve(id) as StatBase).format(v);
check('integer grouping', formatInteger(1234567) === '1,234,567' && formatInteger(12) === '12');
check('decimal half-even', formatDecimal(0.625) === '0.62' && formatDecimal(0.375) === '0.38' && formatDecimal(1.005) === '1.00' && formatDecimal(12.3456) === '12.35');
check('time seconds', fmt(S.playOneMinute, 100) === '5.0 s', fmt(S.playOneMinute, 100));
check('time fraction of a second', fmt(S.playOneMinute, 3) === '0.15 s', fmt(S.playOneMinute, 3));
check('time minutes', fmt(S.playOneMinute, 1200) === '1.00 m');
check('time hours', fmt(S.playOneMinute, 20 * 3600 * 2) === '2.00 h');
check('distance cm', fmt(S.walkOneCm, 42) === '42 cm');
check('distance m', fmt(S.walkOneCm, 12345) === '123.45 m');
check('distance km', fmt(S.walkOneCm, 123456) === '1.23 km');
check('simple', fmt(S.jump, 1500) === '1,500');

// ------------------------------------------------------------------ writer and achievements
{
  const store = memoryStorage();
  const w = freshWriter('Steve', store);
  ClientStats.addStat(A.mineWood, 1);
  check('mineWood needs openInventory first', !w.hasAchievementUnlocked(AchievementList.mineWood) && toasts.length === 0);
  ClientStats.addStat(A.openInventory, 1);
  check('openInventory unlocks with a toast', w.hasAchievementUnlocked(AchievementList.openInventory) && toasts.join() === 'openInventory');
  ClientStats.addStat(A.mineWood, 1);
  ClientStats.addStat(A.mineWood, 1);
  check('mineWood unlocks once (one toast), counted twice', toasts.join() === 'openInventory,mineWood' && value(w, A.mineWood) === 2);
  check('buildWorkBench can unlock now', w.canUnlockAchievement(AchievementList.buildWorkBench) && !w.canUnlockAchievement(AchievementList.buildPickaxe));
  ClientStats.addStat(S.jump, 3);
  ClientStats.addStat(S.mineBlock(B.grass), 2);
  check('grass mined counts as dirt', value(w, S.mineBlock(B.dirt)) === 2);
  w.syncStats();
  const saved = store.data.get('steve');
  check('saved under the lower-case name', !!saved && JSON.parse(saved)[String(S.jump)] === 3, saved);
  const again = new StatFileWriter('STEVE', store);
  check('loads back', again.hasAchievementUnlocked(AchievementList.mineWood) && again.writeStat(StatList.resolve(S.jump)!) === 3);
  w.setUser('Alex');
  check('another user starts empty', !w.hasAchievementUnlocked(AchievementList.openInventory) && value(w, S.jump) === 0);
  w.setUser('steve');
  check('switching back reloads', value(w, S.jump) === 3);
  store.data.set('bad', '{"999999":5,"x":1,"2010":"no"}');
  const odd = new StatFileWriter('bad', store);
  check('unknown ids kept as placeholders', odd.serialize() === '{"999999":5}', odd.serialize());
  store.data.set('broken', '{not json');
  check('broken file ignored', new StatFileWriter('broken', store).serialize() === '{}');
}

// ------------------------------------------------------------------ gameplay hooks
/** A survival world of 3x3 chunks: bedrock at y 0, stone up to y 3, air above; the local player at (0.5, 4, 0.5). */
function session(gameType = 0) {
  const info = new WorldInfo();
  info.gameType = gameType;
  info.spawnX = 8;
  info.spawnY = 4;
  info.spawnZ = 8;
  const w = new World(info);
  w.mobSpawner = null;
  for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) w.addChunk(new Chunk(w as never, cx, cz));
  for (let x = -16; x < 32; x++) for (let z = -16; z < 32; z++) for (let y = 0; y < 4; y++) w.setBlock(x, y, z, y === 0 ? B.bedrock : B.stone);
  const mc = {
    theWorld: w,
    thePlayer: null as EntityPlayerSP | null,
    playRandomMusicIfReady() {},
    sndManager: { playSound() {} },
    displayGuiScreen() {},
    playSoundFX() {},
    effectRenderer: { addEffect() {} },
    ingameGUI: { getChatGUI: () => ({ printChatMessage() {}, addTranslatedMessage() {} }) },
    gameSettings: { chatVisibility: 0 },
    respawnPlayer() {},
  };
  const p = new EntityPlayerSP(mc as never, w, 'Player');
  mc.thePlayer = p;
  const pc = new PlayerControllerMP(mc as never);
  p.setLocationAndAngles(0.5, 4, 0.5, 0, 0);
  w.spawnEntityInWorld(p);
  pc.setGameType(PlayerSpawning.initializeGameType(p, w.worldInfo));
  pc.setPlayerCapabilities(p);
  p.initialInvulnerability = 0;
  p.onGround = true;
  return { w, p, pc };
}
type Session = ReturnType<typeof session>;
const call = (o: object, m: string, ...args: unknown[]) => (o as Record<string, (...a: unknown[]) => unknown>)[m](...args);

function mine(s: Session, x: number, y: number, z: number): void {
  s.pc.clickBlock(x, y, z, 1);
  for (let t = 0; t < 400 && s.w.getBlockId(x, y, z) !== 0; t++) {
    s.p.onGround = true;
    s.pc.onPlayerDamageBlock(x, y, z, 1);
  }
}

{
  const w = freshWriter();
  const s = session();
  const p = s.p;
  // Movement (addMovementStat) and jumps.
  p.onGround = true;
  p.addMovementStat(1, 0, 0);
  check('walked 100 cm', value(w, S.walkOneCm) === 100);
  p.onGround = false;
  p.addMovementStat(0.2, 0, 0);
  check('20 cm in the air is not flying', value(w, S.flyOneCm) === 0);
  p.addMovementStat(0.3, -1, 0);
  check('30 cm in the air is flown', value(w, S.flyOneCm) === 30);
  p.onGround = true;
  call(p, 'jump');
  check('a jump', value(w, S.jump) === 1);
  call(p, 'fall', 5);
  check('fell 5 blocks: 500 cm fallen, 2 damage taken', value(w, S.fallOneCm) === 500 && value(w, S.damageTaken) === 2, `${value(w, S.fallOneCm)} ${value(w, S.damageTaken)}`);
  call(p, 'fall', 1.5);
  check('short falls do not count', value(w, S.fallOneCm) === 500);
  for (let i = 0; i < 5; i++) p.onUpdate();
  check('play time counts ticks', value(w, S.playOneMinute) === 5, String(value(w, S.playOneMinute)));

  // Mining with a pickaxe: mined stone, pickaxe used.
  p.inventory.mainInventory[0] = new ItemStack(I.pickaxeWood, 1, 0);
  p.inventory.currentItem = 0;
  mine(s, 3, 3, 3);
  check('mined stone', value(w, S.mineBlock(B.stone)) === 1);
  check('wooden pickaxe used', value(w, S.useItem(I.pickaxeWood)) === 1);
  // Placing a block: used.
  p.inventory.mainInventory[1] = new ItemStack(B.cobblestone, 4, 0);
  p.inventory.currentItem = 1;
  p.inventory.mainInventory[1]!.tryPlaceItemIntoWorld(p, s.w, 5, 3, 5, 1, 0.5, 1, 0.5);
  check('cobblestone placed counts as used', value(w, S.useItem(B.cobblestone)) === 1 && s.w.getBlockId(5, 4, 5) === B.cobblestone);

  // The achievement chain: inventory, wood, workbench, pickaxe, furnace, iron.
  ClientStats.addStat(A.openInventory, 1);
  const log = new EntityItem(s.w, p.posX, p.posY, p.posZ, new ItemStack(B.wood, 1, 0));
  log.delayBeforeCanPickup = 0;
  log.onCollideWithPlayer(p);
  check('picking up a log: Getting Wood', w.hasAchievementUnlocked(AchievementList.mineWood));
  const inv = p.inventoryContainer;
  for (let i = 1; i <= 4; i++) inv.putStackInSlot(i, new ItemStack(B.planks, 1, 0));
  inv.onCraftMatrixChanged(inv.getSlot(1).inventory);
  inv.slotClick(0, 0, ClickMode.PICKUP, p);
  check('crafting a workbench: crafted 1 and Benchmarking', value(w, S.craftItem(B.workbench)) === 1 && w.hasAchievementUnlocked(AchievementList.buildWorkBench));
  p.inventory.setItemStack(null);
  const bench = new ContainerWorkbench(p.inventory, s.w, 1, 3, 1);
  const craft = (rows: (number | null)[], count: number) => {
    rows.forEach((id, i) => bench.putStackInSlot(1 + i, id === null ? null : new ItemStack(id, count, 0)));
    bench.onCraftMatrixChanged(bench.getSlot(1).inventory);
    bench.slotClick(0, 0, ClickMode.QUICK_MOVE, p);
  };
  craft([B.planks, B.planks, B.planks, null, I.stick, null, null, I.stick, null], 2);
  check('two pickaxes by shift-click: crafted 2, Time to Mine!', value(w, S.craftItem(I.pickaxeWood)) === 2 && w.hasAchievementUnlocked(AchievementList.buildPickaxe), String(value(w, S.craftItem(I.pickaxeWood))));
  craft([B.cobblestone, B.cobblestone, B.cobblestone, B.cobblestone, null, B.cobblestone, B.cobblestone, B.cobblestone, B.cobblestone], 1);
  check('furnace: Hot Topic', w.hasAchievementUnlocked(AchievementList.buildFurnace));
  craft([null, B.planks, null, null, B.planks, null, null, I.stick, null], 1);
  check('wooden sword: Time to Strike!', w.hasAchievementUnlocked(AchievementList.buildSword));
  const furnace = new TileEntityFurnace();
  const fc = new ContainerFurnace(p.inventory, furnace);
  furnace.setInventorySlotContents(2, new ItemStack(I.ingotIron, 3, 0));
  fc.slotClick(2, 0, ClickMode.QUICK_MOVE, p);
  check('3 smelted iron: crafted 3, Acquire Hardware', value(w, S.craftItem(I.ingotIron)) === 3 && w.hasAchievementUnlocked(AchievementList.acquireIron), String(value(w, S.craftItem(I.ingotIron))));
  check('toasts in order', toasts.join() === 'openInventory,mineWood,buildWorkBench,buildPickaxe,buildFurnace,buildSword,acquireIron', toasts.join());

  // Drops: Q was the integrated server's (not counted in 1.5.2), a window's drop is the client's.
  p.inventory.mainInventory[2] = new ItemStack(B.dirt, 5, 0);
  p.inventory.currentItem = 2;
  p.dropOneItem(false);
  check('Q does not count as Items Dropped', value(w, S.drop) === 0);
  p.inventory.setItemStack(new ItemStack(B.dirt, 2, 0));
  p.inventoryContainer.slotClick(OUTSIDE_WINDOW, 0, ClickMode.PICKUP, p);
  check('dropping out of the window counts', value(w, S.drop) === 1, String(value(w, S.drop)));

  // Combat: a zombie killed with the sword.
  const zombie = EntityList.createEntityByName('Zombie', s.w) as EntityLiving;
  zombie.setLocationAndAngles(2.5, 4, 0.5, 0, 0);
  s.w.spawnEntityInWorld(zombie);
  p.inventory.mainInventory[3] = new ItemStack(I.swordWood, 1, 0);
  p.inventory.currentItem = 3;
  for (let i = 0; i < 20 && zombie.getHealth() > 0; i++) {
    zombie.hurtResistantTime = 0;
    p.attackTargetEntityWithCurrentItem(zombie);
  }
  check('zombie killed: mob kills 1, Monster Hunter', value(w, S.mobKills) === 1 && w.hasAchievementUnlocked(AchievementList.killEnemy), String(value(w, S.mobKills)));
  check('damage dealt counted', value(w, S.damageDealt) >= 20, String(value(w, S.damageDealt)));
  check('the sword was used', value(w, S.useItem(I.swordWood)) > 0);

  // Leather pickup, a pig flown off a cliff, a skeleton sniped from 60 blocks.
  const leather = new EntityItem(s.w, p.posX, p.posY, p.posZ, new ItemStack(I.leather, 1, 0));
  leather.delayBeforeCanPickup = 0;
  leather.onCollideWithPlayer(p);
  check('leather: Cow Tipper', w.hasAchievementUnlocked(AchievementList.killCow));
  const pig = EntityList.createEntityByName('Pig', s.w) as EntityLiving;
  pig.setLocationAndAngles(0.5, 4, 0.5, 0, 0);
  s.w.spawnEntityInWorld(pig);
  p.mountEntity(pig);
  call(pig, 'fall', 6);
  check('a ridden pig falling 6 blocks: When Pigs Fly', w.hasAchievementUnlocked(AchievementList.flyPig));
  p.mountEntity(pig);
  const skel = EntityList.createEntityByName('Skeleton', s.w) as EntityLiving;
  skel.setLocationAndAngles(0.5, 4, 60.5, 0, 0);
  const arrow = EntityList.createEntityByName('Arrow', s.w) as Entity;
  skel.onDeath(DamageSource.causeArrowDamage(arrow, p));
  check('arrow kill from 60 blocks: Sniper Duel', w.hasAchievementUnlocked(AchievementList.snipeSkeleton));
  const near = EntityList.createEntityByName('Skeleton', s.w) as EntityLiving;
  near.setLocationAndAngles(0.5, 4, 20.5, 0, 0);
  toasts.length = 0;
  near.onDeath(DamageSource.causeArrowDamage(arrow, p));
  check('from 20 blocks it does not count', toasts.length === 0 && value(w, A.snipeSkeleton) === 1);

  // Death: counted once, the dropped inventory is not "Items Dropped".
  p.attackEntityFrom(DamageSource.outOfWorld, 100);
  check('death counted', value(w, S.deaths) === 1);
  check('death drops are not Items Dropped', value(w, S.drop) === 1);
}

// Creative: the inventory screen hook is creative-independent; mining in Creative counts nothing.
{
  const w = freshWriter();
  const s = session(1);
  s.p.inventory.mainInventory[0] = new ItemStack(I.pickaxeWood, 1, 0);
  s.pc.clickBlock(2, 3, 2, 1);
  check('creative breaking: nothing mined, tool unused', s.w.getBlockId(2, 3, 2) === 0 && value(w, S.mineBlock(B.stone)) === 0 && value(w, S.useItem(I.pickaxeWood)) === 0);
}

// Multiplayer: the host sends its counts for a guest (Packet200), the guest counts its own movement.
{
  const w = freshWriter();
  const s = session();
  const sent: Packet[] = [];
  const mp = new EntityPlayerMP(s.w, 'Guest', { sendChatMsg() {}, commandsAllowedForAll: true, sendToTracking() {} });
  mp.handler = { sendPacket: (pk: Packet) => sent.push(pk) } as never;
  mp.addStat(S.mineBlock(B.grass), 1);
  mp.addStat(S.walkOneCm, 50);
  mp.addStat(S.damageTaken, 250);
  mp.addStat(A.mineWood, 1);
  const stats = sent.filter((pk) => pk.type === 'Statistic') as Extract<Packet, { type: 'Statistic' }>[];
  check('host sends mined (as dirt), damage in 100s, the achievement; not walking', stats.map((pk) => `${pk.statisticId}:${pk.amount}`).join() === `${S.mineBlock(B.dirt)}:1,${S.damageTaken}:100,${S.damageTaken}:100,${S.damageTaken}:50,${A.mineWood}:1`, stats.map((pk) => `${pk.statisticId}:${pk.amount}`).join());
  const guest = new EntityClientPlayerMP({} as never, s.w, 'Guest', { addToSendQueue() {} });
  guest.addStat(S.walkOneCm, 40);
  guest.addStat(S.damageDealt, 7);
  check('guest counts its own walking, not the host-side damage', value(w, S.walkOneCm) === 40 && value(w, S.damageDealt) === 0);
  for (const pk of stats) guest.incrementStat(pk.statisticId, pk.amount);
  guest.incrementStat(S.walkOneCm, 99);
  check('packets add up on the guest', value(w, S.damageTaken) === 250 && value(w, S.mineBlock(B.dirt)) === 1 && value(w, S.walkOneCm) === 40);
  check('the achievement still needs its parent on the guest', !w.hasAchievementUnlocked(AchievementList.mineWood));
}

report();
