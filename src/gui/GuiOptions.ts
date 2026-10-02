import { EnumOptions, type GameSettings } from '../client/GameSettings';
import { I18n } from '../core/I18n';
import { GuiButton, GuiSlider, GuiSmallButton } from './GuiButton';
import { GuiControls } from './GuiControls';
import { GuiLanguage } from './GuiLanguage';
import { GuiScreen } from './GuiScreen';
import { GuiSnooper } from './GuiSnooper';
import { GuiTexturePacks } from './GuiTexturePacks';
import { ScreenChatOptions } from './ScreenChatOptions';

function addOptionButtons(screen: { buttonList: GuiButton[] }, options: EnumOptions[], settings: GameSettings, x0: number, y0: number): void {
  options.forEach((o, i) => {
    const x = x0 + (i % 2) * 160;
    const y = y0 + 24 * (i >> 1);
    if (o.getEnumFloat()) screen.buttonList.push(new GuiSlider(o.returnEnumOrdinal(), x, y, o, settings.getKeyBinding(o), settings.getOptionFloatValue(o)));
    else screen.buttonList.push(new GuiSmallButton(o.returnEnumOrdinal(), x, y, o, settings.getKeyBinding(o)));
  });
}

/** Options screen (music, sound, mouse, FOV, difficulty) with links to the sub-screens. */
export class GuiOptions extends GuiScreen {
  private static readonly relevantOptions = [EnumOptions.MUSIC, EnumOptions.SOUND, EnumOptions.INVERT_MOUSE, EnumOptions.SENSITIVITY, EnumOptions.FOV, EnumOptions.DIFFICULTY, EnumOptions.TOUCHSCREEN];
  private screenTitle = 'Options';

  constructor(
    private readonly parentScreen: GuiScreen,
    private readonly options: GameSettings,
  ) {
    super();
  }

  override initGui(): void {
    const t = (k: string) => I18n.translateToLocal(k);
    this.screenTitle = t('options.title');
    const cx = Math.trunc(this.width / 2);
    const h6 = Math.trunc(this.height / 6);
    addOptionButtons(this as unknown as { buttonList: GuiButton[] }, GuiOptions.relevantOptions, this.options, cx - 155, h6 - 12);
    this.buttonList.push(new GuiButton(101, cx - 152, h6 + 96 - 6, 150, 20, t('options.video')));
    this.buttonList.push(new GuiButton(100, cx + 2, h6 + 96 - 6, 150, 20, t('options.controls')));
    this.buttonList.push(new GuiButton(102, cx - 152, h6 + 120 - 6, 150, 20, t('options.language')));
    this.buttonList.push(new GuiButton(103, cx + 2, h6 + 120 - 6, 150, 20, t('options.multiplayer.title')));
    this.buttonList.push(new GuiButton(105, cx - 152, h6 + 144 - 6, 150, 20, t('options.texture.pack')));
    this.buttonList.push(new GuiButton(104, cx + 2, h6 + 144 - 6, 150, 20, t('options.snooper.view')));
    this.buttonList.push(new GuiButton(200, cx - 100, h6 + 168, t('gui.done')));
  }

  protected override actionPerformed(b: GuiButton): void {
    if (!b.enabled) return;
    if (b.id < 100 && b instanceof GuiSmallButton) {
      this.options.setOptionValue(b.returnEnumOptions()!, 1);
      b.displayString = this.options.getKeyBinding(EnumOptions.getEnumOptions(b.id)!);
    }
    const sub: Record<number, () => GuiScreen> = {
      101: () => new GuiVideoSettings(this, this.options),
      100: () => new GuiControls(this, this.options),
      102: () => new GuiLanguage(this, this.options),
      103: () => new ScreenChatOptions(this, this.options),
      104: () => new GuiSnooper(this, this.options),
      105: () => new GuiTexturePacks(this, this.options),
    };
    if (sub[b.id]) {
      this.mc.gameSettings.saveOptions();
      this.mc.displayGuiScreen(sub[b.id]());
    }
    if (b.id === 200) {
      this.options.saveOptions();
      this.mc.displayGuiScreen(this.parentScreen);
    }
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.drawDefaultBackground();
    this.drawCenteredString(this.fontRenderer, this.screenTitle, Math.trunc(this.width / 2), 15, 0xffffff);
    super.drawScreen(mx, my, pt);
  }
}

/** Video settings (graphics, render distance, smooth lighting, GUI scale, ...). */
export class GuiVideoSettings extends GuiScreen {
  private static readonly videoOptions = [
    EnumOptions.GRAPHICS,
    EnumOptions.RENDER_DISTANCE,
    EnumOptions.AMBIENT_OCCLUSION,
    EnumOptions.FRAMERATE_LIMIT,
    EnumOptions.ANAGLYPH,
    EnumOptions.VIEW_BOBBING,
    EnumOptions.GUI_SCALE,
    EnumOptions.ADVANCED_OPENGL,
    EnumOptions.GAMMA,
    EnumOptions.RENDER_CLOUDS,
    EnumOptions.PARTICLES,
    EnumOptions.USE_SERVER_TEXTURES,
    EnumOptions.USE_FULLSCREEN,
    EnumOptions.ENABLE_VSYNC,
  ];
  private screenTitle = 'Video Settings';

  constructor(
    private readonly parentGuiScreen: GuiScreen,
    private readonly guiGameSettings: GameSettings,
  ) {
    super();
  }

  override initGui(): void {
    this.screenTitle = I18n.translateToLocal('options.videoTitle');
    const cx = Math.trunc(this.width / 2);
    this.buttonList.push(new GuiButton(200, cx - 100, Math.trunc(this.height / 6) + 168, I18n.translateToLocal('gui.done')));
    addOptionButtons(this as unknown as { buttonList: GuiButton[] }, GuiVideoSettings.videoOptions, this.guiGameSettings, cx - 155, Math.trunc(this.height / 7));
  }

  protected override actionPerformed(b: GuiButton): void {
    if (!b.enabled) return;
    const guiScale = this.guiGameSettings.guiScale;
    if (b.id < 100 && b instanceof GuiSmallButton) {
      this.guiGameSettings.setOptionValue(b.returnEnumOptions()!, 1);
      b.displayString = this.guiGameSettings.getKeyBinding(EnumOptions.getEnumOptions(b.id)!);
    }
    if (b.id === 200) {
      this.mc.gameSettings.saveOptions();
      this.mc.displayGuiScreen(this.parentGuiScreen);
    }
    if (this.guiGameSettings.guiScale !== guiScale) {
      const sr = this.mc.getScaledResolution();
      this.setWorldAndResolution(this.mc, sr.getScaledWidth(), sr.getScaledHeight());
    }
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.drawDefaultBackground();
    // 1.5.2 draws this title at y=20 on 64-bit JVMs (y=5 otherwise); the buttons follow that layout.
    this.drawCenteredString(this.fontRenderer, this.screenTitle, Math.trunc(this.width / 2), 20, 0xffffff);
    super.drawScreen(mx, my, pt);
  }
}
