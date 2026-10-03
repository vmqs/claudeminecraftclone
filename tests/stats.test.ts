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

report();
