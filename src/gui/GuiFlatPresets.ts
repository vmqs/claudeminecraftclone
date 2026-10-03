import { Keyboard } from '../client/Keyboard';
import { I18n } from '../core/I18n';
import { ItemStack } from '../item/ItemStack';
import type { Tessellator } from '../render/gl/Tessellator';
import { FLAT_PRESETS } from './FlatPresets';
import { GuiButton } from './GuiButton';
import { drawSlotWithItem, GuiCreateFlatWorld } from './GuiCreateFlatWorld';
import { GuiScreen } from './GuiScreen';
import { GuiSlot } from './GuiSlot';
import { GuiTextField } from './GuiTextField';

/** "Select a Preset" (GuiFlatPresets): the share box with the preset text and the built-in presets. */
export class GuiFlatPresets extends GuiScreen {
  private title = '';
  private shareText = '';
  private listText = '';
  private listSlot!: GuiFlatPresetsListSlot;
  private theButton!: GuiButton;
  textField!: GuiTextField;

  constructor(private readonly createFlatWorldGui: GuiCreateFlatWorld) {
    super();
  }

  get font() {
    return this.fontRenderer;
  }

  override initGui(): void {
    const t = (k: string) => I18n.translateToLocal(k);
    this.buttonList = [];
    Keyboard.enableRepeatEvents(true);
    this.title = t('createWorld.customize.presets.title');
    this.shareText = t('createWorld.customize.presets.share');
    this.listText = t('createWorld.customize.presets.list');
    this.textField = new GuiTextField(this.fontRenderer, 50, 40, this.width - 100, 20);
    this.listSlot = new GuiFlatPresetsListSlot(this);
    this.textField.setMaxStringLength(1230);
    this.textField.setText(this.createFlatWorldGui.getFlatGeneratorInfo());
    const cx = Math.trunc(this.width / 2);
    this.buttonList.push((this.theButton = new GuiButton(0, cx - 155, this.height - 28, 150, 20, t('createWorld.customize.presets.select'))));
    this.buttonList.push(new GuiButton(1, cx + 5, this.height - 28, 150, 20, t('gui.cancel')));
    this.updateButton();
  }

  override onGuiClosed(): void {
    Keyboard.enableRepeatEvents(false);
  }

  protected override mouseClicked(x: number, y: number, button: number): void {
    this.textField.mouseClicked(x, y, button);
    super.mouseClicked(x, y, button);
  }

  protected override keyTyped(ch: string, key: number): void {
    if (!this.textField.textboxKeyTyped(ch, key)) super.keyTyped(ch, key);
  }

  protected override actionPerformed(b: GuiButton): void {
    if (b.id === 0 && this.canUse()) {
      this.createFlatWorldGui.setFlatGeneratorInfo(this.textField.getText());
      this.mc.displayGuiScreen(this.createFlatWorldGui);
    } else if (b.id === 1) {
      this.mc.displayGuiScreen(this.createFlatWorldGui);
    }
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.drawDefaultBackground();
    this.listSlot.drawScreen(mx, my, pt);
    this.drawCenteredString(this.fontRenderer, this.title, Math.trunc(this.width / 2), 8, 0xffffff);
    this.drawString(this.fontRenderer, this.shareText, 50, 30, 0xa0a0a0);
    this.drawString(this.fontRenderer, this.listText, 50, 70, 0xa0a0a0);
    this.textField.drawTextBox();
    super.drawScreen(mx, my, pt);
  }

  override updateScreen(): void {
    this.textField.updateCursorCounter();
    super.updateScreen();
  }

  /** func_82296_g */
  updateButton(): void {
    this.theButton.enabled = this.canUse();
  }

  private canUse(): boolean {
    return (this.listSlot.selected > -1 && this.listSlot.selected < FLAT_PRESETS.length) || this.textField.getText().length > 1;
  }
}

class GuiFlatPresetsListSlot extends GuiSlot {
  selected = -1;

  constructor(private readonly gui: GuiFlatPresets) {
    super(gui.mc, gui.width, gui.height, 80, gui.height - 37, 24);
  }

  protected getSize(): number {
    return FLAT_PRESETS.length;
  }

  protected elementClicked(i: number): void {
    this.selected = i;
    this.gui.updateButton();
    this.gui.textField.setText(FLAT_PRESETS[this.selected].presetData);
  }

  protected isSelected(i: number): boolean {
    return i === this.selected;
  }

  protected drawBackground(): void {}

  protected drawSlot(i: number, x: number, y: number, _h: number, _t: Tessellator): void {
    const p = FLAT_PRESETS[i];
    drawSlotWithItem(this.gui, GuiCreateFlatWorld.theRenderItem, x, y, new ItemStack(p.iconId, 1, 0));
    this.gui.font.drawString(p.presetName, x + 18 + 5, y + 6, 0xffffff);
  }
}
