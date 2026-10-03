import { TileEntityCommandBlock } from '../world/tileentity/TileEntityCommandBlock';
import { getServer } from './CommandServer';
import type { ICommandSender } from './ICommandSender';

/**
 * TileEntityCommandBlock.executeCommandOnPowered: a powered command block runs its command
 * through the server's command manager with itself as the sender (the integrated server always
 * enables command blocks). Installed when a world's command manager starts.
 */
export function installCommandBlockExecutor(): void {
  if (TileEntityCommandBlock.executor) return;
  TileEntityCommandBlock.executor = (te, command) => getServer()?.getCommandManager().executeCommand(te as unknown as ICommandSender, command) ?? 0;
}

/** Whether a command sender is a command block tile entity. */
export function isCommandBlock(sender: unknown): boolean {
  return sender instanceof TileEntityCommandBlock;
}
