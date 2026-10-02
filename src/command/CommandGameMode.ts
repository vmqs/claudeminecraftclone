import { I18n } from '../core/I18n';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { CommandBase } from './CommandBase';
import { WrongUsageException } from './CommandException';
import { getServer } from './CommandServer';
import type { ICommandSender } from './ICommandSender';

/** EnumGameType by id: 0 survival, 1 creative, 2 adventure. */
export const GAME_TYPE_NAMES = ['survival', 'creative', 'adventure'];

/** /gamemode <mode> [player] */
export class CommandGameMode extends CommandBase {
  getCommandName(): string {
    return 'gamemode';
  }

  override getRequiredPermissionLevel(): number {
    return 2;
  }

  override getCommandUsage(sender: ICommandSender): string {
    return sender.translateString('commands.gamemode.usage');
  }

  processCommand(sender: ICommandSender, args: string[]): void {
    if (args.length === 0) throw new WrongUsageException('commands.gamemode.usage');
    const mode = this.getGameModeFromCommand(sender, args[0]);
    const player = args.length >= 2 ? CommandBase.getPlayer(sender, args[1]) : CommandBase.getCommandSenderAsPlayer(sender);
    CommandGameMode.setGameType(player, mode);
    player.fallDistance = 0;
    const name = I18n.translateToLocal('gameMode.' + GAME_TYPE_NAMES[mode]);
    if ((player as unknown) !== sender) CommandBase.notifyAdminsWithFlags(sender, 1, 'commands.gamemode.success.other', player.getEntityName(), name);
    else CommandBase.notifyAdminsWithFlags(sender, 1, 'commands.gamemode.success.self', name);
  }

  /** Told when a player's game mode changes (the client's PlayerController follows it). */
  static gameTypeListener: ((player: EntityPlayer, mode: number) => void) | null = null;

  /**
   * EntityPlayerMP.setGameType: the capabilities of the mode, then Packet70GameEvent 3, which
   * the client answers with "Your game mode has been updated".
   */
  static setGameType(player: EntityPlayer, mode: number): void {
    CommandGameMode.applyGameType(player, mode);
    player.addChatMessage('gameMode.changed');
  }

  /**
   * EnumGameType.configurePlayerCapabilities without the chat line: a player joining or
   * respawning in a world gets its mode this way (ServerConfigurationManager.setPlayerGameTypeBasedOnOther).
   */
  static applyGameType(player: EntityPlayer, mode: number): void {
    const caps = player.capabilities;
    caps.allowFlying = caps.isCreativeMode = caps.disableDamage = mode === 1;
    caps.allowEdit = mode !== 2;
    if (mode !== 1) caps.isFlying = false;
    CommandGameMode.gameTypeListener?.(player, mode);
  }

  /** The player's current EnumGameType id, read back from its capabilities. */
  static gameTypeOf(player: EntityPlayer): number {
    const caps = player.capabilities;
    return caps.isCreativeMode ? 1 : caps.allowEdit ? 0 : 2;
  }

  protected getGameModeFromCommand(sender: ICommandSender, s: string): number {
    const lower = s.toLowerCase();
    if (lower === 'survival' || lower === 's') return 0;
    if (lower === 'creative' || lower === 'c') return 1;
    if (lower === 'adventure' || lower === 'a') return 2;
    return CommandBase.parseIntBounded(sender, s, 0, 2);
  }

  override addTabCompletionOptions(_sender: ICommandSender, args: string[]): string[] | null {
    if (args.length === 1) return CommandBase.getListOfStringsMatchingLastWord(args, 'survival', 'creative', 'adventure');
    if (args.length === 2) return CommandBase.getListOfStringsMatchingLastWord(args, ...CommandBase.getAllUsernames());
    return null;
  }

  override isUsernameIndex(_args: string[], index: number): boolean {
    return index === 1;
  }
}

/** /defaultgamemode <mode>: the mode new players get (MinecraftServer.setGameType). */
export class CommandDefaultGameMode extends CommandGameMode {
  override getCommandName(): string {
    return 'defaultgamemode';
  }

  override getCommandUsage(sender: ICommandSender): string {
    return sender.translateString('commands.defaultgamemode.usage');
  }

  override processCommand(sender: ICommandSender, args: string[]): void {
    if (args.length === 0) throw new WrongUsageException('commands.defaultgamemode.usage');
    const mode = this.getGameModeFromCommand(sender, args[0]);
    for (const w of getServer()?.getWorlds() ?? []) w.worldInfo.gameType = mode;
    CommandBase.notifyAdmins(sender, 'commands.defaultgamemode.success', I18n.translateToLocal('gameMode.' + GAME_TYPE_NAMES[mode]));
  }

  override isUsernameIndex(): boolean {
    return false;
  }
}
