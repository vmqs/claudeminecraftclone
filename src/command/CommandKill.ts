import { DamageSource } from '../entity/DamageSource';
import { CommandBase } from './CommandBase';
import type { ICommandSender } from './ICommandSender';

/** /kill: out-of-world damage, which also kills in Creative. */
export class CommandKill extends CommandBase {
  getCommandName(): string {
    return 'kill';
  }

  override getRequiredPermissionLevel(): number {
    return 0;
  }

  processCommand(sender: ICommandSender): void {
    CommandBase.getCommandSenderAsPlayer(sender).attackEntityFrom(DamageSource.outOfWorld, 1000);
    sender.sendChatToPlayer('Ouch. That looks like it hurt.');
  }
}
