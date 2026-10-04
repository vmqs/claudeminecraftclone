import type { EntityPlayer } from '../entity/EntityPlayer';
import { CommandBase } from './CommandBase';
import { getServer } from './CommandServer';
import type { ICommandSender } from './ICommandSender';

/** /seed: always allowed in single player. */
export class CommandShowSeed extends CommandBase {
  override canCommandSenderUseCommand(sender: ICommandSender): boolean {
    return getServer()?.isSinglePlayer() === true || super.canCommandSenderUseCommand(sender);
  }

  getCommandName(): string {
    return 'seed';
  }

  override getRequiredPermissionLevel(): number {
    return 2;
  }

  processCommand(sender: ICommandSender): void {
    const p = sender as Partial<EntityPlayer>;
    const world = p.isPlayerEntity ? p.worldObj! : getServer()?.getWorlds()[0];
    if (world) sender.sendChatToPlayer('Seed: ' + world.getSeed());
  }
}
