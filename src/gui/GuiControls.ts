import { EnumOptions, type GameSettings } from '../client/GameSettings';
import { KeyBinding } from '../client/KeyBinding';
import { Mouse } from '../client/Keyboard';
import { translateOr } from '../client/ControlsText';
import { I18n } from '../core/I18n';
import { Gui } from './Gui';
import { GuiButton, GuiSmallButton } from './GuiButton';
import { GuiScreen } from './GuiScreen';

const ROW = 24;
const DONE = 200;
const SPRINT_MODE = 201;
const RESET_KEYS = 202;

/**
 * Key bindings (GuiControls): a 70-wide button per binding in two columns with its name to the
 * right. Clicking a button waits for the next key or mouse button ("> ??? <"); bindings that
 * share a key are shown in red.
 *
 * 1.5.2 had 14 bindings in 7 rows above Done. With sprint, zoom and the nine hotbar keys the
 * list no longer fits, so the rows scroll (wheel, or the bar to their right) a whole row at a
 * time, six at once, and the Sprint Hold/Toggle and Reset Keys buttons sit in a row of their own
 * above Done. Scrolled to the top it lines up with the original screen.
 */
export class GuiControls extends GuiScreen {
  protected screenTitle = 'Controls';
  /** The binding waiting for a key, or -1. */
  private buttonId = -1;
  /** First visible row. */
  private scrollRow = 0;
  /** Dragging the scroll bar thumb: the offset of the grab inside it, or -1. */
  private dragOffset = -1;
  private sprintModeButton!: GuiSmallButton;
  private resetButton!: GuiSmallButton;

  constructor(
    private readonly parentScreen: GuiScreen,
    private readonly options: GameSettings,
  ) {
    super();
  }

  private getLeftBorder(): number {
    return Math.trunc(this.width / 2) - 155;
  }

  private get listTop(): number {
    return Math.trunc(this.height / 6);
  }

  /** Rows that fit above the option row at height / 6 + 144. */
  get visibleRows(): number {
    return 6;
  }

  get totalRows(): number {
    return (this.options.keyBindings.length + 1) >> 1;
  }

  get maxScroll(): number {
    return Math.max(0, this.totalRows - this.visibleRows);
  }

  override initGui(): void {
    const left = this.getLeftBorder();
    const h6 = this.listTop;
    for (let i = 0; i < this.options.keyBindings.length; i++) {
      this.buttonList.push(new GuiSmallButton(i, left + (i % 2) * 160, h6 + ROW * (i >> 1), null, this.options.getOptionDisplayString(i), 70, 20));
    }
    this.sprintModeButton = new GuiSmallButton(SPRINT_MODE, left, h6 + 144, EnumOptions.SPRINT_MODE, this.options.getKeyBinding(EnumOptions.SPRINT_MODE));
    this.resetButton = new GuiSmallButton(RESET_KEYS, left + 160, h6 + 144, null, translateOr('controls.resetAll'));
    this.buttonList.push(this.sprintModeButton, this.resetButton);
    this.buttonList.push(new GuiButton(DONE, Math.trunc(this.width / 2) - 100, h6 + 168, I18n.translateToLocal('gui.done')));
    this.screenTitle = I18n.translateToLocal('controls.title');
    this.setScroll(this.scrollRow);
  }

  /** Scrolls to `row` (clamped) and moves the binding buttons; rows outside the list are hidden. */
  setScroll(row: number): void {
    this.scrollRow = Math.max(0, Math.min(this.maxScroll, Math.trunc(row)));
    const h6 = this.listTop;
    for (let i = 0; i < this.options.keyBindings.length; i++) {
      const b = this.buttonList[i];
      const r = (i >> 1) - this.scrollRow;
      b.yPosition = h6 + ROW * r;
      b.drawButton = r >= 0 && r < this.visibleRows;
    }
  }

  getScroll(): number {
    return this.scrollRow;
  }

  protected override actionPerformed(b: GuiButton): void {
    for (let i = 0; i < this.options.keyBindings.length; i++) this.buttonList[i].displayString = this.options.getOptionDisplayString(i);
    if (b.id === DONE) {
      this.mc.displayGuiScreen(this.parentScreen);
    } else if (b.id === SPRINT_MODE) {
      this.options.setOptionValue(EnumOptions.SPRINT_MODE, 1);
      b.displayString = this.options.getKeyBinding(EnumOptions.SPRINT_MODE);
    } else if (b.id === RESET_KEYS) {
      this.buttonId = -1;
      this.options.resetKeyBindings();
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

  /** The scroll bar, right of the second column: [x0, x1) by [y0, y1). */
  private scrollBar(): { x0: number; x1: number; y0: number; y1: number; thumbY: number; thumbH: number } {
    const x0 = Math.trunc(this.width / 2) + 160;
    const y0 = this.listTop;
    const y1 = y0 + ROW * this.visibleRows - 4;
    const range = y1 - y0;
    const thumbH = Math.max(8, Math.trunc((range * this.visibleRows) / Math.max(1, this.totalRows)));
    const thumbY = y0 + (this.maxScroll > 0 ? Math.trunc(((range - thumbH) * this.scrollRow) / this.maxScroll) : 0);
    return { x0, x1: x0 + 6, y0, y1, thumbY, thumbH };
  }

  private scrollToThumb(y: number): void {
    const bar = this.scrollBar();
    const free = bar.y1 - bar.y0 - bar.thumbH;
    if (free <= 0) return;
    this.setScroll(Math.round(((y - this.dragOffset - bar.y0) * this.maxScroll) / free));
  }

  override handleMouseInput(): void {
    const wheel = Mouse.getEventDWheel();
    if (wheel !== 0 && this.buttonId < 0) this.setScroll(this.scrollRow + (wheel > 0 ? -1 : 1));
    super.handleMouseInput();
  }

  protected override mouseClicked(x: number, y: number, button: number): void {
    if (this.buttonId >= 0) {
      this.bind(-100 + button);
      return;
    }
    if (button === 0 && this.maxScroll > 0) {
      const bar = this.scrollBar();
      if (x >= bar.x0 && x < bar.x1 && y >= bar.y0 && y < bar.y1) {
        // On the thumb: drag it from where it was grabbed; elsewhere on the bar: centre it there.
        this.dragOffset = y >= bar.thumbY && y < bar.thumbY + bar.thumbH ? y - bar.thumbY : Math.trunc(bar.thumbH / 2);
        this.scrollToThumb(y);
        return;
      }
    }
    super.mouseClicked(x, y, button);
  }

  protected override mouseMovedOrUp(x: number, y: number, button: number): void {
    if (button === 0) this.dragOffset = -1;
    super.mouseMovedOrUp(x, y, button);
  }

  protected override keyTyped(ch: string, key: number): void {
    if (this.buttonId >= 0) this.bind(key);
    else super.keyTyped(ch, key);
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    // The thumb follows the mouse while the button is held (mouse moves are polled, as GuiSlot does).
    if (this.dragOffset >= 0) {
      if (Mouse.isButtonDown(0)) this.scrollToThumb(my);
      else this.dragOffset = -1;
    }
    this.drawDefaultBackground();
    this.drawCenteredString(this.fontRenderer, this.screenTitle, Math.trunc(this.width / 2), 20, 0xffffff);
    const left = this.getLeftBorder();
    const binds = this.options.keyBindings;
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
      if (b.drawButton) this.drawString(this.fontRenderer, this.options.getKeyBindingDescription(i), left + (i % 2) * 160 + 70 + 6, b.yPosition + 7, -1);
    }
    this.resetButton.enabled = binds.some((k) => k.keyCode !== k.keyCodeDefault);
    this.sprintModeButton.displayString = this.options.getKeyBinding(EnumOptions.SPRINT_MODE);
    if (this.maxScroll > 0) {
      // GuiSlot's bar: a black track and a grey thumb with a light edge.
      const bar = this.scrollBar();
      Gui.drawRect(bar.x0, bar.y0, bar.x1, bar.y1, 0xff000000);
      Gui.drawRect(bar.x0, bar.thumbY, bar.x1, bar.thumbY + bar.thumbH, 0xff808080);
      Gui.drawRect(bar.x0, bar.thumbY, bar.x1 - 1, bar.thumbY + bar.thumbH - 1, 0xffc0c0c0);
    }
    super.drawScreen(mx, my, pt);
  }
}
