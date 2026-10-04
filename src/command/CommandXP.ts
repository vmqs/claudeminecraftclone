import type { EntityPlayer } from '../entity/EntityPlayer';
import { CommandBase } from './CommandBase';
import { WrongUsageException } from './CommandException';
import type { ICommandSender } from './ICommandSender';

/** The experience methods of EntityPlayer, used when the player class does not provide them. */
interface ExperiencePlayer {
  addExperience?(n: number): void;
  addExperienceLevel?(n: number): void;
  addScore?(n: number): void;
  experienceLevel: number;
  experienceTotal: number;
  experience: number;
}

/** xpBarCap: experience points for the current level. */
function xpBarCap(p: ExperiencePlayer): number {
  const l = p.experienceLevel;
  return l >= 30 ? 62 + (l - 30) * 7 : l >= 15 ? 17 + (l - 15) * 3 : 17;
}

function addExperienceLevel(player: EntityPlayer, n: number): void {
  const p = player as unknown as ExperiencePlayer;
  if (p.addExperienceLevel) {
    p.addExperienceLevel(n);
    return;
  }
  p.experienceLevel += n;
  if (p.experienceLevel < 0) {
    p.experienceLevel = 0;
    p.experience = 0;
    p.experienceTotal = 0;
  }
  if (n > 0 && p.experienceLevel % 5 === 0) {
    const v = p.experienceLevel > 30 ? 1 : p.experienceLevel / 30;
    player.worldObj.playSoundAtEntity(player, 'random.levelup', Math.fround(v * 0.75), 1);
  }
}

function addExperience(player: EntityPlayer, n: number): void {
  const p = player as unknown as ExperiencePlayer;
  if (p.addExperience) {
    p.addExperience(n);
    return;
  }
  p.addScore?.(n);
  const room = 0x7fffffff - p.experienceTotal;
  if (n > room) n = room;
  p.experience = Math.fround(p.experience + Math.fround(n / xpBarCap(p)));
  p.experienceTotal += n;
  while (p.experience >= 1) {
    p.experience = Math.fround((p.experience - 1) * xpBarCap(p));
    addExperienceLevel(player, 1);
    p.experience = Math.fround(p.experience / xpBarCap(p));
  }
}

/** /xp <amount>[L] [player] */
export class CommandXP extends CommandBase {
  getCommandName(): string {
    return 'xp';
  }

  override getRequiredPermissionLevel(): number {
    return 2;
  }

  override getCommandUsage(sender: ICommandSender): string {
    return sender.translateString('commands.xp.usage');
  }

  processCommand(sender: ICommandSender, args: string[]): void {
    if (args.length <= 0) throw new WrongUsageException('commands.xp.usage');
    let s = args[0];
    const levels = s.endsWith('l') || s.endsWith('L');
    if (levels && s.length > 1) s = s.substring(0, s.length - 1);
    let n = CommandBase.parseInt(sender, s);
    const negative = n < 0;
    if (negative) n = -n;
    const player = args.length > 1 ? CommandBase.getPlayer(sender, args[1]) : CommandBase.getCommandSenderAsPlayer(sender);
    if (levels) {
      if (negative) {
        addExperienceLevel(player, -n);
        CommandBase.notifyAdmins(sender, 'commands.xp.success.negative.levels', n, player.getEntityName());
      } else {
        addExperienceLevel(player, n);
        CommandBase.notifyAdmins(sender, 'commands.xp.success.levels', n, player.getEntityName());
      }
    } else {
      if (negative) throw new WrongUsageException('commands.xp.failure.widthdrawXp');
      addExperience(player, n);
      CommandBase.notifyAdmins(sender, 'commands.xp.success', n, player.getEntityName());
    }
  }

  override addTabCompletionOptions(_sender: ICommandSender, args: string[]): string[] | null {
    return args.length === 2 ? CommandBase.getListOfStringsMatchingLastWord(args, ...CommandBase.getAllUsernames()) : null;
  }

  override isUsernameIndex(_args: string[], index: number): boolean {
    return index === 1;
  }
}
