import { MathHelper } from '../core/MathHelper';
import type { ChunkCoordinates } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { getServer } from './CommandServer';
import type { ICommandSender } from './ICommandSender';

const TOKEN = /^@([parf])(?:\[([\w=,!-]*)\])?$/;
const INT_LIST = /([-!]?\w*)(?:$|,)/y;
const KEY_VALUE = /(\w+)=([-!]?\w*)(?:$|,)/y;
const NOT_SET = -1;

/**
 * Target selectors (PlayerSelector): @p nearest, @a all, @r random, with x, y, z, r, rm, m, l,
 * lm, c, name, team and score_ arguments. Nobody has a team and there are no scoreboard
 * objectives yet, so score_ arguments never match.
 */
export const PlayerSelector = {
  matchOnePlayer(sender: ICommandSender, token: string): EntityPlayer | null {
    const found = PlayerSelector.matchPlayers(sender, token);
    return found && found.length === 1 ? found[0] : null;
  },

  matchPlayersAsString(sender: ICommandSender, token: string): string | null {
    const found = PlayerSelector.matchPlayers(sender, token);
    if (!found || found.length === 0) return null;
    return joinNiceString(found.map((p) => p.getEntityName()));
  },

  matchPlayers(sender: ICommandSender, token: string): EntityPlayer[] | null {
    const m = TOKEN.exec(token);
    if (!m) return null;
    const args = getArgumentMap(m[2]);
    const kind = m[1];
    const num = (key: string, def: number) => (args.has(key) ? parseIntWithDefault(args.get(key)!, def) : def);
    const origin = sender.getPlayerCoordinates();
    origin.posX = num('x', origin.posX);
    origin.posY = num('y', origin.posY);
    origin.posZ = num('z', origin.posZ);
    const query: Query = {
      origin,
      minRange: num('rm', 0),
      maxRange: num('r', 0),
      count: num('c', kind === 'a' ? 0 : 1),
      gameMode: num('m', NOT_SET),
      minLevel: num('lm', 0),
      maxLevel: num('l', 0x7fffffff),
      scores: [...args.keys()].filter((k) => k.startsWith('score_') && k.length > 6),
      name: args.get('name') ?? null,
      team: args.get('team') ?? null,
    };
    if (kind === 'p' || kind === 'a') return findPlayers(query);
    if (kind !== 'r') return null;
    const all = findPlayers({ ...query, count: 0 });
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all.slice(0, Math.min(query.count, all.length));
  },

  /** Whether the token may stand for several players (a count other than 1). */
  matchesMultiplePlayers(token: string): boolean {
    const m = TOKEN.exec(token);
    if (!m) return false;
    const args = getArgumentMap(m[2]);
    const def = m[1] === 'a' ? 0 : 1;
    return (args.has('c') ? parseIntWithDefault(args.get('c')!, def) : def) !== 1;
  },

  hasArguments(token: string): boolean {
    return TOKEN.test(token);
  },
};

interface Query {
  origin: ChunkCoordinates;
  minRange: number;
  maxRange: number;
  count: number;
  gameMode: number;
  minLevel: number;
  maxLevel: number;
  scores: string[];
  name: string | null;
  team: string | null;
}

function distSq(a: ChunkCoordinates, b: ChunkCoordinates): number {
  const dx = a.posX - b.posX;
  const dy = a.posY - b.posY;
  const dz = a.posZ - b.posZ;
  return dx * dx + dy * dy + dz * dz;
}

/** ServerConfigurationManager.findPlayers */
function findPlayers(q: Query): EntityPlayer[] {
  const reverse = q.count < 0;
  const count = MathHelper.abs_int(q.count);
  let out: EntityPlayer[] = [];
  for (const p of getServer()?.getPlayers() ?? []) {
    if (q.name !== null) {
      const invert = q.name.startsWith('!');
      const name = invert ? q.name.substring(1) : q.name;
      if (invert === (name.toLowerCase() === p.getEntityName().toLowerCase())) continue;
    }
    if (q.team !== null) {
      const invert = q.team.startsWith('!');
      const team = invert ? q.team.substring(1) : q.team;
      if (invert === (team.toLowerCase() === '')) continue;
    }
    if (q.minRange > 0 || q.maxRange > 0) {
      const d = distSq(q.origin, p.getPlayerCoordinates());
      if ((q.minRange > 0 && d < q.minRange * q.minRange) || (q.maxRange > 0 && d > q.maxRange * q.maxRange)) continue;
    }
    if (q.scores.length > 0) continue;
    if (q.gameMode !== NOT_SET && q.gameMode !== (p.capabilities.isCreativeMode ? 1 : 0)) continue;
    if (q.minLevel > 0 && p.experienceLevel < q.minLevel) continue;
    if (p.experienceLevel > q.maxLevel) continue;
    out.push(p);
  }
  out.sort((a, b) => distSq(q.origin, a.getPlayerCoordinates()) - distSq(q.origin, b.getPlayerCoordinates()));
  if (reverse) out.reverse();
  if (count > 0) out = out.slice(0, count);
  return out;
}

/** Positional x, y, z, r first, then key=value pairs. */
function getArgumentMap(s: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (s === undefined) return out;
  const positional = ['x', 'y', 'z', 'r'];
  let index = 0;
  let end = -1;
  let pos = 0;
  while (pos <= s.length) {
    INT_LIST.lastIndex = pos;
    const m = INT_LIST.exec(s);
    if (!m) break;
    const key = positional[index++];
    if (key && m[1].length > 0) out.set(key, m[1]);
    end = INT_LIST.lastIndex;
    if (m[0].length === 0) break;
    pos = end;
  }
  if (end < s.length) {
    const rest = end === -1 ? s : s.substring(end);
    let p = 0;
    while (p < rest.length) {
      KEY_VALUE.lastIndex = p;
      const m = KEY_VALUE.exec(rest);
      if (!m) break;
      out.set(m[1], m[2]);
      p = KEY_VALUE.lastIndex;
    }
  }
  return out;
}

function parseIntWithDefault(s: string, def: number): number {
  return /^[-+]?\d+$/.test(s) ? Number.parseInt(s, 10) | 0 : def;
}

/** CommandBase.joinNiceString: "a, b and c". */
export function joinNiceString(items: readonly unknown[]): string {
  let out = '';
  items.forEach((v, i) => {
    if (i > 0) out += i === items.length - 1 ? ' and ' : ', ';
    out += String(v);
  });
  return out;
}
