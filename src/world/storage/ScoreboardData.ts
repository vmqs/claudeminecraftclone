import { Scoreboard, ScoreObjectiveCriteria } from '../../command/scoreboard/Scoreboard';
import type { TagCompound } from '../../item/ItemStack';
import { NBT, NBTType } from './NBT';

/**
 * data/scoreboard.dat (ScoreboardSaveData): objectives {Name, CriteriaName, DisplayName},
 * player scores {Name, Objective, Score}, teams {Name, DisplayName, Prefix, Suffix,
 * AllowFriendlyFire, SeeFriendlyInvisibles, Players} and the display slots {slot_<n>: name}.
 */
export function scoreboardToNBT(board: Scoreboard): TagCompound {
  const t: TagCompound = {};
  const objectives = board.getScoreObjectives();
  NBT.setList(
    t,
    'Objectives',
    NBTType.Compound,
    objectives.map((o) => {
      const e: TagCompound = {};
      NBT.setString(e, 'Name', o.getName());
      NBT.setString(e, 'CriteriaName', o.getCriteria().name);
      NBT.setString(e, 'DisplayName', o.getDisplayName());
      return e;
    }),
  );
  const scores: TagCompound[] = [];
  for (const o of objectives) {
    for (const s of board.getSortedScores(o)) {
      const e: TagCompound = {};
      NBT.setString(e, 'Name', s.playerName);
      NBT.setString(e, 'Objective', o.getName());
      NBT.setInteger(e, 'Score', s.getScorePoints());
      scores.push(e);
    }
  }
  NBT.setList(t, 'PlayerScores', NBTType.Compound, scores);
  NBT.setList(
    t,
    'Teams',
    NBTType.Compound,
    board.getTeams().map((team) => {
      const e: TagCompound = {};
      NBT.setString(e, 'Name', team.registeredName);
      NBT.setString(e, 'DisplayName', team.getDisplayName());
      NBT.setString(e, 'Prefix', team.getColorPrefix());
      NBT.setString(e, 'Suffix', team.getColorSuffix());
      NBT.setBoolean(e, 'AllowFriendlyFire', team.allowFriendlyFire);
      NBT.setBoolean(e, 'SeeFriendlyInvisibles', team.canSeeFriendlyInvisibles);
      NBT.setList(e, 'Players', NBTType.String, [...team.members]);
      return e;
    }),
  );
  const slots: TagCompound = {};
  let any = false;
  for (let i = 0; i < 3; i++) {
    const o = board.getObjectiveInDisplaySlot(i);
    if (o) {
      NBT.setString(slots, 'slot_' + i, o.getName());
      any = true;
    }
  }
  if (any) NBT.setCompoundTag(t, 'DisplaySlots', slots);
  return t;
}

/** ScoreboardSaveData.readFromNBT into an empty scoreboard (unknown criteria and objectives are skipped). */
export function scoreboardFromNBT(board: Scoreboard, t: TagCompound): void {
  for (const e of NBT.getCompoundList(t, 'Objectives')) {
    const criteria = ScoreObjectiveCriteria.byName.get(NBT.getString(e, 'CriteriaName'));
    const name = NBT.getString(e, 'Name');
    if (!criteria || !name || board.getObjective(name)) continue;
    board.addScoreObjective(name, criteria).setDisplayName(NBT.getString(e, 'DisplayName') || name);
  }
  for (const e of NBT.getCompoundList(t, 'PlayerScores')) {
    const o = board.getObjective(NBT.getString(e, 'Objective'));
    if (o) board.getPlayerScore(NBT.getString(e, 'Name'), o).setScore(NBT.getInteger(e, 'Score'));
  }
  if (NBT.hasKey(t, 'DisplaySlots')) {
    const slots = NBT.getCompoundTag(t, 'DisplaySlots');
    for (let i = 0; i < 3; i++) {
      const o = board.getObjective(NBT.getString(slots, 'slot_' + i));
      if (o) board.setObjectiveInDisplaySlot(i, o);
    }
  }
  for (const e of NBT.getCompoundList(t, 'Teams')) {
    const name = NBT.getString(e, 'Name');
    if (!name || board.getTeam(name)) continue;
    const team = board.createTeam(name);
    team.setDisplayName(NBT.getString(e, 'DisplayName') || name);
    team.setNamePrefix(NBT.getString(e, 'Prefix'));
    team.setNameSuffix(NBT.getString(e, 'Suffix'));
    if (NBT.hasKey(e, 'AllowFriendlyFire')) team.allowFriendlyFire = NBT.getBoolean(e, 'AllowFriendlyFire');
    if (NBT.hasKey(e, 'SeeFriendlyInvisibles')) team.canSeeFriendlyInvisibles = NBT.getBoolean(e, 'SeeFriendlyInvisibles');
    for (const p of NBT.getTagList<unknown>(e, 'Players')) if (typeof p === 'string') board.addPlayerToTeam(p, team);
  }
}
