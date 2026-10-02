import { CommandBase, joinNiceString } from './CommandBase';
import { CommandException, SyntaxErrorException, WrongUsageException } from './CommandException';
import { getServer } from './CommandServer';
import type { ICommandSender } from './ICommandSender';
import { getScoreboard, type ScoreObjective, ScoreObjectiveCriteria, type ScorePlayerTeam, Scoreboard } from './scoreboard/Scoreboard';

/** EnumChatFormatting colours by lower-case name (func_96296_a(true, false)), with RESET for lookup only. */
const COLORS: [string, string][] = [
  ['black', '0'], ['dark_blue', '1'], ['dark_green', '2'], ['dark_aqua', '3'], ['dark_red', '4'], ['dark_purple', '5'], ['gold', '6'], ['gray', '7'],
  ['dark_gray', '8'], ['blue', '9'], ['green', 'a'], ['aqua', 'b'], ['red', 'c'], ['light_purple', 'd'], ['yellow', 'e'], ['white', 'f'],
];
const COLOR_NAMES = COLORS.map((c) => c[0]);
const DARK_GREEN = '§2';
const RESET = '§r';

function colorCode(name: string): string | null {
  const l = name.toLowerCase();
  if (l === 'reset') return RESET;
  const c = COLORS.find((e) => e[0] === l);
  return c ? '§' + c[1] : null;
}

/** /scoreboard objectives|players|teams ... */
export class ServerCommandScoreboard extends CommandBase {
  getCommandName(): string {
    return 'scoreboard';
  }

  override getRequiredPermissionLevel(): number {
    return 2;
  }

  processCommand(sender: ICommandSender, args: string[]): void {
    const isPlayer = typeof (sender as { inventory?: unknown }).inventory === 'object';
    if (args.length >= 1) {
      const a0 = args[0].toLowerCase();
      const a1 = args.length > 1 ? args[1].toLowerCase() : '';
      if (a0 === 'objectives') {
        if (args.length === 1) throw new WrongUsageException('commands.scoreboard.objectives.usage');
        if (a1 === 'list') this.getObjectivesList(sender);
        else if (a1 === 'add') {
          if (args.length < 4) throw new WrongUsageException('commands.scoreboard.objectives.add.usage');
          this.addObjective(sender, args, 2);
        } else if (a1 === 'remove') {
          if (args.length !== 3) throw new WrongUsageException('commands.scoreboard.objectives.remove.usage');
          this.removeObjective(sender, args[2]);
        } else if (a1 === 'setdisplay') {
          if (args.length !== 3 && args.length !== 4) throw new WrongUsageException('commands.scoreboard.objectives.setdisplay.usage');
          this.setObjectivesDisplay(sender, args, 2);
        } else throw new WrongUsageException('commands.scoreboard.objectives.usage');
        return;
      }
      if (a0 === 'players') {
        if (args.length === 1) throw new WrongUsageException('commands.scoreboard.players.usage');
        if (a1 === 'list') {
          if (args.length > 3) throw new WrongUsageException('commands.scoreboard.players.list.usage');
          this.listPlayers(sender, args, 2);
        } else if (a1 === 'add' || a1 === 'remove' || a1 === 'set') {
          if (args.length !== 5) throw new WrongUsageException(`commands.scoreboard.players.${a1}.usage`);
          this.setPlayerScore(sender, args, 2);
        } else if (a1 === 'reset') {
          if (args.length !== 3) throw new WrongUsageException('commands.scoreboard.players.reset.usage');
          this.resetPlayerScore(sender, args, 2);
        } else throw new WrongUsageException('commands.scoreboard.players.usage');
        return;
      }
      if (a0 === 'teams') {
        if (args.length === 1) throw new WrongUsageException('commands.scoreboard.teams.usage');
        if (a1 === 'list') {
          if (args.length > 3) throw new WrongUsageException('commands.scoreboard.teams.list.usage');
          this.getTeamList(sender, args, 2);
        } else if (a1 === 'add') {
          if (args.length < 3) throw new WrongUsageException('commands.scoreboard.teams.add.usage');
          this.addTeam(sender, args, 2);
        } else if (a1 === 'remove') {
          if (args.length !== 3) throw new WrongUsageException('commands.scoreboard.teams.remove.usage');
          this.removeTeam(sender, args, 2);
        } else if (a1 === 'empty') {
          if (args.length !== 3) throw new WrongUsageException('commands.scoreboard.teams.empty.usage');
          this.emptyTeam(sender, args, 2);
        } else if (a1 === 'join') {
          if (args.length < 4 && (args.length !== 3 || !isPlayer)) throw new WrongUsageException('commands.scoreboard.teams.join.usage');
          this.joinTeam(sender, args, 2, isPlayer);
        } else if (a1 === 'leave') {
          if (args.length < 3 && !isPlayer) throw new WrongUsageException('commands.scoreboard.teams.leave.usage');
          this.leaveTeam(sender, args, 2, isPlayer);
        } else if (a1 === 'option') {
          if (args.length !== 4 && args.length !== 5) throw new WrongUsageException('commands.scoreboard.teams.option.usage');
          this.setTeamOption(sender, args, 2);
        } else throw new WrongUsageException('commands.scoreboard.teams.usage');
        return;
      }
    }
    throw new WrongUsageException('commands.scoreboard.usage');
  }

  protected getScoreboardFromWorldServer(): Scoreboard {
    const w = getServer()?.getWorlds()[0];
    if (!w) throw new CommandException('commands.generic.exception');
    return getScoreboard(w);
  }

  protected getScoreObjective(name: string, writable: boolean): ScoreObjective {
    const o = this.getScoreboardFromWorldServer().getObjective(name);
    if (!o) throw new CommandException('commands.scoreboard.objectiveNotFound', name);
    if (writable && o.criteria.isReadOnly()) throw new CommandException('commands.scoreboard.objectiveReadOnly', name);
    return o;
  }

  protected getTeam(name: string): ScorePlayerTeam {
    const t = this.getScoreboardFromWorldServer().getTeam(name);
    if (!t) throw new CommandException('commands.scoreboard.teamNotFound', name);
    return t;
  }

  protected addObjective(sender: ICommandSender, args: string[], i: number): void {
    const name = args[i++];
    const type = args[i++];
    const board = this.getScoreboardFromWorldServer();
    const criteria = ScoreObjectiveCriteria.byName.get(type);
    if (!criteria) throw new WrongUsageException('commands.scoreboard.objectives.add.wrongType', joinNiceString([...ScoreObjectiveCriteria.byName.keys()]));
    if (board.getObjective(name)) throw new CommandException('commands.scoreboard.objectives.add.alreadyExists', name);
    if (name.length > 16) throw new SyntaxErrorException('commands.scoreboard.objectives.add.tooLong', name, 16);
    const o = board.addScoreObjective(name, criteria);
    if (args.length > i) {
      const display = CommandBase.joinArgs(sender, args, i);
      if (display.length > 32) throw new SyntaxErrorException('commands.scoreboard.objectives.add.displayTooLong', display, 32);
      if (display.length > 0) o.setDisplayName(display);
    }
    CommandBase.notifyAdmins(sender, 'commands.scoreboard.objectives.add.success', name);
  }

  protected addTeam(sender: ICommandSender, args: string[], i: number): void {
    const name = args[i++];
    const board = this.getScoreboardFromWorldServer();
    if (board.getTeam(name)) throw new CommandException('commands.scoreboard.teams.add.alreadyExists', name);
    if (name.length > 16) throw new SyntaxErrorException('commands.scoreboard.teams.add.tooLong', name, 16);
    const t = board.createTeam(name);
    if (args.length > i) {
      const display = CommandBase.joinArgs(sender, args, i);
      if (display.length > 32) throw new SyntaxErrorException('commands.scoreboard.teams.add.displayTooLong', display, 32);
      if (display.length > 0) t.setDisplayName(display);
    }
    CommandBase.notifyAdmins(sender, 'commands.scoreboard.teams.add.success', name);
  }

  protected setTeamOption(sender: ICommandSender, args: string[], i: number): void {
    const team = this.getTeam(args[i++]);
    const option = args[i++].toLowerCase();
    const bools = joinNiceString(['true', 'false']);
    if (option !== 'color' && option !== 'friendlyfire' && option !== 'seefriendlyinvisibles') throw new WrongUsageException('commands.scoreboard.teams.option.usage');
    if (args.length === 4) {
      if (option === 'color') throw new WrongUsageException('commands.scoreboard.teams.option.noValue', option, joinNiceString(COLOR_NAMES));
      throw new WrongUsageException('commands.scoreboard.teams.option.noValue', option, bools);
    }
    const value = args[i++];
    if (option === 'color') {
      const code = colorCode(value);
      if (code === null) throw new WrongUsageException('commands.scoreboard.teams.option.noValue', option, joinNiceString(COLOR_NAMES));
      team.setNamePrefix(code);
      team.setNameSuffix(RESET);
    } else {
      const v = value.toLowerCase();
      if (v !== 'true' && v !== 'false') throw new WrongUsageException('commands.scoreboard.teams.option.noValue', option, bools);
      if (option === 'friendlyfire') team.allowFriendlyFire = v === 'true';
      else team.canSeeFriendlyInvisibles = v === 'true';
    }
    CommandBase.notifyAdmins(sender, 'commands.scoreboard.teams.option.success', option, team.registeredName, value);
  }

  protected removeTeam(sender: ICommandSender, args: string[], i: number): void {
    const team = this.getTeam(args[i]);
    this.getScoreboardFromWorldServer().removeTeam(team);
    CommandBase.notifyAdmins(sender, 'commands.scoreboard.teams.remove.success', team.registeredName);
  }

  protected getTeamList(sender: ICommandSender, args: string[], i: number): void {
    const board = this.getScoreboardFromWorldServer();
    if (args.length > i) {
      const team = this.getTeam(args[i]);
      const members = [...team.members];
      if (members.length <= 0) throw new CommandException('commands.scoreboard.teams.list.player.empty', team.registeredName);
      sender.sendChatToPlayer(DARK_GREEN + sender.translateString('commands.scoreboard.teams.list.player.count', members.length, team.registeredName));
      sender.sendChatToPlayer(joinNiceString(members));
    } else {
      const teams = board.getTeams();
      if (teams.length <= 0) throw new CommandException('commands.scoreboard.teams.list.empty');
      sender.sendChatToPlayer(DARK_GREEN + sender.translateString('commands.scoreboard.teams.list.count', teams.length));
      for (const t of teams) sender.sendChatToPlayer(sender.translateString('commands.scoreboard.teams.list.entry', t.registeredName, t.getDisplayName(), t.members.size));
    }
  }

  protected joinTeam(sender: ICommandSender, args: string[], i: number, isPlayer: boolean): void {
    const board = this.getScoreboardFromWorldServer();
    const team = board.getTeam(args[i++]);
    if (!team) throw new CommandException('commands.scoreboard.teamNotFound', args[i - 1]);
    const joined = new Set<string>();
    if (isPlayer && i === args.length) {
      const name = CommandBase.getCommandSenderAsPlayer(sender).getEntityName();
      board.addPlayerToTeam(name, team);
      joined.add(name);
    } else {
      while (i < args.length) {
        const name = CommandBase.getPlayerName(sender, args[i++]);
        board.addPlayerToTeam(name, team);
        joined.add(name);
      }
    }
    if (joined.size > 0) CommandBase.notifyAdmins(sender, 'commands.scoreboard.teams.join.success', joined.size, team.registeredName, joinNiceString([...joined]));
  }

  protected leaveTeam(sender: ICommandSender, args: string[], i: number, isPlayer: boolean): void {
    const board = this.getScoreboardFromWorldServer();
    const left = new Set<string>();
    const failed = new Set<string>();
    const leave = (name: string) => (board.removePlayerFromTeams(name) ? left : failed).add(name);
    if (isPlayer && i === args.length) leave(CommandBase.getCommandSenderAsPlayer(sender).getEntityName());
    else while (i < args.length) leave(CommandBase.getPlayerName(sender, args[i++]));
    if (left.size > 0) CommandBase.notifyAdmins(sender, 'commands.scoreboard.teams.leave.success', left.size, joinNiceString([...left]));
    if (failed.size > 0) throw new CommandException('commands.scoreboard.teams.leave.failure', failed.size, joinNiceString([...failed]));
  }

  protected emptyTeam(sender: ICommandSender, args: string[], i: number): void {
    const board = this.getScoreboardFromWorldServer();
    const team = this.getTeam(args[i]);
    const members = [...team.members];
    if (members.length === 0) throw new CommandException('commands.scoreboard.teams.empty.alreadyEmpty', team.registeredName);
    for (const m of members) board.removePlayerFromTeam(m, team);
    CommandBase.notifyAdmins(sender, 'commands.scoreboard.teams.empty.success', members.length, team.registeredName);
  }

  protected removeObjective(sender: ICommandSender, name: string): void {
    const board = this.getScoreboardFromWorldServer();
    board.removeObjective(this.getScoreObjective(name, false));
    CommandBase.notifyAdmins(sender, 'commands.scoreboard.objectives.remove.success', name);
  }

  protected getObjectivesList(sender: ICommandSender): void {
    const list = this.getScoreboardFromWorldServer().getScoreObjectives();
    if (list.length <= 0) throw new CommandException('commands.scoreboard.objectives.list.empty');
    sender.sendChatToPlayer(DARK_GREEN + sender.translateString('commands.scoreboard.objectives.list.count', list.length));
    for (const o of list) sender.sendChatToPlayer(sender.translateString('commands.scoreboard.objectives.list.entry', o.name, o.getDisplayName(), o.criteria.name));
  }

  protected setObjectivesDisplay(sender: ICommandSender, args: string[], i: number): void {
    const board = this.getScoreboardFromWorldServer();
    const slotName = args[i++];
    const slot = Scoreboard.getObjectiveDisplaySlotNumber(slotName);
    let o: ScoreObjective | null = null;
    if (args.length === 4) o = this.getScoreObjective(args[i++], false);
    if (slot < 0) throw new CommandException('commands.scoreboard.objectives.setdisplay.invalidSlot', slotName);
    board.setObjectiveInDisplaySlot(slot, o);
    if (o) CommandBase.notifyAdmins(sender, 'commands.scoreboard.objectives.setdisplay.successSet', Scoreboard.getObjectiveDisplaySlot(slot), o.name);
    else CommandBase.notifyAdmins(sender, 'commands.scoreboard.objectives.setdisplay.successCleared', Scoreboard.getObjectiveDisplaySlot(slot));
  }

  protected listPlayers(sender: ICommandSender, args: string[], i: number): void {
    const board = this.getScoreboardFromWorldServer();
    if (args.length > i) {
      const name = CommandBase.getPlayerName(sender, args[i]);
      const scores = board.getObjectivesForEntity(name);
      if (scores.size <= 0) throw new CommandException('commands.scoreboard.players.list.player.empty', name);
      sender.sendChatToPlayer(DARK_GREEN + sender.translateString('commands.scoreboard.players.list.player.count', scores.size, name));
      for (const s of scores.values()) sender.sendChatToPlayer(sender.translateString('commands.scoreboard.players.list.player.entry', s.getScorePoints(), s.objective.getDisplayName(), s.objective.name));
    } else {
      const names = board.getObjectiveNames();
      if (names.length <= 0) throw new CommandException('commands.scoreboard.players.list.empty');
      sender.sendChatToPlayer(DARK_GREEN + sender.translateString('commands.scoreboard.players.list.count', names.length));
      sender.sendChatToPlayer(joinNiceString(names));
    }
  }

  protected setPlayerScore(sender: ICommandSender, args: string[], i: number): void {
    const action = args[i - 1].toLowerCase();
    const name = CommandBase.getPlayerName(sender, args[i++]);
    const o = this.getScoreObjective(args[i++], true);
    const n = action === 'set' ? CommandBase.parseInt(sender, args[i++]) : CommandBase.parseIntWithMin(sender, args[i++], 1);
    const score = this.getScoreboardFromWorldServer().getPlayerScore(name, o);
    if (action === 'set') score.setScore(n);
    else if (action === 'add') score.increase(n);
    else score.decrease(n);
    CommandBase.notifyAdmins(sender, 'commands.scoreboard.players.set.success', o.name, name, score.getScorePoints());
  }

  protected resetPlayerScore(sender: ICommandSender, args: string[], i: number): void {
    const name = CommandBase.getPlayerName(sender, args[i]);
    this.getScoreboardFromWorldServer().resetPlayerScores(name);
    CommandBase.notifyAdmins(sender, 'commands.scoreboard.players.reset.success', name);
  }

  private objectiveNames(writableOnly: boolean): string[] {
    return this.getScoreboardFromWorldServer()
      .getScoreObjectives()
      .filter((o) => !writableOnly || !o.criteria.isReadOnly())
      .map((o) => o.name);
  }

  override addTabCompletionOptions(_sender: ICommandSender, args: string[]): string[] | null {
    const m = CommandBase.getListOfStringsMatchingLastWord;
    const mi = CommandBase.getListOfStringsFromIterableMatchingLastWord;
    if (args.length === 1) return m(args, 'objectives', 'players', 'teams');
    const a0 = args[0].toLowerCase();
    const a1 = args[1].toLowerCase();
    if (a0 === 'objectives') {
      if (args.length === 2) return m(args, 'list', 'add', 'remove', 'setdisplay');
      if (a1 === 'add' && args.length === 4) return mi(args, ScoreObjectiveCriteria.byName.keys());
      if (a1 === 'remove' && args.length === 3) return mi(args, this.objectiveNames(false));
      if (a1 === 'setdisplay') {
        if (args.length === 3) return m(args, 'list', 'sidebar', 'belowName');
        if (args.length === 4) return mi(args, this.objectiveNames(false));
      }
    } else if (a0 === 'players') {
      if (args.length === 2) return m(args, 'set', 'add', 'remove', 'reset', 'list');
      if (a1 === 'set' || a1 === 'add' || a1 === 'remove') {
        if (args.length === 3) return m(args, ...CommandBase.getAllUsernames());
        if (args.length === 4) return mi(args, this.objectiveNames(true));
      } else if ((a1 === 'reset' || a1 === 'list') && args.length === 3) {
        return mi(args, this.getScoreboardFromWorldServer().getObjectiveNames());
      }
    } else if (a0 === 'teams') {
      if (args.length === 2) return m(args, 'add', 'remove', 'join', 'leave', 'empty', 'list', 'option');
      const teams = () => this.getScoreboardFromWorldServer().getTeamNames();
      if (a1 === 'join') {
        if (args.length === 3) return mi(args, teams());
        if (args.length >= 4) return m(args, ...CommandBase.getAllUsernames());
      } else if (a1 === 'leave') {
        return m(args, ...CommandBase.getAllUsernames());
      } else if (a1 === 'empty' || a1 === 'list' || a1 === 'remove') {
        if (args.length === 3) return mi(args, teams());
      } else if (a1 === 'option') {
        if (args.length === 3) return mi(args, teams());
        if (args.length === 4) return m(args, 'color', 'friendlyfire', 'seeFriendlyInvisibles');
        if (args.length === 5) {
          const opt = args[3].toLowerCase();
          if (opt === 'color') return mi(args, COLOR_NAMES);
          if (opt === 'friendlyfire' || opt === 'seefriendlyinvisibles') return m(args, 'true', 'false');
        }
      }
    }
    return null;
  }

  override isUsernameIndex(args: string[], index: number): boolean {
    const a0 = args[0]?.toLowerCase();
    if (a0 === 'players') return index === 2;
    return a0 === 'teams' ? index === 2 || index === 3 : false;
  }
}
