import { MathHelper } from '../../core/MathHelper';
import type { World } from '../../world/World';

/** How an objective's scores change (ScoreObjectiveCriteria). */
export class ScoreObjectiveCriteria {
  /** Every criteria by name (field_96643_a). */
  static readonly byName = new Map<string, ScoreObjectiveCriteria>();
  static readonly dummy = new ScoreObjectiveCriteria('dummy');
  static readonly deathCount = new ScoreObjectiveCriteria('deathCount');
  static readonly playerKillCount = new ScoreObjectiveCriteria('playerKillCount');
  static readonly totalKillCount = new ScoreObjectiveCriteria('totalKillCount');
  /** ScoreHealthCriteria: 0-20 from the players' health, read-only. */
  static readonly health = new ScoreObjectiveCriteria('health', true);

  constructor(
    readonly name: string,
    readonly readOnly = false,
  ) {
    ScoreObjectiveCriteria.byName.set(name, this);
  }

  isReadOnly(): boolean {
    return this.readOnly;
  }

  /** func_96635_a: the score computed from the players it belongs to. */
  computeScore(players: { getHealth(): number; getMaxHealth(): number }[]): number {
    if (!this.readOnly) return 0;
    let sum = 0;
    for (const p of players) {
      const max = p.getMaxHealth();
      let h = p.getHealth();
      if (h < 0) h = 0;
      if (h > max) h = max;
      sum = Math.fround(sum + Math.fround(h / max));
    }
    if (players.length > 0) sum = Math.fround(sum / players.length);
    return MathHelper.floor_float(Math.fround(sum * 19)) + (sum > 0 ? 1 : 0);
  }
}

export class ScoreObjective {
  private displayName: string;

  constructor(
    readonly scoreboard: Scoreboard,
    readonly name: string,
    readonly criteria: ScoreObjectiveCriteria,
  ) {
    this.displayName = name;
  }

  getName(): string {
    return this.name;
  }

  getCriteria(): ScoreObjectiveCriteria {
    return this.criteria;
  }

  getDisplayName(): string {
    return this.displayName;
  }

  setDisplayName(s: string): void {
    this.displayName = s;
  }
}

export class Score {
  private value = 0;

  constructor(
    readonly objective: ScoreObjective,
    readonly playerName: string,
  ) {}

  /** Lowest first (ScoreComparator). */
  static compare(a: Score, b: Score): number {
    return a.value > b.value ? 1 : a.value < b.value ? -1 : 0;
  }

  private checkWritable(): void {
    if (this.objective.criteria.isReadOnly()) throw new Error('Cannot modify read-only score');
  }

  increase(n: number): void {
    this.checkWritable();
    this.setScore(this.value + n);
  }

  decrease(n: number): void {
    this.checkWritable();
    this.setScore(this.value - n);
  }

  getScorePoints(): number {
    return this.value;
  }

  setScore(v: number): void {
    this.value = v | 0;
  }
}

export class ScorePlayerTeam {
  readonly members = new Set<string>();
  private displayName: string;
  private prefix = '';
  private suffix = '';
  allowFriendlyFire = true;
  canSeeFriendlyInvisibles = true;

  constructor(
    readonly scoreboard: Scoreboard,
    readonly registeredName: string,
  ) {
    this.displayName = registeredName;
  }

  getDisplayName(): string {
    return this.displayName;
  }

  setDisplayName(s: string): void {
    this.displayName = s;
  }

  getColorPrefix(): string {
    return this.prefix;
  }

  setNamePrefix(s: string): void {
    this.prefix = s;
  }

  getColorSuffix(): string {
    return this.suffix;
  }

  setNameSuffix(s: string): void {
    this.suffix = s;
  }

  /** func_96667_a: the name with its team's prefix and suffix. */
  static formatPlayerName(team: ScorePlayerTeam | null, name: string): string {
    return team === null ? name : team.prefix + name + team.suffix;
  }
}

/** Objectives, scores, display slots (0 list, 1 sidebar, 2 belowName) and teams (Scoreboard). */
export class Scoreboard {
  private readonly objectives = new Map<string, ScoreObjective>();
  private readonly playerScores = new Map<string, Map<ScoreObjective, Score>>();
  private readonly displaySlots: (ScoreObjective | null)[] = [null, null, null];
  private readonly teams = new Map<string, ScorePlayerTeam>();
  private readonly teamMemberships = new Map<string, ScorePlayerTeam>();

  getObjective(name: string): ScoreObjective | null {
    return this.objectives.get(name) ?? null;
  }

  addScoreObjective(name: string, criteria: ScoreObjectiveCriteria): ScoreObjective {
    if (this.objectives.has(name)) throw new Error(`An objective with the name '${name}' already exists!`);
    const o = new ScoreObjective(this, name, criteria);
    this.objectives.set(name, o);
    return o;
  }

  getObjectivesWithCriteria(c: ScoreObjectiveCriteria): ScoreObjective[] {
    return [...this.objectives.values()].filter((o) => o.criteria === c);
  }

  /** func_96529_a: the player's score for an objective, created at 0. */
  getPlayerScore(player: string, o: ScoreObjective): Score {
    let m = this.playerScores.get(player);
    if (!m) {
      m = new Map();
      this.playerScores.set(player, m);
    }
    let s = m.get(o);
    if (!s) {
      s = new Score(o, player);
      m.set(o, s);
    }
    return s;
  }

  /** func_96534_i: every score of an objective, lowest first. */
  getSortedScores(o: ScoreObjective): Score[] {
    const out: Score[] = [];
    for (const m of this.playerScores.values()) {
      const s = m.get(o);
      if (s) out.push(s);
    }
    return out.sort(Score.compare);
  }

  getScoreObjectives(): ScoreObjective[] {
    return [...this.objectives.values()];
  }

  /** Names that have scores (getObjectiveNames). */
  getObjectiveNames(): string[] {
    return [...this.playerScores.keys()];
  }

  /** func_96515_c */
  resetPlayerScores(player: string): void {
    this.playerScores.delete(player);
  }

  /** func_96510_d */
  getObjectivesForEntity(player: string): Map<ScoreObjective, Score> {
    return this.playerScores.get(player) ?? new Map();
  }

  /** func_96519_k */
  removeObjective(o: ScoreObjective): void {
    this.objectives.delete(o.name);
    for (let i = 0; i < 3; i++) if (this.displaySlots[i] === o) this.displaySlots[i] = null;
    for (const m of this.playerScores.values()) m.delete(o);
  }

  setObjectiveInDisplaySlot(slot: number, o: ScoreObjective | null): void {
    this.displaySlots[slot] = o;
  }

  getObjectiveInDisplaySlot(slot: number): ScoreObjective | null {
    return this.displaySlots[slot];
  }

  getTeam(name: string): ScorePlayerTeam | null {
    return this.teams.get(name) ?? null;
  }

  createTeam(name: string): ScorePlayerTeam {
    if (this.teams.has(name)) throw new Error(`An objective with the name '${name}' already exists!`);
    const t = new ScorePlayerTeam(this, name);
    this.teams.set(name, t);
    return t;
  }

  removeTeam(t: ScorePlayerTeam): void {
    this.teams.delete(t.registeredName);
    for (const m of t.members) this.teamMemberships.delete(m);
  }

  addPlayerToTeam(player: string, t: ScorePlayerTeam): void {
    if (this.getPlayersTeam(player)) this.removePlayerFromTeams(player);
    this.teamMemberships.set(player, t);
    t.members.add(player);
  }

  /** func_96524_g: true when the player was on a team. */
  removePlayerFromTeams(player: string): boolean {
    const t = this.getPlayersTeam(player);
    if (!t) return false;
    this.removePlayerFromTeam(player, t);
    return true;
  }

  removePlayerFromTeam(player: string, t: ScorePlayerTeam): void {
    if (this.getPlayersTeam(player) !== t) throw new Error(`Player is either on another team or not on any team. Cannot remove from team '${t.registeredName}'.`);
    this.teamMemberships.delete(player);
    t.members.delete(player);
  }

  getTeamNames(): string[] {
    return [...this.teams.keys()];
  }

  getTeams(): ScorePlayerTeam[] {
    return [...this.teams.values()];
  }

  getPlayersTeam(player: string): ScorePlayerTeam | null {
    return this.teamMemberships.get(player) ?? null;
  }

  static getObjectiveDisplaySlot(slot: number): string | null {
    return ['list', 'sidebar', 'belowName'][slot] ?? null;
  }

  static getObjectiveDisplaySlotNumber(name: string): number {
    const l = name.toLowerCase();
    return l === 'list' ? 0 : l === 'sidebar' ? 1 : l === 'belowname' ? 2 : -1;
  }

  /**
   * Counts for the dummy criteria the game updates itself (EntityPlayerMP.onDeath and
   * onKillEntity): every objective of that criteria gets +1 for the player.
   */
  increaseScores(criteria: ScoreObjectiveCriteria, player: string): void {
    for (const o of this.getObjectivesWithCriteria(criteria)) this.getPlayerScore(player, o).increase(1);
  }

  /** The health criteria follow the player's health (EntityPlayerMP.onUpdate). */
  updateHealth(player: { getEntityName(): string; getHealth(): number; getMaxHealth(): number }): void {
    for (const o of this.getObjectivesWithCriteria(ScoreObjectiveCriteria.health)) {
      this.getPlayerScore(player.getEntityName(), o).setScore(o.criteria.computeScore([player]));
    }
  }
}

const boards = new WeakMap<World, Scoreboard>();

/** World.getScoreboard: one scoreboard per world, created on first use. */
/** WorldServerMulti: another dimension's world shares the overworld's scoreboard. */
export function shareScoreboard(from: World, to: World): void {
  boards.set(to, getScoreboard(from));
}

export function getScoreboard(world: World): Scoreboard {
  let b = boards.get(world);
  if (!b) {
    b = new Scoreboard();
    boards.set(world, b);
  }
  return b;
}
