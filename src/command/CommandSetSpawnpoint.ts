import type { EntityPlayer } from '../entity/EntityPlayer';
import { ChunkCoordinates } from '../entity/EntityLiving';
import { CommandBase } from './CommandBase';
import { WrongUsageException } from './CommandException';
import type { ICommandSender } from './ICommandSender';

/** The player's own spawn (bed or /spawnpoint): EntityPlayer.setSpawnChunk / getBedLocation. */
interface SpawnHolder {
  setSpawnChunk?(c: ChunkCoordinates | null, forced: boolean): void;
  spawnChunk?: ChunkCoordinates | null;
  spawnForced?: boolean;
}

export function setPlayerSpawn(player: EntityPlayer, c: ChunkCoordinates | null, forced: boolean): void {
  const p = player as unknown as SpawnHolder;
  if (p.setSpawnChunk) p.setSpawnChunk(c, forced);
  else {
    p.spawnChunk = c ? new ChunkCoordinates(c.posX, c.posY, c.posZ) : null;
    p.spawnForced = forced;
  }
}

/** /spawnpoint [player] [x y z] */
export class CommandSetSpawnpoint extends CommandBase {
  getCommandName(): string {
    return 'spawnpoint';
  }

  override getRequiredPermissionLevel(): number {
    return 2;
  }

  override getCommandUsage(sender: ICommandSender): string {
    return sender.translateString('commands.spawnpoint.usage');
  }

  processCommand(sender: ICommandSender, args: string[]): void {
    const player = args.length === 0 ? CommandBase.getCommandSenderAsPlayer(sender) : CommandBase.getPlayer(sender, args[0]);
    if (args.length === 4) {
      if (!player.worldObj) return;
      const max = 30000000;
      const x = CommandBase.parseIntBounded(sender, args[1], -max, max);
      const y = CommandBase.parseIntBounded(sender, args[2], 0, 256);
      const z = CommandBase.parseIntBounded(sender, args[3], -max, max);
      setPlayerSpawn(player, new ChunkCoordinates(x, y, z), true);
      CommandBase.notifyAdmins(sender, 'commands.spawnpoint.success', player.getEntityName(), x, y, z);
      return;
    }
    if (args.length > 1) throw new WrongUsageException('commands.spawnpoint.usage');
    const c = player.getPlayerCoordinates();
    setPlayerSpawn(player, c, true);
    CommandBase.notifyAdmins(sender, 'commands.spawnpoint.success', player.getEntityName(), c.posX, c.posY, c.posZ);
  }

  override addTabCompletionOptions(_sender: ICommandSender, args: string[]): string[] | null {
    return args.length === 1 || args.length === 2 ? CommandBase.getListOfStringsMatchingLastWord(args, ...CommandBase.getAllUsernames()) : null;
  }

  override isUsernameIndex(_args: string[], index: number): boolean {
    return index === 0;
  }
}
