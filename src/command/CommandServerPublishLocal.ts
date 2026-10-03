import { CommandBase } from './CommandBase';
import { getServer } from './CommandServer';
import type { ICommandSender } from './ICommandSender';

/** /publish: opens the world to LAN for Survival players without cheats (IntegratedServer.shareToLAN). */
export class CommandServerPublishLocal extends CommandBase {
  getCommandName(): string {
    return 'publish';
  }

  override getRequiredPermissionLevel(): number {
    return 4;
  }

  processCommand(sender: ICommandSender): void {
    const lan = getServer()?.lan?.() ?? null;
    if (!lan) {
      CommandBase.notifyAdmins(sender, 'commands.publish.failed');
      return;
    }
    // Opening the room takes a moment (the signalling relays); the result follows in chat.
    lan.publish().then(
      (code) => CommandBase.notifyAdmins(sender, 'commands.publish.started', `room ${code}`),
      () => CommandBase.notifyAdmins(sender, 'commands.publish.failed'),
    );
  }
}
