import type { WorldInfo } from '../world/World';
import { CommandBase, joinNiceString } from './CommandBase';
import { WrongUsageException } from './CommandException';
import { getServer } from './CommandServer';
import type { ICommandSender } from './ICommandSender';

/**
 * GameRules keeps strings ("/gamerule doFireTick maybe" is stored as typed and reads as false);
 * the world's boolean table is what the game checks.
 */
const stringValues = new WeakMap<WorldInfo, Map<string, string>>();

function rules(info: WorldInfo): Map<string, string> {
  let m = stringValues.get(info);
  if (!m) {
    m = new Map();
    stringValues.set(info, m);
  }
  for (const [k, v] of Object.entries(info.gameRules)) if (!m.has(k)) m.set(k, String(v));
  return m;
}

/** /gamerule [rule] [value] */
export class CommandGameRule extends CommandBase {
  getCommandName(): string {
    return 'gamerule';
  }

  override getRequiredPermissionLevel(): number {
    return 2;
  }

  override getCommandUsage(sender: ICommandSender): string {
    return sender.translateString('commands.gamerule.usage');
  }

  private info(): WorldInfo | null {
    return getServer()?.getWorlds()[0]?.worldInfo ?? null;
  }

  /** The rule names in TreeMap order. */
  private getRules(): string[] {
    const info = this.info();
    return info ? [...rules(info).keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)) : [];
  }

  processCommand(sender: ICommandSender, args: string[]): void {
    const info = this.info();
    if (!info) return;
    const table = rules(info);
    if (args.length === 2) {
      const [name, value] = args;
      if (table.has(name)) {
        table.set(name, value);
        info.gameRules[name] = value.toLowerCase() === 'true';
        CommandBase.notifyAdmins(sender, 'commands.gamerule.success');
      } else {
        CommandBase.notifyAdmins(sender, 'commands.gamerule.norule', name);
      }
    } else if (args.length === 1) {
      const name = args[0];
      if (table.has(name)) sender.sendChatToPlayer(name + ' = ' + table.get(name));
      else CommandBase.notifyAdmins(sender, 'commands.gamerule.norule', name);
    } else if (args.length === 0) {
      sender.sendChatToPlayer(joinNiceString(this.getRules()));
    } else {
      throw new WrongUsageException('commands.gamerule.usage');
    }
  }

  override addTabCompletionOptions(_sender: ICommandSender, args: string[]): string[] | null {
    if (args.length === 1) return CommandBase.getListOfStringsMatchingLastWord(args, ...this.getRules());
    if (args.length === 2) return CommandBase.getListOfStringsMatchingLastWord(args, 'true', 'false');
    return null;
  }
}
