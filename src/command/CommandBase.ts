import type { EntityPlayer } from '../entity/EntityPlayer';
import { NumberInvalidException, PlayerNotFoundException } from './CommandException';
import { getServer } from './CommandServer';
import type { ICommand } from './ICommand';
import type { ICommandSender } from './ICommandSender';
import { joinNiceString, PlayerSelector } from './PlayerSelector';

export { joinNiceString };

/** Tells everyone allowed to see command output what a command did (IAdminCommand). */
export interface IAdminCommand {
  notifyAdmins(sender: ICommandSender, flags: number, key: string, args: unknown[]): void;
}

let theAdmin: IAdminCommand | null = null;

const INT = /^[-+]?\d+$/;
const DOUBLE = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?[dDfF]?$/;

/** Shared parsing and permission helpers for commands (CommandBase). */
export abstract class CommandBase implements ICommand {
  abstract getCommandName(): string;
  abstract processCommand(sender: ICommandSender, args: string[]): void;

  /** Op level needed: 4 by default; 2 for the gameplay commands, 0 for help/me/tell. */
  getRequiredPermissionLevel(): number {
    return 4;
  }

  getCommandUsage(_sender: ICommandSender): string {
    return '/' + this.getCommandName();
  }

  getCommandAliases(): string[] | null {
    return null;
  }

  canCommandSenderUseCommand(sender: ICommandSender): boolean {
    return sender.canCommandSenderUseCommand(this.getRequiredPermissionLevel(), this.getCommandName());
  }

  addTabCompletionOptions(_sender: ICommandSender, _args: string[]): string[] | null {
    return null;
  }

  isUsernameIndex(_args: string[], _index: number): boolean {
    return false;
  }

  static parseInt(_sender: ICommandSender, s: string): number {
    const n = INT.test(s) ? Number.parseInt(s, 10) : Number.NaN;
    if (Number.isNaN(n) || n > 0x7fffffff || n < -0x80000000) throw new NumberInvalidException('commands.generic.num.invalid', s);
    return n;
  }

  static parseIntWithMin(sender: ICommandSender, s: string, min: number): number {
    return CommandBase.parseIntBounded(sender, s, min, 0x7fffffff);
  }

  static parseIntBounded(sender: ICommandSender, s: string, min: number, max: number): number {
    const n = CommandBase.parseInt(sender, s);
    if (n < min) throw new NumberInvalidException('commands.generic.num.tooSmall', n, min);
    if (n > max) throw new NumberInvalidException('commands.generic.num.tooBig', n, max);
    return n;
  }

  static parseDouble(_sender: ICommandSender, s: string): number {
    const t = s.trim();
    if (!DOUBLE.test(t)) throw new NumberInvalidException('commands.generic.double.invalid', s);
    return Number.parseFloat(t);
  }

  /** The sender itself when it is a player. */
  static getCommandSenderAsPlayer(sender: ICommandSender): EntityPlayer {
    if ((sender as Partial<EntityPlayer>).isPlayerEntity) return sender as unknown as EntityPlayer;
    throw new PlayerNotFoundException('You must specify which player you wish to perform this action on.');
  }

  /** func_82359_c: a selector or a username. */
  static getPlayer(sender: ICommandSender, name: string): EntityPlayer {
    const p = PlayerSelector.matchOnePlayer(sender, name) ?? getServer()?.getPlayers().find((e) => e.getEntityName().toLowerCase() === name.toLowerCase()) ?? null;
    if (!p) throw new PlayerNotFoundException();
    return p;
  }

  /** func_96332_d: a selector's player name, or the text itself. */
  static getPlayerName(sender: ICommandSender, name: string): string {
    const p = PlayerSelector.matchOnePlayer(sender, name);
    if (p) return p.getEntityName();
    if (PlayerSelector.hasArguments(name)) throw new PlayerNotFoundException();
    return name;
  }

  /** func_82360_a / func_82361_a: args from `start` joined by spaces, optionally expanding selectors. */
  static joinArgs(sender: ICommandSender, args: string[], start: number, expandSelectors = false): string {
    const parts: string[] = [];
    for (let i = start; i < args.length; i++) {
      let s = args[i];
      if (expandSelectors) {
        const names = PlayerSelector.matchPlayersAsString(sender, s);
        if (names !== null) s = names;
        else if (PlayerSelector.hasArguments(s)) throw new PlayerNotFoundException();
      }
      parts.push(s);
    }
    return parts.join(' ');
  }

  /** Case-insensitive prefix test. */
  static doesStringStartWith(prefix: string, s: string): boolean {
    return s.length >= prefix.length && s.substring(0, prefix.length).toLowerCase() === prefix.toLowerCase();
  }

  static getListOfStringsMatchingLastWord(args: string[], ...options: string[]): string[] {
    const last = args[args.length - 1];
    return options.filter((o) => CommandBase.doesStringStartWith(last, o));
  }

  static getListOfStringsFromIterableMatchingLastWord(args: string[], options: Iterable<string>): string[] {
    return CommandBase.getListOfStringsMatchingLastWord(args, ...options);
  }

  /** Reports a command's result; flag 1 keeps it from the sender. */
  static notifyAdmins(sender: ICommandSender, key: string, ...args: unknown[]): void {
    CommandBase.notifyAdminsWithFlags(sender, 0, key, ...args);
  }

  static notifyAdminsWithFlags(sender: ICommandSender, flags: number, key: string, ...args: unknown[]): void {
    theAdmin?.notifyAdmins(sender, flags, key, args);
  }

  static setAdminCommander(admin: IAdminCommand): void {
    theAdmin = admin;
  }

  /** Names known to the tab completion (the online players). */
  static getAllUsernames(): string[] {
    return getServer()?.getPlayers().map((p) => p.getEntityName()) ?? [];
  }
}
