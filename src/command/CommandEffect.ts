import { I18n } from '../core/I18n';
import { CommandBase } from './CommandBase';
import { CommandException, NumberInvalidException, WrongUsageException } from './CommandException';
import { potionEffectClass, potionTypes } from './CommandRegistries';
import type { ICommandSender } from './ICommandSender';

/** The potion methods of EntityLiving. */
interface PotionHolder {
  addPotionEffect?(effect: unknown): void;
  isPotionActive?(id: number): boolean;
  removePotionEffect?(id: number): void;
}

/** /effect <player> <effect> [seconds] [amplifier]; 0 seconds removes the effect. */
export class CommandEffect extends CommandBase {
  getCommandName(): string {
    return 'effect';
  }

  override getRequiredPermissionLevel(): number {
    return 2;
  }

  override getCommandUsage(sender: ICommandSender): string {
    return sender.translateString('commands.effect.usage');
  }

  processCommand(sender: ICommandSender, args: string[]): void {
    if (args.length < 2) throw new WrongUsageException('commands.effect.usage');
    const player = CommandBase.getPlayer(sender, args[0]);
    const id = CommandBase.parseIntWithMin(sender, args[1], 1);
    const potion = potionTypes()[id];
    const Effect = potionEffectClass();
    if (!potion || !Effect) throw new NumberInvalidException('commands.effect.notFound', id);
    let duration = 600;
    let seconds = 30;
    let amplifier = 0;
    if (args.length >= 3) {
      seconds = CommandBase.parseIntBounded(sender, args[2], 0, 1000000);
      duration = potion.isInstant() ? seconds : seconds * 20;
    } else if (potion.isInstant()) {
      duration = 1;
    }
    if (args.length >= 4) amplifier = CommandBase.parseIntBounded(sender, args[3], 0, 255);
    const holder = player as unknown as PotionHolder;
    const name = I18n.translateToLocal(potion.getName());
    if (seconds === 0) {
      if (!holder.isPotionActive?.(id)) throw new CommandException('commands.effect.failure.notActive', name, player.getEntityName());
      holder.removePotionEffect?.(id);
      CommandBase.notifyAdmins(sender, 'commands.effect.success.removed', name, player.getEntityName());
    } else {
      const effect = new Effect(id, duration, amplifier);
      holder.addPotionEffect?.(effect);
      CommandBase.notifyAdmins(sender, 'commands.effect.success', I18n.translateToLocal(effect.getEffectName()), id, amplifier, player.getEntityName(), seconds);
    }
  }

  override addTabCompletionOptions(_sender: ICommandSender, args: string[]): string[] | null {
    return args.length === 1 ? CommandBase.getListOfStringsMatchingLastWord(args, ...CommandBase.getAllUsernames()) : null;
  }

  override isUsernameIndex(_args: string[], index: number): boolean {
    return index === 0;
  }
}
