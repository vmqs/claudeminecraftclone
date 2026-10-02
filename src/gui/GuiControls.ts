import type { GameSettings } from '../client/GameSettings';
import { KeyBinding } from '../client/KeyBinding';
import { I18n } from '../core/I18n';
import { GuiButton, GuiSmallButton } from './GuiButton';
import { GuiScreen } from './GuiScreen';

/**
 * Key bindings (GuiControls): a 70-wide button per binding in two columns with its name to the
 * right. Clicking a button waits for the next key or mouse button ("> ??? <"); bindings that
 * share a key are shown in red.
 */
export class GuiControls extends GuiScreen {
  protected screenTitle = 'Controls';
  /** The binding waiting for a key, or -1. */
  private buttonId = -1;

  constructor(
    private readonly parentScreen: GuiScreen,
    private readonly options: GameSettings,
  ) {
    super();
  }

  private getLeftBorder(): number {
    return Math.trunc(this.width / 2) - 155;
  }

  override initGui(): void {
    const left = this.getLeftBorder();
    const h6 = Math.trunc(this.height / 6);
    for (let i = 0; i < this.options.keyBindings.length; i++) {
      this.buttonList.push(new GuiSmallButton(i, left + (i % 2) * 160, h6 + 24 * (i >> 1), null, this.options.getOptionDisplayString(i), 70, 20));
    }
    this.buttonList.push(new GuiButton(200, Math.trunc(this.width / 2) - 100, h6 + 168, I18n.translateToLocal('gui.done')));
    this.screenTitle = I18n.translateToLocal('controls.title');
  }

  protected override actionPerformed(b: GuiButton): void {
    for (let i = 0; i < this.options.keyBindings.length; i++) this.buttonList[i].displayString = this.options.getOptionDisplayString(i);
    if (b.id === 200) {
      this.mc.displayGuiScreen(this.parentScreen);
    } else {
      this.buttonId = b.id;
      b.displayString = '> ' + this.options.getOptionDisplayString(b.id) + ' <';
    }
  }

  private bind(code: number): void {
    this.options.setKeyBinding(this.buttonId, code);
    this.buttonList[this.buttonId].displayString = this.options.getOptionDisplayString(this.buttonId);
    this.buttonId = -1;
    KeyBinding.resetKeyBindingArrayAndHash();
  }

  protected override mouseClicked(x: number, y: number, button: number): void {
    if (this.buttonId >= 0) this.bind(-100 + button);
    else super.mouseClicked(x, y, button);
  }

  protected override keyTyped(ch: string, key: number): void {
    if (this.buttonId >= 0) this.bind(key);
    else super.keyTyped(ch, key);
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.drawDefaultBackground();
    this.drawCenteredString(this.fontRenderer, this.screenTitle, Math.trunc(this.width / 2), 20, 0xffffff);
    const left = this.getLeftBorder();
    const binds = this.options.keyBindings;
    const h6 = Math.trunc(this.height / 6);
    for (let i = 0; i < binds.length; i++) {
      let duplicate = false;
      for (let j = 0; j < binds.length; j++) {
        if (j !== i && binds[i].keyCode === binds[j].keyCode) {
          duplicate = true;
          break;
        }
      }
      const b = this.buttonList[i];
      if (this.buttonId === i) b.displayString = '§f> §e??? §f<';
      else if (duplicate) b.displayString = '§c' + this.options.getOptionDisplayString(i);
      else b.displayString = this.options.getOptionDisplayString(i);
      this.drawString(this.fontRenderer, this.options.getKeyBindingDescription(i), left + (i % 2) * 160 + 70 + 6, h6 + 24 * (i >> 1) + 7, -1);
    }
    super.drawScreen(mx, my, pt);
  }
}
