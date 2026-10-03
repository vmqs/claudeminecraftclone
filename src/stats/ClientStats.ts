import type { GuiAchievement } from '../gui/GuiAchievement';
import { AchievementList } from './AchievementList';
import type { Achievement, StatBase } from './StatBase';
import type { StatFileWriter } from './StatFileWriter';
import { StatList } from './StatList';

/**
 * The local player's statistics sink: Minecraft.statFileWriter and Minecraft.guiAchievement of
 * 1.5.2, installed by `installStats` (src/stats/StatsInstall.ts). Without an installed writer
 * (Node tests, the host's copies of other players) statistics go nowhere.
 */
export const ClientStats = {
  writer: null as StatFileWriter | null,
  toast: null as GuiAchievement | null,
  /**
   * Whether the toast shows ("Achievement get!" and the open-the-inventory hint for a player
   * without "Taking Inventory"). The reference captures have no toasts, so automated runs turn
   * them off unless a scenario turns them on (`mc.dev.stats.toasts(true)`).
   */
  showToasts: true,

  /**
   * EntityPlayerSP.addStat: an achievement counts only once its parent is unlocked, and its
   * first unlock shows the toast; every other statistic simply adds up.
   */
  addStat(id: number, amount: number): void {
    const w = ClientStats.writer;
    if (!w) return;
    const stat = StatList.resolve(id);
    if (!stat) return;
    ClientStats.addResolved(stat, amount);
  },

  addResolved(stat: StatBase, amount: number): void {
    const w = ClientStats.writer;
    if (!w) return;
    if (stat.isAchievement()) {
      const a = stat as Achievement;
      if (!w.canUnlockAchievement(a)) return;
      if (!w.hasAchievementUnlocked(a) && ClientStats.showToasts) ClientStats.toast?.queueTakenAchievement(a);
    }
    w.readStat(stat, amount);
  },

  /** statFileWriter.readStat for the client's own counters (games, worlds, joins, quits). */
  readStat(id: number, amount = 1): void {
    const stat = StatList.resolve(id);
    if (stat) ClientStats.writer?.readStat(stat, amount);
  },

  /** Whether the statistic is one a client counts by itself (StatBase.isIndependent). */
  isIndependent(id: number): boolean {
    return StatList.resolve(id)?.isIndependent ?? false;
  },

  /** EntityPlayerSP.onLivingUpdate: keeps the "Press 'E' to open your inventory" hint up. */
  onPlayerUpdate(): void {
    const w = ClientStats.writer;
    if (!w || !ClientStats.showToasts) return;
    if (!w.hasAchievementUnlocked(AchievementList.openInventory)) ClientStats.toast?.queueAchievementInformation(AchievementList.openInventory);
  },

  /** Minecraft.loadWorld: statFileWriter.syncStats. */
  sync(): void {
    ClientStats.writer?.syncStats();
  },
};
