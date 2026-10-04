import { Block } from '../block/Block';
import { BlockIds } from '../block/BlockIds';
import { I18n } from '../core/I18n';
import { CraftingManager } from '../item/crafting/CraftingManager';
import { FurnaceRecipes } from '../item/crafting/FurnaceRecipes';
import { Item } from '../item/Item';
import { AchievementList } from './AchievementList';
import { StatBase, StatBasic, StatCrafting, StatPlaceholder, type StatType } from './StatBase';
import { StatIds } from './StatIds';

const ITEM_SLOTS = 32000;

/** The general statistics in StatList order (the General page lists them in this order). */
const GENERAL: readonly [number, string, StatType, boolean][] = [
  [StatIds.startGame, 'stat.startGame', 'simple', true],
  [StatIds.createWorld, 'stat.createWorld', 'simple', true],
  [StatIds.loadWorld, 'stat.loadWorld', 'simple', true],
  [StatIds.joinMultiplayer, 'stat.joinMultiplayer', 'simple', true],
  [StatIds.leaveGame, 'stat.leaveGame', 'simple', true],
  [StatIds.playOneMinute, 'stat.playOneMinute', 'time', true],
  [StatIds.walkOneCm, 'stat.walkOneCm', 'distance', true],
  [StatIds.swimOneCm, 'stat.swimOneCm', 'distance', true],
  [StatIds.fallOneCm, 'stat.fallOneCm', 'distance', true],
  [StatIds.climbOneCm, 'stat.climbOneCm', 'distance', true],
  [StatIds.flyOneCm, 'stat.flyOneCm', 'distance', true],
  [StatIds.diveOneCm, 'stat.diveOneCm', 'distance', true],
  [StatIds.minecartOneCm, 'stat.minecartOneCm', 'distance', true],
  [StatIds.boatOneCm, 'stat.boatOneCm', 'distance', true],
  [StatIds.pigOneCm, 'stat.pigOneCm', 'distance', true],
  [StatIds.jump, 'stat.jump', 'simple', true],
  [StatIds.drop, 'stat.drop', 'simple', true],
  [StatIds.damageDealt, 'stat.damageDealt', 'simple', false],
  [StatIds.damageTaken, 'stat.damageTaken', 'simple', false],
  [StatIds.deaths, 'stat.deaths', 'simple', false],
  [StatIds.mobKills, 'stat.mobKills', 'simple', false],
  [StatIds.playerKills, 'stat.playerKills', 'simple', false],
  [StatIds.fishCaught, 'stat.fishCaught', 'simple', false],
];

/** Blocks whose statistics are counted as another block's (replaceAllSimilarBlocks). */
const SIMILAR_BLOCKS: readonly [number, number][] = [
  [BlockIds.waterStill, BlockIds.waterMoving],
  [BlockIds.lavaStill, BlockIds.lavaStill],
  [BlockIds.pumpkinLantern, BlockIds.pumpkin],
  [BlockIds.furnaceBurning, BlockIds.furnaceIdle],
  [BlockIds.oreRedstoneGlowing, BlockIds.oreRedstone],
  [BlockIds.redstoneRepeaterActive, BlockIds.redstoneRepeaterIdle],
  [BlockIds.torchRedstoneActive, BlockIds.torchRedstoneIdle],
  [BlockIds.mushroomRed, BlockIds.mushroomBrown],
  [BlockIds.stoneDoubleSlab, BlockIds.stoneSingleSlab],
  [BlockIds.woodDoubleSlab, BlockIds.woodSingleSlab],
  [BlockIds.grass, BlockIds.dirt],
  [BlockIds.tilledField, BlockIds.dirt],
];

function remove<T>(list: T[], v: T | null | undefined): void {
  if (v == null) return;
  const i = list.indexOf(v);
  if (i >= 0) list.splice(i, 1);
}

/**
 * StatList: every statistic of 1.5.2 by id (oneShotStats), the General page's list, the
 * per-block "mined" and per-item "crafted" / "used" / "depleted" tables, and the achievements.
 * The registry is built on first use, once the block, item and recipe registries exist; names
 * are translated when shown, so they follow the language.
 */
export class StatList {
  static readonly oneShotStats = new Map<number, StatBase>();
  static readonly allStats: StatBase[] = [];
  static readonly generalStats: StatBase[] = [];
  /** Items (ids 256 and up) that have a "used" statistic: the Items page's rows. */
  static readonly itemStats: StatCrafting[] = [];
  /** Blocks that have a "mined" statistic: the Blocks page's rows. */
  static readonly objectMineStats: StatCrafting[] = [];
  static readonly mineBlockStatArray: (StatBase | null)[] = new Array(256).fill(null);
  static readonly objectCraftStats: (StatBase | null)[] = new Array(ITEM_SLOTS).fill(null);
  static readonly objectUseStats: (StatBase | null)[] = new Array(ITEM_SLOTS).fill(null);
  static readonly objectBreakStats: (StatBase | null)[] = new Array(ITEM_SLOTS).fill(null);
  private static initialized = false;

  static init(): void {
    if (StatList.initialized) return;
    StatList.initialized = true;
    for (const [id, name, type, independent] of GENERAL) {
      const s = new StatBasic(id, name, type);
      if (independent) s.initIndependentStat();
      StatList.registerStat(s);
      StatList.generalStats.push(s);
    }
    StatList.initMinableStats();
    for (const a of AchievementList.achievementList) StatList.registerStat(a);
    StatList.initUsableStats(0, 256);
    StatList.initBreakStats(0, 256);
    StatList.initUsableStats(256, ITEM_SLOTS);
    StatList.initBreakStats(256, ITEM_SLOTS);
    StatList.initCraftableStats();
  }

  /** registerStat: ids are unique. */
  private static registerStat<T extends StatBase>(s: T): T {
    const old = StatList.oneShotStats.get(s.statId);
    if (old) throw new Error(`Duplicate stat id: "${old.getName()}" and "${s.getName()}" at id ${s.statId}`);
    StatList.allStats.push(s);
    StatList.oneShotStats.set(s.statId, s);
    return s;
  }

  private static initMinableStats(): void {
    const arr = StatList.mineBlockStatArray;
    for (let id = 0; id < 256; id++) {
      const b = Block.blocksList[id];
      if (!b || !b.getEnableStats()) continue;
      const s = StatList.registerStat(new StatCrafting(StatIds.mineBlock(id), () => I18n.translateToLocalFormatted('stat.mineBlock', b.getLocalizedName()), id));
      arr[id] = s;
      StatList.objectMineStats.push(s);
    }
    StatList.replaceAllSimilarBlocks(arr);
  }

  private static initUsableStats(from: number, to: number): void {
    const arr = StatList.objectUseStats;
    for (let id = from; id < to; id++) {
      const item = Item.itemsList[id];
      if (!item) continue;
      const s = StatList.registerStat(new StatCrafting(StatIds.useItem(id), () => I18n.translateToLocalFormatted('stat.useItem', item.getStatName()), id));
      arr[id] = s;
      if (id >= 256) StatList.itemStats.push(s);
    }
    StatList.replaceAllSimilarBlocks(arr);
  }

  private static initBreakStats(from: number, to: number): void {
    const arr = StatList.objectBreakStats;
    for (let id = from; id < to; id++) {
      const item = Item.itemsList[id];
      if (!item || !item.isDamageable()) continue;
      arr[id] = StatList.registerStat(new StatCrafting(StatIds.breakItem(id), () => I18n.translateToLocalFormatted('stat.breakItem', item.getStatName()), id));
    }
    StatList.replaceAllSimilarBlocks(arr);
  }

  /** "Crafted" exists for every crafting recipe's output and every smelting result. */
  private static initCraftableStats(): void {
    const ids = new Set<number>();
    for (const r of CraftingManager.getInstance().getRecipeList()) {
      const out = r.getRecipeOutput();
      if (out) ids.add(out.itemID);
    }
    for (const out of FurnaceRecipes.smelting().getSmeltingList().values()) ids.add(out.itemID);
    const arr = StatList.objectCraftStats;
    for (const id of ids) {
      const item = Item.itemsList[id];
      if (!item) continue;
      arr[id] = StatList.registerStat(new StatCrafting(StatIds.craftItem(id), () => I18n.translateToLocalFormatted('stat.craftItem', item.getStatName()), id));
    }
    StatList.replaceAllSimilarBlocks(arr);
  }

  private static replaceAllSimilarBlocks(arr: (StatBase | null)[]): void {
    for (const [from, to] of SIMILAR_BLOCKS) {
      if (arr[from] !== null && arr[to] === null) {
        arr[to] = arr[from];
      } else {
        remove(StatList.allStats, arr[from]);
        remove(StatList.objectMineStats as StatBase[], arr[from]);
        remove(StatList.generalStats, arr[from]);
        arr[from] = arr[to];
      }
    }
  }

  /** getOneShotStat: the statistic with this id, or undefined. */
  static getOneShotStat(id: number): StatBase | undefined {
    StatList.init();
    return StatList.oneShotStats.get(id);
  }

  /**
   * The statistic a gameplay id stands for: per-block and per-item ids go through their tables
   * (so a grass block counts as dirt, and blocks without statistics count nothing), the rest
   * by id. Null when nothing is counted.
   */
  static resolve(id: number): StatBase | null {
    StatList.init();
    const family = Math.floor((id - StatIds.MINE_BLOCK_BASE) / 65536);
    if (family >= 0 && family < 4) {
      const arr = [StatList.mineBlockStatArray, StatList.objectCraftStats, StatList.objectUseStats, StatList.objectBreakStats][family];
      return arr[id - StatIds.MINE_BLOCK_BASE - family * 65536] ?? null;
    }
    return StatList.oneShotStats.get(id) ?? null;
  }

  /** A stats file entry for an id nothing registered (StatPlaceholder). */
  static placeholder(id: number): StatBase {
    StatList.init();
    return StatList.oneShotStats.get(id) ?? StatList.registerStat(new StatPlaceholder(id));
  }
}
