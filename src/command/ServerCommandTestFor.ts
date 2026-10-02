import { CommandBase } from './CommandBase';
import { CommandException, WrongUsageException } from './CommandException';
import type { ICommandSender } from './ICommandSender';

/** /testfor <player>: only command blocks may use it (their comparator output). */
export class ServerCommandTestFor extends CommandBase {
  getCommandName(): string {
    return 'testfor';
  }

  override getRequiredPermissionLevel(): number {
    return 2;
  }

  processCommand(sender: ICommandSender, args: string[]): void {
    if (args.length !== 1) throw new WrongUsageException('commands.testfor.usage');
    if (!(sender as { isCommandBlock?: boolean }).isCommandBlock) throw new CommandException('commands.testfor.failed');
    CommandBase.getPlayer(sender, args[0]);
  }

  override isUsernameIndex(_args: string[], index: number): boolean {
    return index === 0;
  }
}
