import type { Achievement, StatBase } from './StatBase';
import { StatList } from './StatList';

/** Where a user's statistics are kept between sessions (the stats_<user>.dat files). */
export interface StatStorage {
  load(user: string): string | null;
  save(user: string, data: string): void;
}

const KEY_PREFIX = 'mc152.stats.';

/** localStorage, one entry per (lower-cased) username; nothing is kept when it is unavailable. */
export const localStatStorage: StatStorage = {
  load(user) {
    try {
      return globalThis.localStorage?.getItem(KEY_PREFIX + user) ?? null;
    } catch {
      return null;
    }
  },
  save(user, data) {
    try {
      globalThis.localStorage?.setItem(KEY_PREFIX + user, data);
    } catch {
      // Storage full or disabled: the counts live on for this session.
    }
  },
};

/** Ticks between saves while something changed (StatsSyncher's 100-tick countdown). */
const SAVE_INTERVAL = 100;

/**
 * The player's statistics and achievements (StatFileWriter): a count per statistic for the
 * current username, global across worlds like 1.5.2's stats file. Saved every 100 ticks after a
 * change, when a world is left and when the page goes away.
 */
export class StatFileWriter {
  private readonly stats = new Map<StatBase, number>();
  private dirty = false;
  private saveCountdown = SAVE_INTERVAL;
  private user = '';
  private loaded = false;

  constructor(
    username: string,
    private readonly storage: StatStorage = localStatStorage,
  ) {
    this.setUser(username);
  }

  /** The name the statistics are kept under (StatsSyncher's stats_<name>). */
  getUser(): string {
    return this.user;
  }

  /** Switches to another username's statistics, saving the current ones first. */
  setUser(username: string): void {
    const user = username.toLowerCase();
    if (this.loaded && user === this.user) return;
    if (this.loaded && this.dirty) this.syncStats();
    this.loaded = true;
    this.user = user;
    this.stats.clear();
    this.dirty = false;
    this.load(this.storage.load(user));
  }

  /** readStat: adds `amount` to the statistic. */
  readStat(stat: StatBase, amount: number): void {
    this.stats.set(stat, (this.stats.get(stat) ?? 0) + amount);
    this.dirty = true;
  }

  /** writeStat: the statistic's current value. */
  writeStat(stat: StatBase): number {
    return this.stats.get(stat) ?? 0;
  }

  hasAchievementUnlocked(a: Achievement): boolean {
    return this.stats.has(a);
  }

  /** An achievement can be unlocked once its parent is (the root always). */
  canUnlockAchievement(a: Achievement): boolean {
    return a.parentAchievement === null || this.hasAchievementUnlocked(a.parentAchievement);
  }

  /** func_77449_e, once per game tick: saves a while after a change. */
  tick(): void {
    if (!this.dirty) return;
    if (--this.saveCountdown <= 0) this.syncStats();
  }

  /** syncStats: writes the statistics out now. */
  syncStats(): void {
    this.saveCountdown = SAVE_INTERVAL;
    if (!this.dirty) return;
    this.dirty = false;
    this.storage.save(this.user, this.serialize());
  }

  /** { "<stat id>": value, ... } in id order. */
  serialize(): string {
    const out: Record<string, number> = {};
    const entries = [...this.stats].sort((a, b) => a[0].statId - b[0].statId);
    for (const [s, v] of entries) out[s.statId] = v;
    return JSON.stringify(out);
  }

  private load(text: string | null): void {
    if (!text) return;
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return;
    }
    if (!data || typeof data !== 'object') return;
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      const id = Number(k);
      if (!Number.isInteger(id) || typeof v !== 'number' || !Number.isFinite(v)) continue;
      // An id nothing registers is kept as a placeholder, so it survives the next save.
      const stat = StatList.getOneShotStat(id) ?? StatList.placeholder(id);
      this.stats.set(stat, Math.trunc(v));
    }
  }
}
