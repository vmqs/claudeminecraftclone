import { Item } from '../item/Item';
import { ItemStack } from '../item/ItemStack';
import { CommandBase } from './CommandBase';
import { NumberInvalidException, WrongUsageException } from './CommandException';
import type { ICommandSender } from './ICommandSender';

/** /give <player> <id> [amount] [data]: drops the stack at the player with no pickup delay. */
export class CommandGive extends CommandBase {
  getCommandName(): string {
    return 'give';
  }

  override getRequiredPermissionLevel(): number {
    return 2;
  }

  override getCommandUsage(sender: ICommandSender): string {
    return sender.translateString('commands.give.usage');
  }

  processCommand(sender: ICommandSender, args: string[]): void {
    if (args.length < 2) throw new WrongUsageException('commands.give.usage');
    const player = CommandBase.getPlayer(sender, args[0]);
    const id = CommandBase.parseIntWithMin(sender, args[1], 1);
    const item = Item.itemsList[id];
    if (!item) throw new NumberInvalidException('commands.give.notFound', id);
    const count = args.length >= 3 ? CommandBase.parseIntBounded(sender, args[2], 1, 64) : 1;
    const damage = args.length >= 4 ? CommandBase.parseInt(sender, args[3]) : 0;
    const stack = new ItemStack(id, count, damage);
    const dropped = player.dropPlayerItem(stack) as { delayBeforeCanPickup: number } | null;
    if (dropped) dropped.delayBeforeCanPickup = 0;
    CommandBase.notifyAdmins(sender, 'commands.give.success', item.getItemDisplayName(stack), id, count, player.getEntityName());
  }

  override addTabCompletionOptions(_sender: ICommandSender, args: string[]): string[] | null {
    return args.length === 1 ? CommandBase.getListOfStringsMatchingLastWord(args, ...CommandBase.getAllUsernames()) : null;
  }

  override isUsernameIndex(_args: string[], index: number): boolean {
    return index === 0;
  }
}
