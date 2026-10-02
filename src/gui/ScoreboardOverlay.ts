import { getScoreboard, ScorePlayerTeam } from '../command/scoreboard/Scoreboard';
import type { World } from '../world/World';
import type { ScoreboardOverlay, ScoreLookup, SidebarObjective } from './GuiIngame';

/** The HUD's view of the world scoreboard: the "sidebar" and "list" display slots. */
export const worldScoreboardOverlay: ScoreboardOverlay = {
  sidebar(world: World): SidebarObjective | null {
    const board = getScoreboard(world);
    const o = board.getObjectiveInDisplaySlot(1);
    if (!o) return null;
    return {
      displayName: o.getDisplayName(),
      scores: board.getSortedScores(o).map((s) => ({ name: ScorePlayerTeam.formatPlayerName(board.getPlayersTeam(s.playerName), s.playerName), value: s.getScorePoints() })),
    };
  },
  list(world: World): ScoreLookup | null {
    const board = getScoreboard(world);
    const o = board.getObjectiveInDisplaySlot(0);
    if (!o) return null;
    return {
      formatName: (name) => ScorePlayerTeam.formatPlayerName(board.getPlayersTeam(name), name),
      score: (name) => board.getPlayerScore(name, o).getScorePoints(),
    };
  },
  tick(world, player) {
    getScoreboard(world).updateHealth(player);
  },
};
