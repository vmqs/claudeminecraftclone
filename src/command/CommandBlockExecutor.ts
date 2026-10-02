import { getServer } from './CommandServer';
import type { ICommandSender } from './ICommandSender';

type AnyModule = Record<string, unknown>;

/** The blocks port's command block tile entity, when it exists (found by its module path). */
const commandBlockModule = Object.values(import.meta.glob<AnyModule>('../world/tileentity/TileEntityCommandBlock.ts', { eager: true }))[0];

interface CommandBlockClass {
  executor: ((te: unknown, command: string) => number) | null;
}

/**
 * TileEntityCommandBlock.executeCommandOnPowered: a powered command block runs its command
 * through the server's command manager with itself as the sender (the integrated server always
 * enables command blocks). Installed when a world's command manager starts.
 */
export function installCommandBlockExecutor(): void {
  const cls = commandBlockModule?.TileEntityCommandBlock as CommandBlockClass | undefined;
  if (!cls || cls.executor) return;
  cls.executor = (te, command) => getServer()?.getCommandManager().executeCommand(te as ICommandSender, command) ?? 0;
}

/** Whether a command sender is a command block tile entity. */
export function isCommandBlock(sender: unknown): boolean {
  const cls = commandBlockModule?.TileEntityCommandBlock as (abstract new (...a: never[]) => unknown) | undefined;
  return !!cls && sender instanceof cls;
}
