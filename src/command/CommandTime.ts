import { CommandBase } from './CommandBase';
import { WrongUsageException } from './CommandException';
import { getServer } from './CommandServer';
import type { ICommandSender } from './ICommandSender';

/** /time set <value|day|night>, /time add <value>. */
export class CommandTime extends CommandBase {
  getCommandName(): string {
    return 'time';
  }

  override getRequiredPermissionLevel(): number {
    return 2;
  }

  override getCommandUsage(sender: ICommandSender): string {
    return sender.translateString('commands.time.usage');
  }

  processCommand(sender: ICommandSender, args: string[]): void {
    if (args.length > 1) {
      if (args[0] === 'set') {
        const t = args[1] === 'day' ? 0 : args[1] === 'night' ? 12500 : CommandBase.parseIntWithMin(sender, args[1], 0);
        this.setTime(t);
        CommandBase.notifyAdmins(sender, 'commands.time.set', t);
        return;
      }
      if (args[0] === 'add') {
        const t = CommandBase.parseIntWithMin(sender, args[1], 0);
        this.addTime(t);
        CommandBase.notifyAdmins(sender, 'commands.time.added', t);
        return;
      }
    }
    throw new WrongUsageException('commands.time.usage');
  }

  override addTabCompletionOptions(_sender: ICommandSender, args: string[]): string[] | null {
    if (args.length === 1) return CommandBase.getListOfStringsMatchingLastWord(args, 'set', 'add');
    if (args.length === 2 && args[0] === 'set') return CommandBase.getListOfStringsMatchingLastWord(args, 'day', 'night');
    return null;
  }

  protected setTime(t: number): void {
    for (const w of getServer()?.getWorlds() ?? []) w.setWorldTime(t);
  }

  protected addTime(t: number): void {
    for (const w of getServer()?.getWorlds() ?? []) w.setWorldTime(w.getWorldTime() + t);
  }
}
