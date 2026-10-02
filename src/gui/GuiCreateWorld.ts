import { I18n } from '../core/I18n';
import { javaStringHash } from '../core/JavaRandom';
import { Keyboard } from '../client/Keyboard';
import type { WorldInfo } from '../world/World';
import { SaveFormatMemory } from '../world/storage/SaveFormatMemory';
import { GuiButton } from './GuiButton';
import { GuiCreateFlatWorld } from './GuiCreateFlatWorld';
import { GuiScreen } from './GuiScreen';
import { GuiTextField } from './GuiTextField';

/** WorldType.worldTypes that can be created, in their cycling order (name, translation key). */
const WORLD_TYPES = ['default', 'flat', 'largeBiomes'];
const WORLD_TYPE_KEYS = ['generator.default', 'generator.flat', 'generator.largeBiomes'];

/** ChatAllowedCharacters.allowedCharactersArray: replaced by '_' in folder names. */
const ILLEGAL_FILE_CHARS = /[/\n\r\t\0\f`?*\\<>|":]/g;
const ILLEGAL_WORLD_NAMES = ['CON', 'COM', 'PRN', 'AUX', 'CLOCK$', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];

/**
 * "Create New World" (GuiCreateWorld) with "More World Options..." (seed, structures, world
 * type and its Customize screen, cheats, bonus chest). The Game Mode button cycles Survival,
 * Hardcore and Creative; the mode reaches the world as WorldSettings.gameType / hardcore.
 */
export class GuiCreateWorld extends GuiScreen {
  private textboxWorldName!: GuiTextField;
  private textboxSeed!: GuiTextField;
  private folderName = 'World';
  private gameMode = 'survival';
  private generateStructures = true;
  private commandsAllowed = false;
  /** Allow Cheats was clicked: the game mode no longer picks its default. */
  private commandsToggled = false;
  private bonusItems = false;
  private isHardcore = false;
  private createClicked = false;
  private moreOptions = false;
  private worldTypeId = 0;
  private seed = '';
  private localizedNewWorldText: string;
  /** The superflat preset chosen with Customize (func_82750_a). */
  generatorOptionsToUse = '';
  private buttonGameMode!: GuiButton;
  private moreWorldOptions!: GuiButton;
  private buttonGenerateStructures!: GuiButton;
  private buttonBonusItems!: GuiButton;
  private buttonWorldType!: GuiButton;
  private buttonAllowCommands!: GuiButton;
  private buttonCustomize!: GuiButton;
  private gameModeDescriptionLine1 = '';
  private gameModeDescriptionLine2 = '';

  constructor(private readonly parentGuiScreen: GuiScreen) {
    super();
    this.localizedNewWorldText = I18n.translateToLocal('selectWorld.newWorld');
  }

  override updateScreen(): void {
    this.textboxWorldName.updateCursorCounter();
    this.textboxSeed.updateCursorCounter();
  }

  override initGui(): void {
    const t = (k: string) => I18n.translateToLocal(k);
    Keyboard.enableRepeatEvents(true);
    this.buttonList = [];
    const cx = Math.trunc(this.width / 2);
    this.buttonList.push(new GuiButton(0, cx - 155, this.height - 28, 150, 20, t('selectWorld.create')));
    this.buttonList.push(new GuiButton(1, cx + 5, this.height - 28, 150, 20, t('gui.cancel')));
    this.buttonList.push((this.buttonGameMode = new GuiButton(2, cx - 75, 115, 150, 20, t('selectWorld.gameMode'))));
    this.buttonList.push((this.moreWorldOptions = new GuiButton(3, cx - 75, 187, 150, 20, t('selectWorld.moreWorldOptions'))));
    this.buttonList.push((this.buttonGenerateStructures = new GuiButton(4, cx - 155, 100, 150, 20, t('selectWorld.mapFeatures'))));
    this.buttonGenerateStructures.drawButton = false;
    this.buttonList.push((this.buttonBonusItems = new GuiButton(7, cx + 5, 151, 150, 20, t('selectWorld.bonusItems'))));
    this.buttonBonusItems.drawButton = false;
    this.buttonList.push((this.buttonWorldType = new GuiButton(5, cx + 5, 100, 150, 20, t('selectWorld.mapType'))));
    this.buttonWorldType.drawButton = false;
    this.buttonList.push((this.buttonAllowCommands = new GuiButton(6, cx - 155, 151, 150, 20, t('selectWorld.allowCommands'))));
    this.buttonAllowCommands.drawButton = false;
    this.buttonList.push((this.buttonCustomize = new GuiButton(8, cx + 5, 120, 150, 20, t('selectWorld.customizeType'))));
    this.buttonCustomize.drawButton = false;
    this.textboxWorldName = new GuiTextField(this.fontRenderer, cx - 100, 60, 200, 20);
    this.textboxWorldName.setFocused(true);
    this.textboxWorldName.setText(this.localizedNewWorldText);
    this.textboxSeed = new GuiTextField(this.fontRenderer, cx - 100, 60, 200, 20);
    this.textboxSeed.setText(this.seed);
    this.showMoreOptions(this.moreOptions);
    this.buttonAllowCommands.enabled = !this.isHardcore;
    this.buttonBonusItems.enabled = !this.isHardcore;
    this.makeUseableName();
    this.updateButtonText();
  }

  private makeUseableName(): void {
    this.folderName = this.textboxWorldName.getText().trim().replace(ILLEGAL_FILE_CHARS, '_');
    if (this.folderName.length === 0) this.folderName = 'World';
    this.folderName = GuiCreateWorld.makeUniqueFolderName(this.folderName);
  }

  /** func_73913_a: no dots, slashes or quotes, no reserved DOS names, and not an existing folder. */
  static makeUniqueFolderName(name: string): string {
    name = name.replace(/[./"]/g, '_');
    for (const n of ILLEGAL_WORLD_NAMES) if (name.toUpperCase() === n) name = '_' + name + '_';
    while (SaveFormatMemory.instance.getWorldInfo(name) !== null) name += '-';
    return name;
  }

  private updateButtonText(): void {
    const t = (k: string) => I18n.translateToLocal(k);
    const onOff = (v: boolean) => t(v ? 'options.on' : 'options.off');
    this.buttonGameMode.displayString = t('selectWorld.gameMode') + ' ' + t('selectWorld.gameMode.' + this.gameMode);
    this.gameModeDescriptionLine1 = t('selectWorld.gameMode.' + this.gameMode + '.line1');
    this.gameModeDescriptionLine2 = t('selectWorld.gameMode.' + this.gameMode + '.line2');
    this.buttonGenerateStructures.displayString = t('selectWorld.mapFeatures') + ' ' + onOff(this.generateStructures);
    this.buttonBonusItems.displayString = t('selectWorld.bonusItems') + ' ' + onOff(this.bonusItems && !this.isHardcore);
    this.buttonWorldType.displayString = t('selectWorld.mapType') + ' ' + t(WORLD_TYPE_KEYS[this.worldTypeId]);
    this.buttonAllowCommands.displayString = t('selectWorld.allowCommands') + ' ' + onOff(this.commandsAllowed && !this.isHardcore);
  }

  override onGuiClosed(): void {
    Keyboard.enableRepeatEvents(false);
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
    if (b.id === 1) {
      this.mc.displayGuiScreen(this.parentGuiScreen);
    } else if (b.id === 0) {
      this.mc.displayGuiScreen(null);
      if (this.createClicked) return;
      this.createClicked = true;
      const seed = GuiCreateWorld.parseSeed(this.textboxSeed.getText()) ?? undefined;
      this.mc.launchIntegratedServer(this.folderName, this.textboxWorldName.getText().trim(), {
        seed,
        terrainType: WORLD_TYPES[this.worldTypeId],
        mapFeatures: this.generateStructures,
        generatorOptions: this.generatorOptionsToUse,
        bonusChest: this.bonusItems && !this.isHardcore,
        gameType: this.gameMode === 'creative' ? 1 : 0,
        hardcore: this.isHardcore,
        allowCommands: this.commandsAllowed && !this.isHardcore,
      });
    } else if (b.id === 3) {
      this.showMoreOptions(!this.moreOptions);
    } else if (b.id === 2) {
      if (this.gameMode === 'survival') {
        if (!this.commandsToggled) this.commandsAllowed = false;
        this.gameMode = 'hardcore';
        this.isHardcore = true;
      } else if (this.gameMode === 'hardcore') {
        if (!this.commandsToggled) this.commandsAllowed = true;
        this.gameMode = 'creative';
        this.isHardcore = false;
      } else {
        if (!this.commandsToggled) this.commandsAllowed = false;
        this.gameMode = 'survival';
        this.isHardcore = false;
      }
      this.buttonAllowCommands.enabled = !this.isHardcore;
      this.buttonBonusItems.enabled = !this.isHardcore;
      this.updateButtonText();
    } else if (b.id === 4) {
      this.generateStructures = !this.generateStructures;
      this.updateButtonText();
    } else if (b.id === 7) {
      this.bonusItems = !this.bonusItems;
      this.updateButtonText();
    } else if (b.id === 5) {
      this.worldTypeId = (this.worldTypeId + 1) % WORLD_TYPES.length;
      this.generatorOptionsToUse = '';
      this.updateButtonText();
      this.showMoreOptions(this.moreOptions);
    } else if (b.id === 6) {
      this.commandsToggled = true;
      this.commandsAllowed = !this.commandsAllowed;
      this.updateButtonText();
    } else if (b.id === 8) {
      this.mc.displayGuiScreen(new GuiCreateFlatWorld(this, this.generatorOptionsToUse));
    }
  }

  private showMoreOptions(v: boolean): void {
    this.moreOptions = v;
    this.buttonGameMode.drawButton = !v;
    this.buttonGenerateStructures.drawButton = v;
    this.buttonBonusItems.drawButton = v;
    this.buttonWorldType.drawButton = v;
    this.buttonAllowCommands.drawButton = v;
    this.buttonCustomize.drawButton = v && WORLD_TYPES[this.worldTypeId] === 'flat';
    this.moreWorldOptions.displayString = I18n.translateToLocal(v ? 'gui.done' : 'selectWorld.moreWorldOptions');
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
      this.drawString(this.fontRenderer, this.gameModeDescriptionLine1, cx - 100, 137, 0xa0a0a0);
      this.drawString(this.fontRenderer, this.gameModeDescriptionLine2, cx - 100, 149, 0xa0a0a0);
    }
    super.drawScreen(mx, my, pt);
  }

  /** Re-Create (func_82286_a): starts from a listed world's settings. */
  copyWorldInfo(info: WorldInfo): void {
    this.localizedNewWorldText = I18n.translateToLocalFormatted('selectWorld.newWorld.copyOf', info.worldName);
    this.seed = info.seed.toString();
    this.worldTypeId = Math.max(0, WORLD_TYPES.indexOf(info.terrainType));
    this.generatorOptionsToUse = info.generatorOptions;
    this.generateStructures = info.mapFeaturesEnabled;
    this.commandsAllowed = info.allowCommands;
    if (info.hardcore) this.gameMode = 'hardcore';
    else if (info.gameType !== 1) this.gameMode = 'survival';
    else this.gameMode = 'creative';
    this.isHardcore = info.hardcore;
  }
}
