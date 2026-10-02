import { CommandBase } from './CommandBase';
import type { ICommandSender } from './ICommandSender';

/** /publish: opening the world to LAN; a browser tab cannot listen for players, so it fails. */
export class CommandServerPublishLocal extends CommandBase {
  getCommandName(): string {
    return 'publish';
  }

  override getRequiredPermissionLevel(): number {
    return 4;
  }

  processCommand(sender: ICommandSender): void {
    CommandBase.notifyAdmins(sender, 'commands.publish.failed');
  }
}
