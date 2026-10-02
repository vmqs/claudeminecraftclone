import { CommandBase } from './CommandBase';
import { CommandException, CommandNotFoundException, WrongUsageException } from './CommandException';
import type { ICommand } from './ICommand';
import type { ICommandSender } from './ICommandSender';
import { PlayerSelector } from './PlayerSelector';

/** Java's String.split(" "): trailing empty strings dropped, and no match returns the input. */
export function splitArgs(s: string): string[] {
  if (!s.includes(' ')) return [s];
  const parts = s.split(' ');
  while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return parts;
}

/** Command registry and dispatcher (CommandHandler). */
export class CommandHandler {
  private readonly commandMap = new Map<string, ICommand>();
  private readonly commandSet = new Set<ICommand>();

  /** Runs "/name args..." for the sender and returns how many times it ran (several for @a). */
  executeCommand(sender: ICommandSender, line: string): number {
    line = line.trim();
    if (line.startsWith('/')) line = line.substring(1);
    let args = splitArgs(line);
    const name = args[0];
    args = args.slice(1);
    const cmd = this.commandMap.get(name) ?? null;
    const userIndex = this.getUsernameIndex(cmd, args);
    let runs = 0;
    try {
      if (!cmd) throw new CommandNotFoundException();
      if (!cmd.canCommandSenderUseCommand(sender)) {
        sender.sendChatToPlayer('§cYou do not have permission to use this command.');
        return 0;
      }
      if (userIndex > -1) {
        const token = args[userIndex];
        for (const p of PlayerSelector.matchPlayers(sender, token) ?? []) {
          args[userIndex] = p.getEntityName();
          try {
            cmd.processCommand(sender, args);
            runs++;
          } catch (e) {
            if (!(e instanceof CommandException)) throw e;
            sender.sendChatToPlayer('§c' + sender.translateString(e.message, ...e.errorObjects));
          }
        }
        args[userIndex] = token;
      } else {
        cmd.processCommand(sender, args);
        runs++;
      }
    } catch (e) {
      if (e instanceof WrongUsageException) {
        sender.sendChatToPlayer('§c' + sender.translateString('commands.generic.usage', sender.translateString(e.message, ...e.errorObjects)));
      } else if (e instanceof CommandException) {
        sender.sendChatToPlayer('§c' + sender.translateString(e.message, ...e.errorObjects));
      } else {
        sender.sendChatToPlayer('§c' + sender.translateString('commands.generic.exception'));
        console.error(e);
      }
    }
    return runs;
  }

  /** Adds a command under its name and every alias not already taken by another command's name. */
  registerCommand(cmd: ICommand): ICommand {
    this.commandMap.set(cmd.getCommandName(), cmd);
    this.commandSet.add(cmd);
    for (const alias of cmd.getCommandAliases() ?? []) {
      const existing = this.commandMap.get(alias);
      if (!existing || existing.getCommandName() !== alias) this.commandMap.set(alias, cmd);
    }
    return cmd;
  }

  /** Tab completion for "name args...": command names, or the command's own suggestions. */
  getPossibleCommands(sender: ICommandSender, text: string): string[] | null {
    const parts = text.split(' ');
    const name = parts[0];
    if (parts.length === 1) {
      const out: string[] = [];
      for (const [key, cmd] of this.commandMap) if (CommandBase.doesStringStartWith(name, key) && cmd.canCommandSenderUseCommand(sender)) out.push(key);
      return out;
    }
    const cmd = this.commandMap.get(name);
    return cmd ? cmd.addTabCompletionOptions(sender, parts.slice(1)) : null;
  }

  /** The commands the sender may use. */
  getUsableCommands(sender: ICommandSender): ICommand[] {
    return [...this.commandSet].filter((c) => c.canCommandSenderUseCommand(sender));
  }

  getCommands(): ReadonlyMap<string, ICommand> {
    return this.commandMap;
  }

  private getUsernameIndex(cmd: ICommand | null, args: string[]): number {
    if (!cmd) return -1;
    for (let i = 0; i < args.length; i++) if (cmd.isUsernameIndex(args, i) && PlayerSelector.matchesMultiplePlayers(args[i])) return i;
    return -1;
  }
}
