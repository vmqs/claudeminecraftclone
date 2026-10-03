import { JavaRandom } from '../core/JavaRandom';
import { CommandBase } from './CommandBase';
import { WrongUsageException } from './CommandException';
import { getServer } from './CommandServer';
import type { ICommandSender } from './ICommandSender';

/** /toggledownfall: rain flips on the next tick; thunder is armed too. */
export class CommandToggleDownfall extends CommandBase {
  getCommandName(): string {
    return 'toggledownfall';
  }

  override getRequiredPermissionLevel(): number {
    return 2;
  }

  processCommand(sender: ICommandSender): void {
    const w = getServer()?.getWorlds()[0];
    if (w) {
      w.toggleRain();
      w.worldInfo.thundering = true;
    }
    CommandBase.notifyAdmins(sender, 'commands.downfall.success');
  }
}

/** /weather <clear|rain|thunder> [seconds]: sets the weather and how long it lasts. */
export class CommandWeather extends CommandBase {
  getCommandName(): string {
    return 'weather';
  }

  override getRequiredPermissionLevel(): number {
    return 2;
  }

  processCommand(sender: ICommandSender, args: string[]): void {
    if (args.length < 1) throw new WrongUsageException('commands.weather.usage');
    let ticks = (300 + new JavaRandom().nextInt(600)) * 20;
    if (args.length >= 2) ticks = CommandBase.parseIntBounded(sender, args[1], 1, 1000000) * 20;
    const w = getServer()?.getWorlds()[0];
    if (!w) return;
    const info = w.worldInfo;
    info.rainTime = ticks;
    info.thunderTime = ticks;
    const type = args[0].toLowerCase();
    if (type === 'clear') {
      info.raining = false;
      info.thundering = false;
      CommandBase.notifyAdmins(sender, 'commands.weather.clear');
    } else if (type === 'rain') {
      info.raining = true;
      info.thundering = false;
      CommandBase.notifyAdmins(sender, 'commands.weather.rain');
    } else if (type === 'thunder') {
      info.raining = true;
      info.thundering = true;
      CommandBase.notifyAdmins(sender, 'commands.weather.thunder');
    }
  }

  override addTabCompletionOptions(_sender: ICommandSender, args: string[]): string[] | null {
    return args.length === 1 ? CommandBase.getListOfStringsMatchingLastWord(args, 'clear', 'rain', 'thunder') : null;
  }
}
