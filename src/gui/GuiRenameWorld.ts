import { Keyboard } from '../client/Keyboard';
import { I18n } from '../core/I18n';
import { SaveFormatMemory } from '../world/storage/SaveFormatMemory';
import { GuiButton } from './GuiButton';
import { GuiScreen } from './GuiScreen';
import { GuiTextField } from './GuiTextField';

/** "Rename World" (GuiRenameWorld). */
export class GuiRenameWorld extends GuiScreen {
  private theGuiTextField!: GuiTextField;

  constructor(
    private readonly parentGuiScreen: GuiScreen,
    private readonly worldName: string,
  ) {
    super();
  }

  override updateScreen(): void {
    this.theGuiTextField.updateCursorCounter();
  }

  override initGui(): void {
    const t = (k: string) => I18n.translateToLocal(k);
    Keyboard.enableRepeatEvents(true);
    this.buttonList = [];
    const cx = Math.trunc(this.width / 2);
    const h4 = Math.trunc(this.height / 4);
    this.buttonList.push(new GuiButton(0, cx - 100, h4 + 96 + 12, t('selectWorld.renameButton')));
    this.buttonList.push(new GuiButton(1, cx - 100, h4 + 120 + 12, t('gui.cancel')));
    const info = SaveFormatMemory.instance.getWorldInfo(this.worldName);
    this.theGuiTextField = new GuiTextField(this.fontRenderer, cx - 100, 60, 200, 20);
    this.theGuiTextField.setFocused(true);
    this.theGuiTextField.setText(info?.worldName ?? '');
  }

  override onGuiClosed(): void {
    Keyboard.enableRepeatEvents(false);
  }

  protected override actionPerformed(b: GuiButton): void {
    if (!b.enabled) return;
    if (b.id === 1) this.mc.displayGuiScreen(this.parentGuiScreen);
    else if (b.id === 0) {
      SaveFormatMemory.instance.renameWorld(this.worldName, this.theGuiTextField.getText().trim());
      this.mc.displayGuiScreen(this.parentGuiScreen);
    }
  }

  protected override keyTyped(ch: string, key: number): void {
    this.theGuiTextField.textboxKeyTyped(ch, key);
    this.buttonList[0].enabled = this.theGuiTextField.getText().trim().length > 0;
    if (ch === '\r') this.actionPerformed(this.buttonList[0]);
  }

  protected override mouseClicked(x: number, y: number, button: number): void {
    super.mouseClicked(x, y, button);
    this.theGuiTextField.mouseClicked(x, y, button);
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    const t = (k: string) => I18n.translateToLocal(k);
    const cx = Math.trunc(this.width / 2);
    this.drawDefaultBackground();
    this.drawCenteredString(this.fontRenderer, t('selectWorld.renameTitle'), cx, Math.trunc(this.height / 4) - 60 + 20, 0xffffff);
    this.drawString(this.fontRenderer, t('selectWorld.enterName'), cx - 100, 47, 0xa0a0a0);
    this.theGuiTextField.drawTextBox();
    super.drawScreen(mx, my, pt);
  }
}
