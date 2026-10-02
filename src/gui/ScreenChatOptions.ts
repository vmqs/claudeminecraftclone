import { EnumOptions, type GameSettings } from '../client/GameSettings';
import { I18n } from '../core/I18n';
import { GuiButton, GuiSlider, GuiSmallButton } from './GuiButton';
import { GuiScreen } from './GuiScreen';

const CHAT_OPTIONS = [
  EnumOptions.CHAT_VISIBILITY,
  EnumOptions.CHAT_COLOR,
  EnumOptions.CHAT_LINKS,
  EnumOptions.CHAT_OPACITY,
  EnumOptions.CHAT_LINKS_PROMPT,
  EnumOptions.CHAT_SCALE,
  EnumOptions.CHAT_HEIGHT_FOCUSED,
  EnumOptions.CHAT_HEIGHT_UNFOCUSED,
  EnumOptions.CHAT_WIDTH,
];
const MULTIPLAYER_OPTIONS = [EnumOptions.SHOW_CAPE];

/** "Multiplayer Settings..." (ScreenChatOptions): the chat options, then the multiplayer ones. */
export class ScreenChatOptions extends GuiScreen {
  private chatTitle = '';
  private multiplayerTitle = '';
  private multiplayerTitleY = 0;

  constructor(
    private readonly parent: GuiScreen,
    private readonly settings: GameSettings,
  ) {
    super();
  }

  private addOption(o: EnumOptions, i: number): void {
    const x = Math.trunc(this.width / 2) - 155 + (i % 2) * 160;
    const y = Math.trunc(this.height / 6) + 24 * (i >> 1);
    if (o.getEnumFloat()) this.buttonList.push(new GuiSlider(o.returnEnumOrdinal(), x, y, o, this.settings.getKeyBinding(o), this.settings.getOptionFloatValue(o)));
    else this.buttonList.push(new GuiSmallButton(o.returnEnumOrdinal(), x, y, o, this.settings.getKeyBinding(o)));
  }

  override initGui(): void {
    this.chatTitle = I18n.translateToLocal('options.chat.title');
    this.multiplayerTitle = I18n.translateToLocal('options.multiplayer.title');
    let i = 0;
    for (const o of CHAT_OPTIONS) this.addOption(o, i++);
    if (i % 2 === 1) i++;
    this.multiplayerTitleY = Math.trunc(this.height / 6) + 24 * (i >> 1);
    i += 2;
    for (const o of MULTIPLAYER_OPTIONS) this.addOption(o, i++);
    this.buttonList.push(new GuiButton(200, Math.trunc(this.width / 2) - 100, Math.trunc(this.height / 6) + 168, I18n.translateToLocal('gui.done')));
  }

  protected override actionPerformed(b: GuiButton): void {
    if (!b.enabled) return;
    if (b.id < 100 && b instanceof GuiSmallButton) {
      this.settings.setOptionValue(b.returnEnumOptions()!, 1);
      b.displayString = this.settings.getKeyBinding(EnumOptions.getEnumOptions(b.id)!);
    }
    if (b.id === 200) {
      this.mc.gameSettings.saveOptions();
      this.mc.displayGuiScreen(this.parent);
    }
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.drawDefaultBackground();
    const cx = Math.trunc(this.width / 2);
    this.drawCenteredString(this.fontRenderer, this.chatTitle, cx, 20, 0xffffff);
    this.drawCenteredString(this.fontRenderer, this.multiplayerTitle, cx, this.multiplayerTitleY + 7, 0xffffff);
    super.drawScreen(mx, my, pt);
  }
}
