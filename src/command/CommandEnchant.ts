import type { ItemStack } from '../item/ItemStack';
import { CommandBase } from './CommandBase';
import { NumberInvalidException, WrongUsageException } from './CommandException';
import { type EnchantmentLike, enchantmentsList } from './CommandRegistries';
import type { ICommandSender } from './ICommandSender';

/** The enchantment methods of ItemStack ("ench" list of {id, lvl} in the tag). */
interface EnchantableStack {
  addEnchantment?(e: EnchantmentLike, level: number): void;
  stackTagCompound: { [k: string]: unknown } | null;
}

function enchantmentTagList(stack: ItemStack): { id: number; lvl: number }[] | null {
  const tag = (stack as unknown as EnchantableStack).stackTagCompound;
  const list = tag?.ench;
  return Array.isArray(list) ? (list as { id: number; lvl: number }[]) : null;
}

/** /enchant <player> <enchantment id> [level]: enchants the held item. */
export class CommandEnchant extends CommandBase {
  getCommandName(): string {
    return 'enchant';
  }

  override getRequiredPermissionLevel(): number {
    return 2;
  }

  override getCommandUsage(sender: ICommandSender): string {
    return sender.translateString('commands.enchant.usage');
  }

  processCommand(sender: ICommandSender, args: string[]): void {
    if (args.length < 2) throw new WrongUsageException('commands.enchant.usage');
    const player = CommandBase.getPlayer(sender, args[0]);
    const list = enchantmentsList();
    const id = CommandBase.parseIntBounded(sender, args[1], 0, Math.max(255, list.length - 1));
    let level = 1;
    const stack = player.getCurrentEquippedItem();
    if (!stack) {
      CommandBase.notifyAdmins(sender, 'commands.enchant.noItem');
      return;
    }
    const ench = list[id];
    if (!ench) throw new NumberInvalidException('commands.enchant.notFound', id);
    if (!ench.canApply(stack)) {
      CommandBase.notifyAdmins(sender, 'commands.enchant.cantEnchant');
      return;
    }
    if (args.length >= 3) level = CommandBase.parseIntBounded(sender, args[2], ench.getMinLevel(), ench.getMaxLevel());
    for (const e of enchantmentTagList(stack) ?? []) {
      const other = list[e.id];
      if (other && !other.canApplyTogether(ench)) {
        CommandBase.notifyAdmins(sender, 'commands.enchant.cantCombine', ench.getTranslatedName(level), other.getTranslatedName(e.lvl));
        return;
      }
    }
    const s = stack as unknown as EnchantableStack;
    if (s.addEnchantment) s.addEnchantment(ench, level);
    else {
      s.stackTagCompound ??= {};
      const ench2 = (s.stackTagCompound.ench as { id: number; lvl: number }[] | undefined) ?? [];
      ench2.push({ id, lvl: level });
      s.stackTagCompound.ench = ench2;
    }
    CommandBase.notifyAdmins(sender, 'commands.enchant.success');
  }

  override addTabCompletionOptions(_sender: ICommandSender, args: string[]): string[] | null {
    return args.length === 1 ? CommandBase.getListOfStringsMatchingLastWord(args, ...CommandBase.getAllUsernames()) : null;
  }

  override isUsernameIndex(_args: string[], index: number): boolean {
    return index === 0;
  }
}
