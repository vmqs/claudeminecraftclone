import type { Minecraft } from '../client/Minecraft';
import { GuiAchievement } from '../gui/GuiAchievement';
import { AchievementList } from './AchievementList';
import { ClientStats } from './ClientStats';
import { StatList } from './StatList';
import { ClickMode } from '../gui/inventory/Container';
import { ContainerFurnace } from '../gui/inventory/ContainerFurnace';
import { ContainerWorkbench } from '../gui/inventory/ContainerWorkbench';
import { ItemStack } from '../item/ItemStack';
import { TileEntityFurnace } from '../world/tileentity/TileEntityFurnace';

/**
 * `mc.dev.stats`: inspect and steer statistics and achievements from scenarios. Ids are the
 * StatIds / AchievementIds numbers; achievements may also be named by key ('mineWood').
 */
export class StatsDevTools {
  constructor(readonly mc: Minecraft) {}

  private achievementId(idOrKey: number | string): number {
    if (typeof idOrKey === 'number') return idOrKey;
    const a = AchievementList.achievementList.find((x) => x.key === idOrKey);
    if (!a) throw new Error(`unknown achievement ${idOrKey}`);
    return a.statId;
  }

  /** The value of a statistic (or achievement count). */
  value(idOrKey: number | string): number {
    const s = StatList.resolve(this.achievementId(idOrKey));
    return s && ClientStats.writer ? ClientStats.writer.writeStat(s) : 0;
  }

  /** Counts like the local player does (achievements obey the parent rule and show the toast). */
  add(idOrKey: number | string, amount = 1): void {
    ClientStats.addStat(this.achievementId(idOrKey), amount);
  }

  /** statFileWriter.readStat: no parent rule, no toast (like the reference harness's `stat`). */
  set(idOrKey: number | string, amount = 1): void {
    const s = StatList.resolve(this.achievementId(idOrKey));
    if (s) ClientStats.writer?.readStat(s, amount);
  }

  /** Unlocked achievement keys, the user, and what the toast shows. */
  state(): { user: string; unlocked: string[]; toast: { key: string; information: boolean } | null; hint: boolean } {
    const w = ClientStats.writer;
    const shown = ClientStats.toast?.getShown() ?? null;
    return {
      user: w?.getUser() ?? '',
      unlocked: AchievementList.achievementList.filter((a) => w?.hasAchievementUnlocked(a)).map((a) => a.key),
      toast: shown ? { key: shown.achievement.key, information: shown.information } : null,
      hint: ClientStats.showInventoryHint,
    };
  }

  /** Turns the "Press 'E' to open your inventory" hint on or off (off under automation). */
  hint(on: boolean): void {
    ClientStats.showInventoryHint = on;
  }

  /** Freezes the toast and blink clock at `ms` (null: real time again). */
  pinClock(ms: number | null): void {
    GuiAchievement.now = ms === null ? () => performance.now() : () => ms;
  }

  /**
   * Crafts in a crafting table window (shift-click on the result, so SlotCrafting's statistics
   * and achievements run): `grid` is 9 ids (null = empty), each cell a stack of `count`.
   * Returns how many results ended up in the inventory.
   */
  craft(grid: (number | null)[], count = 1): number {
    const p = this.mc.thePlayer;
    const w = this.mc.theWorld;
    if (!p || !w) return 0;
    const c = new ContainerWorkbench(p.inventory, w, 0, 0, 0);
    grid.forEach((id, i) => c.putStackInSlot(1 + i, id === null ? null : new ItemStack(id, count, 0)));
    c.onCraftMatrixChanged(c.getSlot(1).inventory);
    const out = c.getSlot(0).getStack();
    if (!out) return 0;
    const before = p.inventory.mainInventory.reduce((n, s) => n + (s?.itemID === out.itemID ? s.stackSize : 0), 0);
    c.slotClick(0, 0, ClickMode.QUICK_MOVE, p);
    for (let i = 1; i <= 9; i++) c.putStackInSlot(i, null);
    return p.inventory.mainInventory.reduce((n, s) => n + (s?.itemID === out.itemID ? s.stackSize : 0), 0) - before;
  }

  /** Takes `count` smelted `id` out of a furnace's output (SlotFurnace: "Crafted", iron, fish). */
  smelt(id: number, count = 1): void {
    const p = this.mc.thePlayer;
    if (!p) return;
    const furnace = new TileEntityFurnace();
    const c = new ContainerFurnace(p.inventory, furnace);
    furnace.setInventorySlotContents(2, new ItemStack(id, count, 0));
    c.slotClick(2, 0, ClickMode.QUICK_MOVE, p);
  }

  /** Forgets this user's statistics (a new, empty stat file). */
  reset(): void {
    ClientStats.writer?.clear();
    ClientStats.writer?.syncStats();
  }
}
