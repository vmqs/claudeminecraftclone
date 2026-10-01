import { I18n } from '../core/I18n';
import { javaStringHash } from '../core/JavaRandom';
import { Keyboard } from '../client/Keyboard';
import { GuiButton } from './GuiButton';
import { GuiScreen } from './GuiScreen';
import { GuiTextField } from './GuiTextField';

const WORLD_TYPES = ['default', 'flat', 'largeBiomes'];
const WORLD_TYPE_KEYS = ['generator.default', 'generator.flat', 'generator.largeBiomes'];

/** "Create New World": name, seed (More World Options), structures and world type. Creative only. */
export class GuiCreateWorld extends GuiScreen {
  private textboxWorldName!: GuiTextField;
  private textboxSeed!: GuiTextField;
  private folderName = 'World';
  private readonly gameMode = 'creative';
  private generateStructures = true;
  private moreOptions = false;
  private createClicked = false;
  private worldTypeId = 0;
  private seed = '';
  private localizedNewWorldText = I18n.translateToLocal('selectWorld.newWorld');
  private buttonGameMode!: GuiButton;
  private moreWorldOptions!: GuiButton;
  private buttonGenerateStructures!: GuiButton;
  private buttonBonusItems!: GuiButton;
  private buttonWorldType!: GuiButton;
  private buttonAllowCommands!: GuiButton;

  constructor(private readonly parentGuiScreen: GuiScreen) {
    super();
  }

  override updateScreen(): void {
    this.textboxWorldName.updateCursorCounter();
    this.textboxSeed.updateCursorCounter();
  }

  override initGui(): void {
    const t = (k: string) => I18n.translateToLocal(k);
    Keyboard.enableRepeatEvents(true);
    const cx = Math.trunc(this.width / 2);
    this.buttonList.push(new GuiButton(0, cx - 155, this.height - 28, 150, 20, t('selectWorld.create')));
    this.buttonList.push(new GuiButton(1, cx + 5, this.height - 28, 150, 20, t('gui.cancel')));
    this.buttonList.push((this.buttonGameMode = new GuiButton(2, cx - 75, 115, 150, 20, t('selectWorld.gameMode'))));
    this.buttonList.push((this.moreWorldOptions = new GuiButton(3, cx - 75, 187, 150, 20, t('selectWorld.moreWorldOptions'))));
    this.buttonList.push((this.buttonGenerateStructures = new GuiButton(4, cx - 155, 100, 150, 20, t('selectWorld.mapFeatures'))));
    this.buttonList.push((this.buttonBonusItems = new GuiButton(7, cx + 5, 151, 150, 20, t('selectWorld.bonusItems'))));
    this.buttonList.push((this.buttonWorldType = new GuiButton(5, cx + 5, 100, 150, 20, t('selectWorld.mapType'))));
    this.buttonList.push((this.buttonAllowCommands = new GuiButton(6, cx - 155, 151, 150, 20, t('selectWorld.allowCommands'))));
    this.buttonBonusItems.enabled = false;
    this.buttonAllowCommands.enabled = false;
    this.textboxWorldName = new GuiTextField(this.fontRenderer, cx - 100, 60, 200, 20);
    this.textboxWorldName.setFocused(true);
    this.textboxWorldName.setText(this.localizedNewWorldText);
    this.textboxSeed = new GuiTextField(this.fontRenderer, cx - 100, 60, 200, 20);
    this.textboxSeed.setText(this.seed);
    this.showMoreOptions(this.moreOptions);
    this.makeUseableName();
    this.updateButtonText();
  }

  private makeUseableName(): void {
    this.folderName = this.textboxWorldName.getText().trim().replace(/[/\n\r\t\0\f`?*\\<>|":]/g, '_');
    if (this.folderName.length === 0) this.folderName = 'World';
  }

  private updateButtonText(): void {
    const t = (k: string) => I18n.translateToLocal(k);
    this.buttonGameMode.displayString = t('selectWorld.gameMode') + ' ' + t('selectWorld.gameMode.' + this.gameMode);
    this.buttonGenerateStructures.displayString = t('selectWorld.mapFeatures') + ' ' + t(this.generateStructures ? 'options.on' : 'options.off');
    this.buttonBonusItems.displayString = t('selectWorld.bonusItems') + ' ' + t('options.off');
    this.buttonWorldType.displayString = t('selectWorld.mapType') + ' ' + t(WORLD_TYPE_KEYS[this.worldTypeId]);
    this.buttonAllowCommands.displayString = t('selectWorld.allowCommands') + ' ' + t('options.on');
  }

  private showMoreOptions(v: boolean): void {
    this.moreOptions = v;
    this.buttonGameMode.drawButton = !v;
    this.buttonGenerateStructures.drawButton = v;
    this.buttonBonusItems.drawButton = v;
    this.buttonWorldType.drawButton = v;
    this.buttonAllowCommands.drawButton = v;
    this.moreWorldOptions.displayString = I18n.translateToLocal(v ? 'gui.done' : 'selectWorld.moreWorldOptions');
  }

  /** The original's seed rule: a non-zero long, else the string's hashCode, else random. */
  static parseSeed(text: string): bigint | null {
    if (text.length === 0) return null;
    if (/^[+-]?\d+$/.test(text)) {
      const v = BigInt(text);
      if (v >= -(1n << 63n) && v < 1n << 63n) return v !== 0n ? v : null;
    }
    return BigInt(javaStringHash(text));
  }

  protected override actionPerformed(b: GuiButton): void {
    if (!b.enabled) return;
    if (b.id === 1) this.mc.displayGuiScreen(this.parentGuiScreen);
    else if (b.id === 0) {
      this.mc.displayGuiScreen(null);
      if (this.createClicked) return;
      this.createClicked = true;
      const seed = GuiCreateWorld.parseSeed(this.textboxSeed.getText()) ?? undefined;
      this.mc.launchIntegratedServer(this.folderName, this.textboxWorldName.getText().trim(), {
        seed,
        terrainType: WORLD_TYPES[this.worldTypeId],
        mapFeatures: this.generateStructures,
      });
    } else if (b.id === 3) this.showMoreOptions(!this.moreOptions);
    else if (b.id === 4) {
      this.generateStructures = !this.generateStructures;
      this.updateButtonText();
    } else if (b.id === 5) {
      this.worldTypeId = (this.worldTypeId + 1) % WORLD_TYPES.length;
      this.updateButtonText();
    }
  }

  protected override keyTyped(ch: string, key: number): void {
    if (this.textboxWorldName.isFocused && !this.moreOptions) {
      this.textboxWorldName.textboxKeyTyped(ch, key);
      this.localizedNewWorldText = this.textboxWorldName.getText();
    } else if (this.textboxSeed.isFocused && this.moreOptions) {
      this.textboxSeed.textboxKeyTyped(ch, key);
      this.seed = this.textboxSeed.getText();
    }
    if (ch === '\r') this.actionPerformed(this.buttonList[0]);
    this.buttonList[0].enabled = this.textboxWorldName.getText().length > 0;
    this.makeUseableName();
  }

  protected override mouseClicked(x: number, y: number, button: number): void {
    super.mouseClicked(x, y, button);
    if (this.moreOptions) this.textboxSeed.mouseClicked(x, y, button);
    else this.textboxWorldName.mouseClicked(x, y, button);
  }

  override onGuiClosed(): void {
    Keyboard.enableRepeatEvents(false);
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    const t = (k: string) => I18n.translateToLocal(k);
    const cx = Math.trunc(this.width / 2);
    this.drawDefaultBackground();
    this.drawCenteredString(this.fontRenderer, t('selectWorld.create'), cx, 20, 0xffffff);
    if (this.moreOptions) {
      this.drawString(this.fontRenderer, t('selectWorld.enterSeed'), cx - 100, 47, 0xa0a0a0);
      this.drawString(this.fontRenderer, t('selectWorld.seedInfo'), cx - 100, 85, 0xa0a0a0);
      this.drawString(this.fontRenderer, t('selectWorld.mapFeatures.info'), cx - 150, 122, 0xa0a0a0);
      this.drawString(this.fontRenderer, t('selectWorld.allowCommands.info'), cx - 150, 172, 0xa0a0a0);
      this.textboxSeed.drawTextBox();
    } else {
      this.drawString(this.fontRenderer, t('selectWorld.enterName'), cx - 100, 47, 0xa0a0a0);
      this.drawString(this.fontRenderer, t('selectWorld.resultFolder') + ' ' + this.folderName, cx - 100, 85, 0xa0a0a0);
      this.textboxWorldName.drawTextBox();
      this.drawString(this.fontRenderer, t('selectWorld.gameMode.' + this.gameMode + '.line1'), cx - 100, 137, 0xa0a0a0);
      this.drawString(this.fontRenderer, t('selectWorld.gameMode.' + this.gameMode + '.line2'), cx - 100, 149, 0xa0a0a0);
    }
    super.drawScreen(mx, my, pt);
  }
}
