import { I18n } from '../core/I18n';
import { CommandBase } from './CommandBase';
import { WrongUsageException } from './CommandException';
import { getServer } from './CommandServer';
import type { ICommandSender } from './ICommandSender';

const DIFFICULTIES = ['options.difficulty.peaceful', 'options.difficulty.easy', 'options.difficulty.normal', 'options.difficulty.hard'];

/**
 * /difficulty <mode>: MinecraftServer.setDifficultyForAllWorlds. As in singleplayer 1.5.2, the
 * next change in the Options screen sets the world's difficulty back to the option.
 */
export class CommandDifficulty extends CommandBase {
  getCommandName(): string {
    return 'difficulty';
  }

  override getRequiredPermissionLevel(): number {
    return 2;
  }

  override getCommandUsage(sender: ICommandSender): string {
    return sender.translateString('commands.difficulty.usage');
  }

  processCommand(sender: ICommandSender, args: string[]): void {
    if (args.length === 0) throw new WrongUsageException('commands.difficulty.usage');
    const d = this.getDifficultyForName(sender, args[0]);
    for (const w of getServer()?.getWorlds() ?? []) w.difficultySetting = w.worldInfo.hardcore ? 3 : d;
    CommandBase.notifyAdmins(sender, 'commands.difficulty.success', I18n.translateToLocal(DIFFICULTIES[d]));
  }

  protected getDifficultyForName(sender: ICommandSender, s: string): number {
    const l = s.toLowerCase();
    if (l === 'peaceful' || l === 'p') return 0;
    if (l === 'easy' || l === 'e') return 1;
    if (l === 'normal' || l === 'n') return 2;
    if (l === 'hard' || l === 'h') return 3;
    return CommandBase.parseIntBounded(sender, s, 0, 3);
  }

  override addTabCompletionOptions(_sender: ICommandSender, args: string[]): string[] | null {
    return args.length === 1 ? CommandBase.getListOfStringsMatchingLastWord(args, 'peaceful', 'easy', 'normal', 'hard') : null;
  }
}
