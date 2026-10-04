import { CommandBase } from './CommandBase';
import { NumberInvalidException, PlayerNotFoundException, WrongUsageException } from './CommandException';
import type { ICommandSender } from './ICommandSender';

/** /tp [player] <player> and /tp [player] <x> <y> <z>, with ~ for relative coordinates. */
export class CommandServerTp extends CommandBase {
  getCommandName(): string {
    return 'tp';
  }

  override getRequiredPermissionLevel(): number {
    return 2;
  }

  override getCommandUsage(sender: ICommandSender): string {
    return sender.translateString('commands.tp.usage');
  }

  processCommand(sender: ICommandSender, args: string[]): void {
    if (args.length < 1) throw new WrongUsageException('commands.tp.usage');
    const target = args.length === 2 || args.length === 4 ? CommandBase.getPlayer(sender, args[0]) : CommandBase.getCommandSenderAsPlayer(sender);
    if (args.length === 3 || args.length === 4) {
      let i = args.length - 3;
      const x = this.parseCoordinate(sender, target.posX, args[i++]);
      const y = this.parseCoordinateBounded(sender, target.boundingBox.minY, args[i++], 0, 0);
      const z = this.parseCoordinate(sender, target.posZ, args[i++]);
      target.mountEntity(null);
      target.setPositionAndUpdate(x, y, z);
      CommandBase.notifyAdmins(sender, 'commands.tp.success.coordinates', target.getEntityName(), x, y, z);
    } else if (args.length === 1 || args.length === 2) {
      const dest = CommandBase.getPlayer(sender, args[args.length - 1]);
      if (!dest) throw new PlayerNotFoundException();
      if (dest.worldObj !== target.worldObj) {
        CommandBase.notifyAdmins(sender, 'commands.tp.notSameDimension');
        return;
      }
      target.mountEntity(null);
      target.setPlayerLocation(dest.posX, dest.boundingBox.minY, dest.posZ, dest.rotationYaw, dest.rotationPitch);
      CommandBase.notifyAdmins(sender, 'commands.tp.success', target.getEntityName(), dest.getEntityName());
    }
  }

  /** func_82368_a */
  private parseCoordinate(sender: ICommandSender, current: number, s: string): number {
    return this.parseCoordinateBounded(sender, current, s, -30000000, 30000000);
  }

  /** func_82367_a: "~" is relative; whole numbers are block centres (+0.5). */
  private parseCoordinateBounded(sender: ICommandSender, current: number, s: string, min: number, max: number): number {
    const relative = s.startsWith('~');
    let v = relative ? current : 0;
    if (!relative || s.length > 1) {
      const hasDot = s.includes('.');
      if (relative) s = s.substring(1);
      v += CommandBase.parseDouble(sender, s);
      if (!hasDot && !relative) v += 0.5;
    }
    if (min !== 0 || max !== 0) {
      if (v < min) throw new NumberInvalidException('commands.generic.double.tooSmall', v, min);
      if (v > max) throw new NumberInvalidException('commands.generic.double.tooBig', v, max);
    }
    return v;
  }

  override addTabCompletionOptions(_sender: ICommandSender, args: string[]): string[] | null {
    return args.length === 1 || args.length === 2 ? CommandBase.getListOfStringsMatchingLastWord(args, ...CommandBase.getAllUsernames()) : null;
  }

  override isUsernameIndex(_args: string[], index: number): boolean {
    return index === 0;
  }
}
