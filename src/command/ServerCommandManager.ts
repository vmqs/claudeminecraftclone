import { CommandBase, type IAdminCommand } from './CommandBase';
import { CommandServerEmote, CommandServerMessage, CommandServerSay } from './CommandChat';
import { CommandClearInventory } from './CommandClearInventory';
import { CommandDebug, DebugHooks } from './CommandDebug';
import { CommandDifficulty } from './CommandDifficulty';
import { CommandEffect } from './CommandEffect';
import { CommandEnchant } from './CommandEnchant';
import { CommandDefaultGameMode, CommandGameMode } from './CommandGameMode';
import { CommandGameRule } from './CommandGameRule';
import { CommandGive } from './CommandGive';
import { CommandHandler } from './CommandHandler';
import { CommandHelp } from './CommandHelp';
import { CommandKill } from './CommandKill';
import { CommandServerPublishLocal } from './CommandServerPublishLocal';
import { CommandServerTp } from './CommandServerTp';
import { CommandSetSpawnpoint } from './CommandSetSpawnpoint';
import { CommandShowSeed } from './CommandShowSeed';
import { CommandTime } from './CommandTime';
import { CommandToggleDownfall, CommandWeather } from './CommandWeather';
import { CommandXP } from './CommandXP';
import { getServer } from './CommandServer';
import { ServerCommandTestFor } from './ServerCommandTestFor';
import type { ICommand } from './ICommand';
import type { ICommandSender } from './ICommandSender';

/**
 * The integrated server's commands (ServerCommandManager), in the original's order. Other
 * modules can add commands with ServerCommandManager.addCommand before a world starts.
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
    this.registerCommand(new CommandGameMode());
    this.registerCommand(new CommandDifficulty());
    this.registerCommand(new CommandDefaultGameMode());
    this.registerCommand(new CommandKill());
    this.registerCommand(new CommandToggleDownfall());
    this.registerCommand(new CommandWeather());
    this.registerCommand(new CommandXP());
    this.registerCommand(new CommandServerTp());
    this.registerCommand(new CommandGive());
    this.registerCommand(new CommandEffect());
    this.registerCommand(new CommandEnchant());
    this.registerCommand(new CommandServerEmote());
    this.registerCommand(new CommandShowSeed());
    this.registerCommand(new CommandHelp());
    this.registerCommand(new CommandDebug());
    this.registerCommand(new CommandServerMessage());
    this.registerCommand(new CommandServerSay());
    this.registerCommand(new CommandSetSpawnpoint());
    this.registerCommand(new CommandGameRule());
    this.registerCommand(new CommandClearInventory());
    this.registerCommand(new ServerCommandTestFor());
    this.registerCommand(new CommandServerPublishLocal());
    DebugHooks.getTickCounter = () => getServer()?.getWorlds()[0]?.worldInfo.totalTime ?? 0;
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
