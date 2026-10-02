import { CommandBase } from './CommandBase';
import { CommandException } from './CommandException';
import type { ICommandSender } from './ICommandSender';

/** /clear [player] [item] [data] */
export class CommandClearInventory extends CommandBase {
  getCommandName(): string {
    return 'clear';
  }

  override getCommandUsage(sender: ICommandSender): string {
    return sender.translateString('commands.clear.usage');
  }

  override getRequiredPermissionLevel(): number {
    return 2;
  }

  processCommand(sender: ICommandSender, args: string[]): void {
    const player = args.length === 0 ? CommandBase.getCommandSenderAsPlayer(sender) : CommandBase.getPlayer(sender, args[0]);
    const id = args.length >= 2 ? CommandBase.parseIntWithMin(sender, args[1], 1) : -1;
    const data = args.length >= 3 ? CommandBase.parseIntWithMin(sender, args[2], 0) : -1;
    const n = player.inventory.clearInventory(id, data);
    player.inventoryContainer.detectAndSendChanges();
    if (n === 0) throw new CommandException('commands.clear.failure', player.getEntityName());
    CommandBase.notifyAdmins(sender, 'commands.clear.success', player.getEntityName(), n);
  }

  override addTabCompletionOptions(_sender: ICommandSender, args: string[]): string[] | null {
    return args.length === 1 ? CommandBase.getListOfStringsMatchingLastWord(args, ...CommandBase.getAllUsernames()) : null;
  }

  override isUsernameIndex(_args: string[], index: number): boolean {
    return index === 0;
  }
}
