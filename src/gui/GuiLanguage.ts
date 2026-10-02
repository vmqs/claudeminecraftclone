import type { GameSettings } from '../client/GameSettings';
import type { Minecraft } from '../client/Minecraft';
import { I18n } from '../core/I18n';
import type { Tessellator } from '../render/gl/Tessellator';
import type { GuiButton } from './GuiButton';
import { GuiSmallButton } from './GuiButton';
import { GuiScreen } from './GuiScreen';
import { GuiSlot } from './GuiSlot';
import { StringTranslate } from './StringTranslate';

/** Applies the language in the options at start-up (Minecraft.startGame). */
export async function initLanguage(mc: Minecraft): Promise<void> {
  await StringTranslate.init(mc.resources);
  const code = mc.gameSettings.language;
  if (code && code !== 'en_US' && !(await StringTranslate.setLanguage(code))) mc.gameSettings.language = 'en_US';
  mc.fontRenderer.setUnicodeFlag(StringTranslate.isUnicode());
  mc.fontRenderer.setBidiFlag(StringTranslate.isBidirectional(mc.gameSettings.language));
}

/** Language selection (GuiLanguage): every lang file of the game, the current one outlined. */
export class GuiLanguage extends GuiScreen {
  private languageList!: GuiSlotLanguage;
  doneButton!: GuiSmallButton;

  constructor(
    protected readonly parentGui: GuiScreen,
    readonly theGameSettings: GameSettings,
  ) {
    super();
  }

  get font() {
    return this.fontRenderer;
  }

  override initGui(): void {
    this.doneButton = new GuiSmallButton(6, Math.trunc(this.width / 2) - 75, this.height - 38, null, I18n.translateToLocal('gui.done'));
    this.buttonList.push(this.doneButton);
    this.languageList = new GuiSlotLanguage(this);
    this.languageList.registerScrollButtons(this.buttonList, 7, 8);
  }

  protected override actionPerformed(b: GuiButton): void {
    if (!b.enabled) return;
    if (b.id === 5) return;
    if (b.id === 6) this.mc.displayGuiScreen(this.parentGui);
    else this.languageList.actionPerformed(b);
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.languageList.drawScreen(mx, my, pt);
    const cx = Math.trunc(this.width / 2);
    this.drawCenteredString(this.fontRenderer, I18n.translateToLocal('options.language'), cx, 16, 0xffffff);
    this.drawCenteredString(this.fontRenderer, '(' + I18n.translateToLocal('options.languageWarning') + ')', cx, this.height - 56, 0x808080);
    super.drawScreen(mx, my, pt);
  }
}

/** The list of languages (GuiSlotLanguage), drawn right to left where needed. */
class GuiSlotLanguage extends GuiSlot {
  private readonly codes: string[];

  constructor(private readonly gui: GuiLanguage) {
    super(gui.mc, gui.width, gui.height, 32, gui.height - 65 + 4, 18);
    this.codes = [...StringTranslate.getLanguageList().keys()];
  }

  protected getSize(): number {
    return this.codes.length;
  }

  protected elementClicked(i: number): void {
    const code = this.codes[i];
    const gui = this.gui;
    void StringTranslate.setLanguage(code).then((ok) => {
      if (!ok) return;
      gui.mc.fontRenderer.setUnicodeFlag(StringTranslate.isUnicode());
      gui.theGameSettings.language = code;
      gui.font.setBidiFlag(StringTranslate.isBidirectional(code));
      gui.doneButton.displayString = I18n.translateToLocal('gui.done');
      gui.theGameSettings.saveOptions();
    });
  }

  protected isSelected(i: number): boolean {
    return this.codes[i] === StringTranslate.getCurrentLanguage();
  }

  protected override getContentHeight(): number {
    return this.getSize() * 18;
  }

  protected drawBackground(): void {
    this.gui.drawDefaultBackground();
  }

  protected drawSlot(i: number, _x: number, y: number, _h: number, _t: Tessellator): void {
    const font = this.gui.font;
    font.setBidiFlag(true);
    this.gui.drawCenteredString(font, StringTranslate.getLanguageList().get(this.codes[i]) ?? '', Math.trunc(this.gui.width / 2), y + 1, 0xffffff);
    font.setBidiFlag(StringTranslate.isBidirectional(this.gui.theGameSettings.language));
  }
}
