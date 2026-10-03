import type { ChunkCoordinates } from '../entity/EntityLiving';

/** Whoever runs a command (ICommandSender): the player here; command blocks later. */
export interface ICommandSender {
  getCommandSenderName(): string;
  sendChatToPlayer(msg: string): void;
  /** Permission check for `command` at op level `level`. */
  canCommandSenderUseCommand(level: number, command: string): boolean;
  /** StringTranslate.translateKeyFormat in the sender's language. */
  translateString(key: string, ...args: unknown[]): string;
  getPlayerCoordinates(): ChunkCoordinates;
}
