import { EntityOtherPlayerMP } from '../entity/EntityOtherPlayerMP';
import { GuiConnecting } from '../gui/GuiConnecting';
import { GuiMultiplayer, ServerData } from '../gui/GuiMultiplayer';
import { GuiMainMenu } from '../gui/GuiMainMenu';
import { EnumGameType } from '../world/EnumGameType';
import type { Minecraft } from './Minecraft';

/**
 * Multiplayer helpers on `window.mc.dev.net` for automation (scripts/scenarios/multiplayer.json):
 * open the current world to LAN, join a room through the real screens, and read the session's
 * state (room code, players, entities, bytes).
 */
export class NetDevTools {
  /** The last code shareToLan returned (also in the chat). */
  lastCode: string | null = null;
  lastError: string | null = null;

  constructor(private readonly mc: Minecraft) {}

  /** Open to LAN with a name, mode and cheats; resolves with the room code. */
  async host(name?: string, mode = 'creative', cheats = true): Promise<string> {
    if (name) {
      this.mc.username = name;
      if (this.mc.thePlayer) this.mc.thePlayer.username = name;
    }
    try {
      this.lastCode = await this.mc.shareToLan(EnumGameType.getByName(mode), cheats);
      this.mc.ingameGUI.getChatGUI().printChatMessage(`Room code: §e${this.lastCode}§r - share it with friends`);
      return this.lastCode;
    } catch (e) {
      this.lastError = String(e);
      throw e;
    }
  }

  /** Multiplayer > Direct Connect with a room code, as a player would. */
  join(code: string, name?: string): void {
    if (name) this.mc.username = name;
    const list = new GuiMultiplayer(new GuiMainMenu());
    this.mc.displayGuiScreen(new GuiConnecting(list, this.mc, new ServerData('LAN', code)));
  }

  /** What the session looks like now. */
  state(): Record<string, unknown> {
    const mc = this.mc;
    const lan = mc.lanServer;
    const net = mc.netHandler;
    const others = mc.theWorld ? mc.theWorld.loadedEntityList.filter((e): e is EntityOtherPlayerMP => e instanceof EntityOtherPlayerMP).map((p) => ({ name: p.username, x: p.posX, y: p.posY, z: p.posZ, sneaking: p.isSneaking() })) : [];
    return {
      username: mc.username,
      role: lan ? 'host' : net ? 'guest' : 'none',
      code: lan?.code ?? null,
      players: lan ? lan.playerList() : net ? net.playerList().entries : [],
      guestState: net?.state ?? null,
      positionReceived: net?.positionReceived ?? false,
      chunks: mc.theWorld?.loadedChunkCount ?? 0,
      entities: mc.theWorld?.loadedEntityList.length ?? 0,
      otherPlayers: others,
      bytesReceived: net?.bytesReceived ?? 0,
      guests: lan ? lan.handlers.map((h) => ({ name: h.username, state: h.state, chunks: h.loadedChunks.size, bytesSent: h.bytesSent })) : [],
      screen: mc.currentScreen?.constructor.name ?? null,
      lastError: this.lastError,
    };
  }

  /** Recent chat lines (newest last), without formatting codes. */
  chat(n = 10): string[] {
    const gui = this.mc.ingameGUI.getChatGUI() as unknown as { chatLines?: { getChatLineString(): string }[] };
    return (gui.chatLines ?? [])
      .slice(0, n)
      .map((l) => l.getChatLineString().replace(/§./g, ''))
      .reverse();
  }

  /** Leave: Disconnect (guest) or close the LAN game (host). */
  leave(): void {
    this.mc.loadWorld(null);
    this.mc.displayGuiScreen(new GuiMainMenu());
  }
}
