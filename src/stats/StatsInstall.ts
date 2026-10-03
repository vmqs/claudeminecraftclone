import type { Minecraft } from '../client/Minecraft';
import { GameSettings } from '../client/GameSettings';
import { javaFormat } from '../core/I18n';
import { GuiAchievement } from '../gui/GuiAchievement';
import { GuiAchievements } from '../gui/GuiAchievements';
import { screenFactories } from '../gui/GuiDebugScreens';
import { GuiIngameMenu } from '../gui/GuiIngameMenu';
import { GuiStats } from '../gui/GuiStats';
import { AchievementList } from './AchievementList';
import { ClientStats } from './ClientStats';
import { StatFileWriter } from './StatFileWriter';
import { StatIds } from './StatIds';

/** Wall-clock milliseconds between checks for unsaved statistics (about 100 ticks). */
const SAVE_EVERY_MS = 5000;

/**
 * Minecraft's statistics set-up: the stat file of the current username (followed when the
 * name changes), the achievement toast drawn after every frame, the inventory key in the
 * "Taking Inventory" description, saving every few seconds and when the page is hidden, and
 * the `achievements` / `stats` debug screens.
 */
export function installStats(mc: Minecraft): void {
  const writer = new StatFileWriter(mc.username);
  ClientStats.writer = writer;
  ClientStats.toast = new GuiAchievement(mc);
  // The reference captures have no toasts; automated runs neither, unless a scenario asks for them.
  ClientStats.showToasts = !(typeof navigator !== 'undefined' && navigator.webdriver);
  AchievementList.openInventory.setStatStringFormatter((text) => javaFormat(text, [GameSettings.getKeyDisplayString(mc.gameSettings.keyBindInventory.keyCode)]));
  let lastSave = performance.now();
  mc.frameListeners.push(() => {
    if (mc.username && mc.username.toLowerCase() !== writer.getUser()) writer.setUser(mc.username);
    ClientStats.toast?.updateAchievementWindow();
    const now = performance.now();
    if (now - lastSave >= SAVE_EVERY_MS) {
      lastSave = now;
      writer.syncStats();
    }
  });
  if (typeof window !== 'undefined') window.addEventListener('pagehide', () => writer.syncStats());
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => document.hidden && writer.syncStats());
  screenFactories.set('achievements', () => new GuiAchievements(writer));
  screenFactories.set('stats', () => new GuiStats(new GuiIngameMenu(), writer));
}

/**
 * Minecraft.launchIntegratedServer: "Worlds played" for a new world, "Times played" for every
 * start, and "Multiplayer joins" too: 1.5.2's client logs in to its integrated server like to
 * any other (NetClientHandler.handleLogin).
 */
export function noteWorldLaunch(newWorld: boolean): void {
  if (newWorld) ClientStats.readStat(StatIds.createWorld);
  ClientStats.readStat(StatIds.startGame);
  ClientStats.readStat(StatIds.joinMultiplayer);
}
