import { BlockIds, ItemIds } from '../block/BlockIds';
import { Achievement } from './StatBase';
import { AchievementIds } from './StatIds';

const all: Achievement[] = [];
const bounds = { minDisplayColumn: 0, minDisplayRow: 0, maxDisplayColumn: 0, maxDisplayRow: 0 };

/** new Achievement(...).registerAchievement(): also widens the map's bounds. */
function add(key: keyof typeof AchievementIds, column: number, row: number, icon: number, parent: Achievement | null): Achievement {
  const a = new Achievement(AchievementIds[key], key, column, row, icon, parent);
  bounds.minDisplayColumn = Math.min(bounds.minDisplayColumn, column);
  bounds.minDisplayRow = Math.min(bounds.minDisplayRow, row);
  bounds.maxDisplayColumn = Math.max(bounds.maxDisplayColumn, column);
  bounds.maxDisplayRow = Math.max(bounds.maxDisplayRow, row);
  all.push(a);
  return a;
}

const openInventory = add('openInventory', 0, 0, ItemIds.book, null).setIndependent();
const mineWood = add('mineWood', 2, 1, BlockIds.wood, openInventory);
const buildWorkBench = add('buildWorkBench', 4, -1, BlockIds.workbench, mineWood);
const buildPickaxe = add('buildPickaxe', 4, 2, ItemIds.pickaxeWood, buildWorkBench);
const buildFurnace = add('buildFurnace', 3, 4, BlockIds.furnaceIdle, buildPickaxe);
const acquireIron = add('acquireIron', 1, 4, ItemIds.ingotIron, buildFurnace);
const buildHoe = add('buildHoe', 2, -3, ItemIds.hoeWood, buildWorkBench);
const makeBread = add('makeBread', -1, -3, ItemIds.bread, buildHoe);
const bakeCake = add('bakeCake', 0, -5, ItemIds.cake, buildHoe);
const buildBetterPickaxe = add('buildBetterPickaxe', 6, 2, ItemIds.pickaxeStone, buildPickaxe);
const cookFish = add('cookFish', 2, 6, ItemIds.fishCooked, buildFurnace);
const onARail = add('onARail', 2, 3, BlockIds.rail, acquireIron).setSpecial();
const buildSword = add('buildSword', 6, -1, ItemIds.swordWood, buildWorkBench);
const killEnemy = add('killEnemy', 8, -1, ItemIds.bone, buildSword);
const killCow = add('killCow', 7, -3, ItemIds.leather, buildSword);
const flyPig = add('flyPig', 8, -4, ItemIds.saddle, killCow).setSpecial();
const snipeSkeleton = add('snipeSkeleton', 7, 0, ItemIds.bow, killEnemy).setSpecial();
const diamonds = add('diamonds', -1, 5, ItemIds.diamond, acquireIron);
const portal = add('portal', -1, 7, BlockIds.obsidian, diamonds);
const ghast = add('ghast', -4, 8, ItemIds.ghastTear, portal).setSpecial();
const blazeRod = add('blazeRod', 0, 9, ItemIds.blazeRod, portal);
const potion = add('potion', 2, 8, ItemIds.potion, blazeRod);
const theEnd = add('theEnd', 3, 10, ItemIds.eyeOfEnder, blazeRod).setSpecial();
const theEnd2 = add('theEnd2', 4, 13, BlockIds.dragonEgg, theEnd).setSpecial();
const enchantments = add('enchantments', -4, 4, BlockIds.enchantmentTable, diamonds);
const overkill = add('overkill', -4, 1, ItemIds.swordDiamond, enchantments).setSpecial();
const bookcase = add('bookcase', -3, 6, BlockIds.bookShelf, enchantments);

/**
 * AchievementList: the 27 achievements of 1.5.2 with their map positions, icons and parents
 * (an achievement unlocks only once its parent has), in registration order, and the map's
 * bounds in columns and rows.
 */
export const AchievementList = {
  achievementList: all as readonly Achievement[],
  get minDisplayColumn() {
    return bounds.minDisplayColumn;
  },
  get minDisplayRow() {
    return bounds.minDisplayRow;
  },
  get maxDisplayColumn() {
    return bounds.maxDisplayColumn;
  },
  get maxDisplayRow() {
    return bounds.maxDisplayRow;
  },
  openInventory,
  mineWood,
  buildWorkBench,
  buildPickaxe,
  buildFurnace,
  acquireIron,
  buildHoe,
  makeBread,
  bakeCake,
  buildBetterPickaxe,
  cookFish,
  onARail,
  buildSword,
  killEnemy,
  killCow,
  flyPig,
  snipeSkeleton,
  diamonds,
  portal,
  ghast,
  blazeRod,
  potion,
  theEnd,
  theEnd2,
  enchantments,
  overkill,
  bookcase,
};
