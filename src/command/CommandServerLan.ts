import { CommandBase, joinNiceString } from './CommandBase';
import { CommandException, PlayerNotFoundException, WrongUsageException } from './CommandException';
import { getServer, type LanCommandHost } from './CommandServer';
import type { ICommandSender } from './ICommandSender';

/**
 * The dedicated server's moderation commands (CommandServerKick, CommandServerBan,
 * CommandServerPardon, CommandServerBanlist, CommandServerWhitelist), for the host of a LAN game
 * (1.5.2 had none on LAN; a room code can leak, so the host gets them). Bans and the whitelist
 * last as long as the room is open. Guests never get these commands (EntityPlayerMP).
 */
function lanHost(): LanCommandHost {
  const lan = getServer()?.lan?.() ?? null;
  if (!lan || !lan.isOpen) throw new CommandException('This needs the world to be open to LAN');
  return lan;
}

/** Names offered by Tab completion: the connected guests. */
function guestNames(): string[] {
  return getServer()?.lan?.()?.guestNames() ?? [];
}

export class CommandServerKick extends CommandBase {
  getCommandName(): string {
    return 'kick';
  }

  override getRequiredPermissionLevel(): number {
    return 3;
  }

  override getCommandUsage(sender: ICommandSender): string {
    return sender.translateString('commands.kick.usage');
  }

  processCommand(sender: ICommandSender, args: string[]): void {
    if (args.length === 0 || args[0].length <= 1) throw new WrongUsageException('commands.kick.usage');
    const lan = lanHost();
    const reason = args.length >= 2 ? CommandBase.joinArgs(sender, args, 1) : '';
    if (!lan.kickPlayer(args[0], reason || 'Kicked by an operator.')) throw new PlayerNotFoundException();
    if (reason) CommandBase.notifyAdmins(sender, 'commands.kick.success.reason', args[0], reason);
    else CommandBase.notifyAdmins(sender, 'commands.kick.success', args[0]);
  }

  override addTabCompletionOptions(_sender: ICommandSender, args: string[]): string[] | null {
    return args.length === 1 ? CommandBase.getListOfStringsMatchingLastWord(args, ...guestNames()) : null;
  }

  override isUsernameIndex(_args: string[], index: number): boolean {
    return index === 0;
  }
}

export class CommandServerBan extends CommandBase {
  getCommandName(): string {
    return 'ban';
  }

  override getRequiredPermissionLevel(): number {
    return 3;
  }

  override getCommandUsage(sender: ICommandSender): string {
    return sender.translateString('commands.ban.usage');
  }

  processCommand(sender: ICommandSender, args: string[]): void {
    if (args.length === 0 || args[0].length === 0) throw new WrongUsageException('commands.ban.usage');
    const lan = lanHost();
    const reason = args.length >= 2 ? CommandBase.joinArgs(sender, args, 1) : 'Banned by an operator.';
    lan.banPlayer(args[0], reason);
    CommandBase.notifyAdmins(sender, 'commands.ban.success', args[0]);
  }

  override addTabCompletionOptions(_sender: ICommandSender, args: string[]): string[] | null {
    return args.length === 1 ? CommandBase.getListOfStringsMatchingLastWord(args, ...guestNames()) : null;
  }
}

export class CommandServerPardon extends CommandBase {
  getCommandName(): string {
    return 'pardon';
  }

  override getRequiredPermissionLevel(): number {
    return 3;
  }

  override getCommandUsage(sender: ICommandSender): string {
    return sender.translateString('commands.unban.usage');
  }

  processCommand(sender: ICommandSender, args: string[]): void {
    if (args.length !== 1 || args[0].length === 0) throw new WrongUsageException('commands.unban.usage');
    if (!lanHost().pardonPlayer(args[0])) throw new PlayerNotFoundException();
    CommandBase.notifyAdmins(sender, 'commands.unban.success', args[0]);
  }

  override addTabCompletionOptions(_sender: ICommandSender, args: string[]): string[] | null {
    return args.length === 1 ? CommandBase.getListOfStringsMatchingLastWord(args, ...(getServer()?.lan?.()?.bannedPlayers() ?? [])) : null;
  }
}

export class CommandServerBanlist extends CommandBase {
  getCommandName(): string {
    return 'banlist';
  }

  override getRequiredPermissionLevel(): number {
    return 3;
  }

  processCommand(sender: ICommandSender): void {
    const names = lanHost().bannedPlayers();
    sender.sendChatToPlayer(sender.translateString('commands.banlist.players', names.length));
    if (names.length > 0) sender.sendChatToPlayer(joinNiceString(names));
  }
}

export class CommandServerWhitelist extends CommandBase {
  getCommandName(): string {
    return 'whitelist';
  }

  override getRequiredPermissionLevel(): number {
    return 3;
  }

  override getCommandUsage(sender: ICommandSender): string {
    return sender.translateString('commands.whitelist.usage');
  }

  processCommand(sender: ICommandSender, args: string[]): void {
    if (args.length < 1) throw new WrongUsageException('commands.whitelist.usage');
    const lan = lanHost();
    const sub = args[0];
    if (sub === 'on') {
      // Everyone already playing stays allowed, so "on" closes the game to new players.
      for (const n of lan.guestNames()) lan.whitelist.add(n.toLowerCase());
      lan.whitelistOn = true;
      CommandBase.notifyAdmins(sender, 'commands.whitelist.enabled');
    } else if (sub === 'off') {
      lan.whitelistOn = false;
      CommandBase.notifyAdmins(sender, 'commands.whitelist.disabled');
    } else if (sub === 'list') {
      const names = [...lan.whitelist];
      sender.sendChatToPlayer(sender.translateString('commands.whitelist.list', names.length, names.length));
      sender.sendChatToPlayer(joinNiceString(names));
    } else if (sub === 'add') {
      if (args.length < 2) throw new WrongUsageException('commands.whitelist.add.usage');
      lan.whitelist.add(args[1].toLowerCase());
      CommandBase.notifyAdmins(sender, 'commands.whitelist.add.success', args[1]);
    } else if (sub === 'remove') {
      if (args.length < 2) throw new WrongUsageException('commands.whitelist.remove.usage');
      lan.whitelist.delete(args[1].toLowerCase());
      CommandBase.notifyAdmins(sender, 'commands.whitelist.remove.success', args[1]);
    } else if (sub === 'reload') {
      CommandBase.notifyAdmins(sender, 'commands.whitelist.reloaded');
    } else {
      throw new WrongUsageException('commands.whitelist.usage');
    }
  }

  override addTabCompletionOptions(_sender: ICommandSender, args: string[]): string[] | null {
    if (args.length === 1) return CommandBase.getListOfStringsMatchingLastWord(args, 'on', 'off', 'list', 'add', 'remove', 'reload');
    if (args.length === 2 && args[0] === 'add') return CommandBase.getListOfStringsMatchingLastWord(args, ...guestNames());
    if (args.length === 2 && args[0] === 'remove') return CommandBase.getListOfStringsMatchingLastWord(args, ...(getServer()?.lan?.()?.whitelist ?? []));
    return null;
  }
}
