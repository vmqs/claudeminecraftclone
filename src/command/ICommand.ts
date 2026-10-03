import type { ICommandSender } from './ICommandSender';

/** A chat command (ICommand). */
export interface ICommand {
  getCommandName(): string;
  getCommandUsage(sender: ICommandSender): string;
  getCommandAliases(): string[] | null;
  /** Runs the command; failures throw CommandException. */
  processCommand(sender: ICommandSender, args: string[]): void;
  canCommandSenderUseCommand(sender: ICommandSender): boolean;
  addTabCompletionOptions(sender: ICommandSender, args: string[]): string[] | null;
  /** Whether args[index] names a player (so @a can run the command once per player). */
  isUsernameIndex(args: string[], index: number): boolean;
}
