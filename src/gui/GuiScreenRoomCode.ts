import { Keyboard, Keys } from '../client/Keyboard';
import { I18n } from '../core/I18n';
import { formatRoomCode, normalizeRoomCode } from '../net/RoomCode';
import { GuiButton } from './GuiButton';
import type { ServerData } from './GuiMultiplayer';
import { GuiScreen } from './GuiScreen';
import { GuiTextField } from './GuiTextField';

const LAST_ROOM_KEY = 'mc152.lastRoom';

function loadLastRoom(): string {
  try {
    return localStorage.getItem(LAST_ROOM_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveLastRoom(code: string): void {
  try {
    localStorage.setItem(LAST_ROOM_KEY, code);
  } catch {
    /* storage blocked */
  }
}

/**
 * "Room Code": joins a game another player opened to LAN, peer to peer (see docs/MULTIPLAYER.md).
 * Built like Direct Connect's screen: one field for the code the host's chat showed (8 letters
 * and digits; case, spaces and dashes do not matter), Join Server and Cancel. The player joins
 * under the Account Manager's name.
 */
export class GuiScreenRoomCode extends GuiScreen {
  private codeField!: GuiTextField;

  constructor(
    private readonly guiScreen: GuiScreen,
    private readonly theServerData: ServerData,
  ) {
    super();
  }

  override updateScreen(): void {
    this.codeField.updateCursorCounter();
  }

  override initGui(): void {
    const t = (k: string) => I18n.translateToLocal(k);
    Keyboard.enableRepeatEvents(true);
    this.buttonList = [];
    const cx = Math.trunc(this.width / 2);
    const h4 = Math.trunc(this.height / 4);
    this.buttonList.push(new GuiButton(0, cx - 100, h4 + 96 + 12, t('selectServer.select')));
    this.buttonList.push(new GuiButton(1, cx - 100, h4 + 120 + 12, t('gui.cancel')));
    const old = this.codeField?.getText() ?? loadLastRoom();
    this.codeField = new GuiTextField(this.fontRenderer, cx - 100, 116, 200, 20);
    this.codeField.setMaxStringLength(20);
    this.codeField.setFocused(true);
    this.codeField.setText(old);
    this.updateButton();
  }

  private updateButton(): void {
    this.buttonList[0].enabled = normalizeRoomCode(this.codeField.getText()) !== null;
  }

  override onGuiClosed(): void {
    Keyboard.enableRepeatEvents(false);
    saveLastRoom(this.codeField.getText());
  }

  protected override actionPerformed(b: GuiButton): void {
    if (!b.enabled) return;
    if (b.id === 1) this.guiScreen.confirmClicked(false, 0);
    else if (b.id === 0) {
      const code = normalizeRoomCode(this.codeField.getText());
      if (!code) return;
      this.theServerData.serverIP = formatRoomCode(code);
      this.theServerData.kind = 'room';
      this.guiScreen.confirmClicked(true, 0);
    }
  }

  protected override keyTyped(ch: string, key: number): void {
    if (this.codeField.textboxKeyTyped(ch, key)) this.updateButton();
    else if (key === Keys.RETURN) this.actionPerformed(this.buttonList[0]);
  }

  protected override mouseClicked(x: number, y: number, button: number): void {
    super.mouseClicked(x, y, button);
    this.codeField.mouseClicked(x, y, button);
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    const cx = Math.trunc(this.width / 2);
    this.drawDefaultBackground();
    this.drawCenteredString(this.fontRenderer, 'Join with a Room Code', cx, Math.trunc(this.height / 4) - 60 + 20, 0xffffff);
    this.drawString(this.fontRenderer, 'Room Code', cx - 100, 100, 0xa0a0a0);
    this.codeField.drawTextBox();
    this.drawString(this.fontRenderer, "From the host's chat, like ABCD-EFGH", cx - 100, 141, 0x808080);
    this.drawString(this.fontRenderer, `Playing as ${this.mc.username}`, cx - 100, 152, 0x808080);
    super.drawScreen(mx, my, pt);
  }
}
