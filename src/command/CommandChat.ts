import { CommandBase } from './CommandBase';
import { PlayerNotFoundException, WrongUsageException } from './CommandException';
import { getServer } from './CommandServer';
import type { ICommandSender } from './ICommandSender';

/** /say <message>: "[sender] message" to everyone (CommandServerSay). */
export class CommandServerSay extends CommandBase {
  getCommandName(): string {
    return 'say';
  }

  override getRequiredPermissionLevel(): number {
    return 1;
  }

  override getCommandUsage(sender: ICommandSender): string {
    return sender.translateString('commands.say.usage');
  }

  processCommand(sender: ICommandSender, args: string[]): void {
    if (args.length === 0 || args[0].length === 0) throw new WrongUsageException('commands.say.usage');
    const msg = CommandBase.joinArgs(sender, args, 0, true);
    getServer()?.sendChatMsg(`[${sender.getCommandSenderName()}] ${msg}`);
  }

  override addTabCompletionOptions(_sender: ICommandSender, args: string[]): string[] | null {
    return args.length >= 1 ? CommandBase.getListOfStringsMatchingLastWord(args, ...CommandBase.getAllUsernames()) : null;
  }
}

/** /me <action>: "* sender action" (CommandServerEmote). */
export class CommandServerEmote extends CommandBase {
  getCommandName(): string {
    return 'me';
  }

  override getRequiredPermissionLevel(): number {
    return 0;
  }

  override getCommandUsage(sender: ICommandSender): string {
    return sender.translateString('commands.me.usage');
  }

  processCommand(sender: ICommandSender, args: string[]): void {
    if (args.length === 0) throw new WrongUsageException('commands.me.usage');
    const msg = CommandBase.joinArgs(sender, args, 0, sender.canCommandSenderUseCommand(1, 'me'));
    getServer()?.sendChatMsg(`* ${sender.getCommandSenderName()} ${msg}`);
  }

  override addTabCompletionOptions(_sender: ICommandSender, args: string[]): string[] | null {
    return CommandBase.getListOfStringsMatchingLastWord(args, ...CommandBase.getAllUsernames());
  }
}

/** /tell <player> <message> (aliases w, msg) (CommandServerMessage). */
export class CommandServerMessage extends CommandBase {
  override getCommandAliases(): string[] {
    return ['w', 'msg'];
  }

  getCommandName(): string {
    return 'tell';
  }

  override getRequiredPermissionLevel(): number {
    return 0;
  }

  processCommand(sender: ICommandSender, args: string[]): void {
    if (args.length < 2) throw new WrongUsageException('commands.message.usage');
    const target = CommandBase.getPlayer(sender, args[0]);
    if ((target as unknown) === sender) throw new PlayerNotFoundException('commands.message.sameTarget');
    const msg = CommandBase.joinArgs(sender, args, 1, !(sender as { isPlayerEntity?: boolean }).isPlayerEntity);
    target.sendChatToPlayer('§7§o' + target.translateString('commands.message.display.incoming', sender.getCommandSenderName(), msg));
    sender.sendChatToPlayer('§7§o' + sender.translateString('commands.message.display.outgoing', target.getCommandSenderName(), msg));
  }

  override addTabCompletionOptions(_sender: ICommandSender, args: string[]): string[] | null {
    return CommandBase.getListOfStringsMatchingLastWord(args, ...CommandBase.getAllUsernames());
  }

  override isUsernameIndex(_args: string[], index: number): boolean {
    return index === 0;
  }
}
