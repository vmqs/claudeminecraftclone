import type { EntityPlayer } from '../entity/EntityPlayer';
import type { World } from '../world/World';
import type { CommandHandler } from './CommandHandler';

/**
 * What commands need from the game (the parts of MinecraftServer they used): the worlds, the
 * players, and broadcasting chat. The client registers itself with setServer when a world starts.
 */
export interface CommandServer {
  getWorlds(): World[];
  getPlayers(): EntityPlayer[];
  /** ServerConfigurationManager.sendChatMsg: a chat line for every player. */
  sendChatMsg(msg: string): void;
  isSinglePlayer(): boolean;
  getCommandManager(): CommandHandler;
  /** The LAN game's moderation (host only), when the world can be or is open to LAN. */
  lan?(): LanCommandHost | null;
}

/** What /publish, /kick, /ban, /pardon, /banlist and /whitelist need from a LAN host. */
export interface LanCommandHost {
  /** Whether the world is open to LAN now. */
  readonly isOpen: boolean;
  /** /publish: opens the world to LAN (Survival, no cheats) and resolves with the room code as shown. */
  publish(): Promise<string>;
  /** Names of the connected guests. */
  guestNames(): string[];
  /** Disconnects a guest; false when no guest has that name. */
  kickPlayer(name: string, reason: string): boolean;
  /** Keeps a name out for the session (and kicks it, with its browser tab, when connected). */
  banPlayer(name: string, reason: string): void;
  /** Lifts a ban; false when the name was not banned. */
  pardonPlayer(name: string): boolean;
  bannedPlayers(): string[];
  whitelistOn: boolean;
  readonly whitelist: Set<string>;
}

let server: CommandServer | null = null;

export function getServer(): CommandServer | null {
  return server;
}

export function setServer(s: CommandServer | null): void {
  server = s;
}

/** ChatAllowedCharacters.isAllowedCharacter as the server checked it. */
function isAllowedChatCharacter(c: string): boolean {
  return c !== '§' && c >= ' ' && c !== '\x7f';
}

/**
 * NetServerHandler.handleChat: "/..." runs a command, anything else is broadcast as
 * "<name> message". Chat visibility 1 (commands only) and 2 (hidden) refuse plain chat.
 */
export function handleChat(sender: EntityPlayer, message: string): void {
  const s = getServer();
  if (!s) return;
  if (sender.getChatVisibility() === 2) {
    sender.sendChatToPlayer('Cannot send chat message.');
    return;
  }
  const msg = message.trim();
  if (msg.length > 100 || [...msg].some((c) => !isAllowedChatCharacter(c))) return;
  if (msg.startsWith('/')) {
    s.getCommandManager().executeCommand(sender, msg);
  } else if (sender.getChatVisibility() === 1) {
    sender.sendChatToPlayer('Cannot send chat message.');
  } else {
    const line = `<${sender.getEntityName()}> ${msg}`;
    console.info(line);
    s.sendChatMsg(line);
  }
}

/** MinecraftServer.getPossibleCompletions: command names and arguments, or player names. */
export function getPossibleCompletions(sender: EntityPlayer, text: string): string[] {
  const s = getServer();
  if (!s) return [];
  if (text.startsWith('/')) {
    const rest = text.substring(1);
    const single = !rest.includes(' ');
    return (s.getCommandManager().getPossibleCommands(sender, rest) ?? []).map((c) => (single ? '/' + c : c));
  }
  const parts = text.split(' ');
  const last = parts[parts.length - 1].toLowerCase();
  return s.getPlayers().map((p) => p.getEntityName()).filter((n) => n.toLowerCase().startsWith(last));
}
