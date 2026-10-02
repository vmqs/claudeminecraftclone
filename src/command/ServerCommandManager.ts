import { CommandBase, type IAdminCommand } from './CommandBase';
import { CommandServerEmote, CommandServerMessage, CommandServerSay } from './CommandChat';
import { CommandGive } from './CommandGive';
import { CommandHandler } from './CommandHandler';
import { CommandHelp } from './CommandHelp';
import { CommandKill } from './CommandKill';
import { CommandServerTp } from './CommandServerTp';
import { CommandShowSeed } from './CommandShowSeed';
import { CommandTime } from './CommandTime';
import { getServer } from './CommandServer';
import type { ICommand } from './ICommand';
import type { ICommandSender } from './ICommandSender';

/**
 * The integrated server's commands (ServerCommandManager). Commands not ported yet register
 * here with ServerCommandManager.addCommand before a world starts.
 */
export class ServerCommandManager extends CommandHandler implements IAdminCommand {
  private static readonly extraCommands: (() => ICommand)[] = [];

  /** Registers a command factory for every ServerCommandManager created afterwards. */
  static addCommand(factory: () => ICommand): void {
    ServerCommandManager.extraCommands.push(factory);
  }

  constructor() {
    super();
    this.registerCommand(new CommandTime());
    this.registerCommand(new CommandKill());
    this.registerCommand(new CommandServerTp());
    this.registerCommand(new CommandGive());
    this.registerCommand(new CommandServerEmote());
    this.registerCommand(new CommandShowSeed());
    this.registerCommand(new CommandHelp());
    this.registerCommand(new CommandServerMessage());
    this.registerCommand(new CommandServerSay());
    for (const f of ServerCommandManager.extraCommands) this.registerCommand(f());
    CommandBase.setAdminCommander(this);
  }

  /** Other players with commands see "[sender: message]" in grey; the sender sees it unless flag 1. */
  notifyAdmins(sender: ICommandSender, flags: number, key: string, args: unknown[]): void {
    for (const p of getServer()?.getPlayers() ?? []) {
      if ((p as unknown) !== sender) p.sendChatToPlayer(`§7§o[${sender.getCommandSenderName()}: ${p.translateString(key, ...args)}]`);
    }
    console.info(`[${sender.getCommandSenderName()}: ${sender.translateString(key, ...args)}]`);
    if ((flags & 1) !== 1) sender.sendChatToPlayer(sender.translateString(key, ...args));
  }
}
