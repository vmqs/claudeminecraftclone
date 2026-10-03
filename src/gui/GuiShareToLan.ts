import { I18n } from '../core/I18n';
import { formatRoomCode } from '../net/RoomCode';
import { EnumGameType } from '../world/EnumGameType';
import { GuiButton } from './GuiButton';
import { GuiScreen } from './GuiScreen';

/**
 * "LAN World" (GuiShareToLan): the game mode and "Allow Cheats" for the other players. Start LAN
 * World opens the world as a room (shareToLAN) and tells the room code in chat, copied to the
 * clipboard. The host plays under the Account Manager's name.
 */
export class GuiShareToLan extends GuiScreen {
  private buttonAllowCommandsToggle!: GuiButton;
  private buttonGameMode!: GuiButton;
  private buttonStart!: GuiButton;
  private gameMode = 'survival';
  private allowCommands = false;
  private starting = false;

  constructor(private readonly parentScreen: GuiScreen) {
    super();
  }

  override initGui(): void {
    const t = (k: string) => I18n.translateToLocal(k);
    this.buttonList = [];
    const cx = Math.trunc(this.width / 2);
    this.buttonList.push((this.buttonStart = new GuiButton(101, cx - 155, this.height - 28, 150, 20, t('lanServer.start'))));
    this.buttonList.push(new GuiButton(102, cx + 5, this.height - 28, 150, 20, t('gui.cancel')));
    this.buttonList.push((this.buttonGameMode = new GuiButton(104, cx - 155, 100, 150, 20, t('selectWorld.gameMode'))));
    this.buttonList.push((this.buttonAllowCommandsToggle = new GuiButton(103, cx + 5, 100, 150, 20, t('selectWorld.allowCommands'))));
    this.updateLabels();
  }

  private updateLabels(): void {
    const t = (k: string) => I18n.translateToLocal(k);
    this.buttonGameMode.displayString = t('selectWorld.gameMode') + ' ' + t('selectWorld.gameMode.' + this.gameMode);
    this.buttonAllowCommandsToggle.displayString = t('selectWorld.allowCommands') + ' ' + t(this.allowCommands ? 'options.on' : 'options.off');
    this.buttonStart.enabled = !this.starting;
  }

  protected override actionPerformed(b: GuiButton): void {
    if (!b.enabled) return;
    if (b.id === 102) {
      this.mc.displayGuiScreen(this.parentScreen);
    } else if (b.id === 104) {
      this.gameMode = this.gameMode === 'survival' ? 'creative' : this.gameMode === 'creative' ? 'adventure' : 'survival';
      this.updateLabels();
    } else if (b.id === 103) {
      this.allowCommands = !this.allowCommands;
      this.updateLabels();
    } else if (b.id === 101) {
      this.starting = true;
      this.updateLabels();
      const chat = this.mc.ingameGUI.getChatGUI();
      this.mc.displayGuiScreen(null);
      this.mc.shareToLan(EnumGameType.getByName(this.gameMode), this.allowCommands).then(
        (raw) => {
          const code = formatRoomCode(raw);
          chat.printChatMessage(this.mc.thePlayer?.translateString('commands.publish.started', `room ${code}`) ?? `Local game hosted on room ${code}`);
          GuiScreen.setClipboardString(code);
          chat.printChatMessage(`Room code: §e${code}§r - share it with friends (copied to the clipboard)`);
        },
        (e: unknown) => {
          console.warn('[lan] could not open the game', e);
          chat.printChatMessage(I18n.translateToLocal('commands.publish.failed'));
          chat.printChatMessage(`§7${e instanceof Error ? e.message : String(e)}`);
        },
      );
    }
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.drawDefaultBackground();
    const cx = Math.trunc(this.width / 2);
    this.drawCenteredString(this.fontRenderer, I18n.translateToLocal('lanServer.title'), cx, 50, 0xffffff);
    this.drawCenteredString(this.fontRenderer, I18n.translateToLocal('lanServer.otherPlayers'), cx, 82, 0xffffff);
    super.drawScreen(mx, my, pt);
  }
}
