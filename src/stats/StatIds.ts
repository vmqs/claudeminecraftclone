/**
 * The numeric ids of 1.5.2's statistics and achievements (StatBase.statId), which gameplay
 * code passes to `EntityPlayer.addStat(id, amount)` / `triggerAchievement(id)`. This module has
 * no imports, so block and item code that the workers also load can name a statistic without
 * pulling in the statistics registry (`StatList`), which resolves ids on the main thread.
 *
 * The ids are the original ones (the stats file and Packet200Statistic carry them): general
 * statistics 1000-2025, achievements 5242880 + n, and the per-block / per-item families as a
 * base plus the block or item id.
 */
export const StatIds = {
  startGame: 1000,
  createWorld: 1001,
  loadWorld: 1002,
  joinMultiplayer: 1003,
  leaveGame: 1004,
  playOneMinute: 1100,
  walkOneCm: 2000,
  swimOneCm: 2001,
  fallOneCm: 2002,
  climbOneCm: 2003,
  flyOneCm: 2004,
  diveOneCm: 2005,
  minecartOneCm: 2006,
  boatOneCm: 2007,
  pigOneCm: 2008,
  jump: 2010,
  drop: 2011,
  damageDealt: 2020,
  damageTaken: 2021,
  deaths: 2022,
  mobKills: 2023,
  playerKills: 2024,
  fishCaught: 2025,

  MINE_BLOCK_BASE: 16777216,
  CRAFT_ITEM_BASE: 16842752,
  USE_ITEM_BASE: 16908288,
  BREAK_ITEM_BASE: 16973824,
  ACHIEVEMENT_BASE: 5242880,

  /** "<block> Mined" (StatList.mineBlockStatArray). */
  mineBlock(blockID: number): number {
    return 16777216 + blockID;
  },
  /** "<item> Crafted" (StatList.objectCraftStats; also smelting). */
  craftItem(itemID: number): number {
    return 16842752 + itemID;
  },
  /** "<item> Used" (StatList.objectUseStats). */
  useItem(itemID: number): number {
    return 16908288 + itemID;
  },
  /** "<item> Depleted" (StatList.objectBreakStats). */
  breakItem(itemID: number): number {
    return 16973824 + itemID;
  },
} as const;

/** AchievementList: the 27 achievements of 1.5.2, as stat ids (5242880 + index). */
export const AchievementIds = {
  openInventory: 5242880,
  mineWood: 5242881,
  buildWorkBench: 5242882,
  buildPickaxe: 5242883,
  buildFurnace: 5242884,
  acquireIron: 5242885,
  buildHoe: 5242886,
  makeBread: 5242887,
  bakeCake: 5242888,
  buildBetterPickaxe: 5242889,
  cookFish: 5242890,
  onARail: 5242891,
  buildSword: 5242892,
  killEnemy: 5242893,
  killCow: 5242894,
  flyPig: 5242895,
  snipeSkeleton: 5242896,
  diamonds: 5242897,
  portal: 5242898,
  ghast: 5242899,
  blazeRod: 5242900,
  potion: 5242901,
  theEnd: 5242902,
  theEnd2: 5242903,
  enchantments: 5242904,
  overkill: 5242905,
  bookcase: 5242906,
} as const;
