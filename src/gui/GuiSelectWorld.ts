import { I18n } from '../core/I18n';
import type { Tessellator } from '../render/gl/Tessellator';
import { formatSaveDate, SaveFormatMemory, type SaveSummary } from '../world/storage/SaveFormatMemory';
import { GuiButton } from './GuiButton';
import { GuiCreateWorld } from './GuiCreateWorld';
import { GuiRenameWorld } from './GuiRenameWorld';
import { GuiScreen } from './GuiScreen';
import { GuiSlot } from './GuiSlot';
import { GuiYesNo } from './GuiYesNo';

/** "Select World" (GuiSelectWorld): the worlds of this session with Play, Create, Rename, Delete and Re-Create. */
export class GuiSelectWorld extends GuiScreen {
  /** Fixed by tests for repeatable captures (the reference pins 5/7/13 12:00 PM); null = the real date. */
  static pinnedDate: number | null = null;
  protected screenTitle = 'Select world';
  private selected = false;
  selectedWorld = -1;
  saveList: SaveSummary[] = [];
  private worldSlotContainer!: GuiWorldSlot;
  localizedWorldText = '';
  readonly localizedGameModeText: string[] = [];
  private deleting = false;
  buttonDelete!: GuiButton;
  buttonSelect!: GuiButton;
  buttonRename!: GuiButton;
  buttonRecreate!: GuiButton;

  constructor(protected readonly parentScreen: GuiScreen) {
    super();
  }

  get font() {
    return this.fontRenderer;
  }

  override initGui(): void {
    const t = (k: string) => I18n.translateToLocal(k);
    this.screenTitle = t('selectWorld.title');
    this.loadSaves();
    this.localizedWorldText = t('selectWorld.world');
    this.localizedGameModeText[0] = t('gameMode.survival');
    this.localizedGameModeText[1] = t('gameMode.creative');
    this.localizedGameModeText[2] = t('gameMode.adventure');
    this.worldSlotContainer = new GuiWorldSlot(this);
    this.worldSlotContainer.registerScrollButtons(this.buttonList, 4, 5);
    this.initButtons();
  }

  private loadSaves(): void {
    this.saveList = SaveFormatMemory.instance.getSaveList();
    this.selectedWorld = -1;
  }

  getSaveFileName(i: number): string {
    return this.saveList[i].fileName;
  }

  getSaveName(i: number): string {
    let name = this.saveList[i].displayName;
    if (!name) name = I18n.translateToLocal('selectWorld.world') + ' ' + (i + 1);
    return name;
  }

  initButtons(): void {
    const t = (k: string) => I18n.translateToLocal(k);
    const cx = Math.trunc(this.width / 2);
    this.buttonList.push((this.buttonSelect = new GuiButton(1, cx - 154, this.height - 52, 150, 20, t('selectWorld.select'))));
    this.buttonList.push(new GuiButton(3, cx + 4, this.height - 52, 150, 20, t('selectWorld.create')));
    this.buttonList.push((this.buttonRename = new GuiButton(6, cx - 154, this.height - 28, 72, 20, t('selectWorld.rename'))));
    this.buttonList.push((this.buttonDelete = new GuiButton(2, cx - 76, this.height - 28, 72, 20, t('selectWorld.delete'))));
    this.buttonList.push((this.buttonRecreate = new GuiButton(7, cx + 4, this.height - 28, 72, 20, t('selectWorld.recreate'))));
    this.buttonList.push(new GuiButton(0, cx + 82, this.height - 28, 72, 20, t('gui.cancel')));
    this.buttonSelect.enabled = false;
    this.buttonDelete.enabled = false;
    this.buttonRename.enabled = false;
    this.buttonRecreate.enabled = false;
  }

  protected override actionPerformed(b: GuiButton): void {
    if (!b.enabled) return;
    if (b.id === 2) {
      const name = this.getSaveName(this.selectedWorld);
      this.deleting = true;
      this.mc.displayGuiScreen(GuiSelectWorld.getDeleteWorldScreen(this, name, this.selectedWorld));
    } else if (b.id === 1) {
      this.selectWorld(this.selectedWorld);
    } else if (b.id === 3) {
      this.mc.displayGuiScreen(new GuiCreateWorld(this));
    } else if (b.id === 6) {
      this.mc.displayGuiScreen(new GuiRenameWorld(this, this.getSaveFileName(this.selectedWorld)));
    } else if (b.id === 0) {
      this.mc.displayGuiScreen(this.parentScreen);
    } else if (b.id === 7) {
      const gui = new GuiCreateWorld(this);
      const info = SaveFormatMemory.instance.getWorldInfo(this.getSaveFileName(this.selectedWorld));
      if (info) gui.copyWorldInfo(info);
      this.mc.displayGuiScreen(gui);
    } else {
      this.worldSlotContainer.actionPerformed(b);
    }
  }

  selectWorld(i: number): void {
    this.mc.displayGuiScreen(null);
    if (this.selected) return;
    this.selected = true;
    const folder = this.getSaveFileName(i) ?? 'World' + i;
    const name = this.getSaveName(i) ?? 'World' + i;
    if (SaveFormatMemory.instance.canLoadWorld(folder)) this.mc.launchIntegratedServer(folder, name, null);
  }

  override confirmClicked(ok: boolean, id: number): void {
    if (!this.deleting) return;
    this.deleting = false;
    if (ok) {
      SaveFormatMemory.instance.deleteWorldDirectory(this.getSaveFileName(id));
      this.loadSaves();
    }
    this.mc.displayGuiScreen(this);
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.worldSlotContainer.drawScreen(mx, my, pt);
    this.drawCenteredString(this.fontRenderer, this.screenTitle, Math.trunc(this.width / 2), 20, 0xffffff);
    super.drawScreen(mx, my, pt);
  }

  static getDeleteWorldScreen(parent: GuiScreen, name: string, id: number): GuiYesNo {
    const t = (k: string) => I18n.translateToLocal(k);
    return new GuiYesNo(parent, t('selectWorld.deleteQuestion'), "'" + name + "' " + t('selectWorld.deleteWarning'), t('selectWorld.deleteButton'), t('gui.cancel'), id);
  }
}

/** The world rows (GuiWorldSlot): name, "folder (date)", game mode and cheats. */
class GuiWorldSlot extends GuiSlot {
  constructor(private readonly gui: GuiSelectWorld) {
    super(gui.mc, gui.width, gui.height, 32, gui.height - 64, 36);
  }

  protected getSize(): number {
    return this.gui.saveList.length;
  }

  protected elementClicked(i: number, doubleClick: boolean): void {
    const g = this.gui;
    g.selectedWorld = i;
    const ok = g.selectedWorld >= 0 && g.selectedWorld < this.getSize();
    g.buttonSelect.enabled = ok;
    g.buttonRename.enabled = ok;
    g.buttonDelete.enabled = ok;
    g.buttonRecreate.enabled = ok;
    if (doubleClick && ok) g.selectWorld(i);
  }

  protected isSelected(i: number): boolean {
    return i === this.gui.selectedWorld;
  }

  protected override getContentHeight(): number {
    return this.gui.saveList.length * 36;
  }

  protected drawBackground(): void {
    this.gui.drawDefaultBackground();
  }

  protected drawSlot(i: number, x: number, y: number, _h: number, _t: Tessellator): void {
    const s = this.gui.saveList[i];
    let name = s.displayName;
    if (!name) name = this.gui.localizedWorldText + ' ' + (i + 1);
    const date = formatSaveDate(GuiSelectWorld.pinnedDate ?? s.lastTimePlayed);
    const folder = s.fileName + ' (' + date + ')';
    let mode = this.gui.localizedGameModeText[s.gameType] ?? '';
    if (s.hardcore) mode = '§4' + I18n.translateToLocal('gameMode.hardcore') + '§r';
    if (s.cheatsEnabled) mode = mode + ', ' + I18n.translateToLocal('selectWorld.cheats');
    const font = this.gui.font;
    this.gui.drawString(font, name, x + 2, y + 1, 0xffffff);
    this.gui.drawString(font, folder, x + 2, y + 12, 0x808080);
    this.gui.drawString(font, mode, x + 2, y + 12 + 10, 0x808080);
  }
}
