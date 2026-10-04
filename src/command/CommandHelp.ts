import { CommandBase } from './CommandBase';
import { CommandNotFoundException, NumberInvalidException, WrongUsageException } from './CommandException';
import { getServer } from './CommandServer';
import type { ICommand } from './ICommand';
import type { ICommandSender } from './ICommandSender';

/** /help [page|command]: seven usages per page, sorted by name. */
export class CommandHelp extends CommandBase {
  getCommandName(): string {
    return 'help';
  }

  override getRequiredPermissionLevel(): number {
    return 0;
  }

  override getCommandUsage(sender: ICommandSender): string {
    return sender.translateString('commands.help.usage');
  }

  override getCommandAliases(): string[] {
    return ['?'];
  }

  processCommand(sender: ICommandSender, args: string[]): void {
    const list = this.getSortedPossibleCommands(sender);
    const perPage = 7;
    const lastPage = Math.trunc((list.length - 1) / perPage);
    let page: number;
    try {
      page = args.length === 0 ? 0 : CommandBase.parseIntBounded(sender, args[0], 1, lastPage + 1) - 1;
    } catch (e) {
      if (!(e instanceof NumberInvalidException)) throw e;
      const cmd = getServer()?.getCommandManager().getCommands().get(args[0]);
      if (cmd) throw new WrongUsageException(cmd.getCommandUsage(sender));
      throw new CommandNotFoundException();
    }
    const end = Math.min((page + 1) * perPage, list.length);
    sender.sendChatToPlayer('§2' + sender.translateString('commands.help.header', page + 1, lastPage + 1));
    for (let i = page * perPage; i < end; i++) sender.sendChatToPlayer(list[i].getCommandUsage(sender));
    if (page === 0 && (sender as { isPlayerEntity?: boolean }).isPlayerEntity) sender.sendChatToPlayer('§a' + sender.translateString('commands.help.footer'));
  }

  protected getSortedPossibleCommands(sender: ICommandSender): ICommand[] {
    const list = getServer()?.getCommandManager().getUsableCommands(sender) ?? [];
    return list.sort((a, b) => (a.getCommandName() < b.getCommandName() ? -1 : a.getCommandName() > b.getCommandName() ? 1 : 0));
  }
}
