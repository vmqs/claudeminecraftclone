import { Keyboard, Keys, Mouse } from '../client/Keyboard';
import { GuiScreen } from './GuiScreen';
import { GuiTextField } from './GuiTextField';

/**
 * The chat input (GuiChat): T opens it empty, / opens it with "/". Enter sends, Up/Down walk the
 * sent history, Page Up/Down and the wheel scroll the chat, Tab completes commands and names.
 * Chat links (ChatClickData, GuiConfirmOpenLink) are not ported.
 */
export class GuiChat extends GuiScreen {
  /** The unsent text while browsing the history (field_73898_b). */
  private historyBuffer = '';
  private sentHistoryCursor = -1;
  /** Tab completion state (field_73897_d, field_73905_m, field_73903_n, field_73904_o). */
  private playerNamesFound = false;
  private waitingOnAutocomplete = false;
  private autocompleteIndex = 0;
  private readonly foundPlayerNames: string[] = [];
  /** Completions "received from the server", applied on the next tick like a packet would be. */
  private pendingCompletions: string[] | null = null;
  protected inputField!: GuiTextField;

  constructor(private readonly defaultInputFieldText = '') {
    super();
  }

  override initGui(): void {
    Keyboard.enableRepeatEvents(true);
    this.sentHistoryCursor = this.mc.ingameGUI.getChatGUI().getSentMessages().length;
    this.inputField = new GuiTextField(this.fontRenderer, 4, this.height - 12, this.width - 4, 12);
    this.inputField.setMaxStringLength(100);
    this.inputField.setEnableBackgroundDrawing(false);
    this.inputField.setFocused(true);
    this.inputField.setText(this.defaultInputFieldText);
    this.inputField.setCanLoseFocus(false);
  }

  override onGuiClosed(): void {
    Keyboard.enableRepeatEvents(false);
    this.mc.ingameGUI.getChatGUI().resetScroll();
  }

  override updateScreen(): void {
    this.inputField.updateCursorCounter();
    const completions = this.pendingCompletions;
    this.pendingCompletions = null;
    if (completions) this.onAutocompleteResponse(completions);
  }

  protected override keyTyped(ch: string, key: number): void {
    this.waitingOnAutocomplete = false;
    if (key === Keys.TAB) this.completePlayerName();
    else this.playerNamesFound = false;
    const chat = this.mc.ingameGUI.getChatGUI();
    if (key === Keys.ESCAPE) {
      this.mc.displayGuiScreen(null);
    } else if (key === Keys.RETURN) {
      const msg = this.inputField.getText().trim();
      if (msg.length > 0) {
        chat.addToSentMessages(msg);
        if (!this.mc.handleClientCommand(msg)) this.mc.thePlayer!.sendChatMessage(msg);
      }
      this.mc.displayGuiScreen(null);
    } else if (key === Keys.UP) {
      this.getSentHistory(-1);
    } else if (key === Keys.DOWN) {
      this.getSentHistory(1);
    } else if (key === Keys.PRIOR) {
      chat.scroll(chat.getLineCount() - 1);
    } else if (key === Keys.NEXT) {
      chat.scroll(-chat.getLineCount() + 1);
    } else {
      this.inputField.textboxKeyTyped(ch, key);
    }
  }

  override handleMouseInput(): void {
    super.handleMouseInput();
    let wheel = Mouse.getEventDWheel();
    if (wheel === 0) return;
    wheel = Math.max(-1, Math.min(1, wheel));
    if (!GuiScreen.isShiftKeyDown()) wheel *= 7;
    this.mc.ingameGUI.getChatGUI().scroll(wheel);
  }

  protected override mouseClicked(x: number, y: number, button: number): void {
    this.inputField.mouseClicked(x, y, button);
    super.mouseClicked(x, y, button);
  }

  /** Tab: asks for completions of the word before the cursor, then cycles through them. */
  completePlayerName(): void {
    const field = this.inputField;
    if (this.playerNamesFound) {
      field.deleteFromCursor(field.getNthWordFromPosWS(-1, field.getCursorPosition(), false) - field.getCursorPosition());
      if (this.autocompleteIndex >= this.foundPlayerNames.length) this.autocompleteIndex = 0;
    } else {
      const wordStart = field.getNthWordFromPosWS(-1, field.getCursorPosition(), false);
      this.foundPlayerNames.length = 0;
      this.autocompleteIndex = 0;
      const word = field.getText().substring(wordStart).toLowerCase();
      const beforeCursor = field.getText().substring(0, field.getCursorPosition());
      this.requestAutocomplete(beforeCursor, word);
      if (this.foundPlayerNames.length === 0) return;
      this.playerNamesFound = true;
      field.deleteFromCursor(wordStart - field.getCursorPosition());
    }
    if (this.foundPlayerNames.length > 1) this.mc.ingameGUI.getChatGUI().printChatMessageWithOptionalDeletion(this.foundPlayerNames.join(', '), 1);
    field.writeText(this.foundPlayerNames[this.autocompleteIndex++]);
  }

  /** func_73893_a: the original sent Packet203AutoComplete; the answer arrives a tick later. */
  private requestAutocomplete(text: string, _word: string): void {
    if (text.length < 1) return;
    this.pendingCompletions = this.mc.getPossibleCompletions(this.mc.thePlayer!, text);
    this.waitingOnAutocomplete = true;
  }

  /** func_73894_a */
  private onAutocompleteResponse(names: readonly string[]): void {
    if (!this.waitingOnAutocomplete) return;
    this.foundPlayerNames.length = 0;
    for (const n of names) if (n.length > 0) this.foundPlayerNames.push(n);
    if (this.foundPlayerNames.length > 0) {
      this.playerNamesFound = true;
      this.completePlayerName();
    }
  }

  getSentHistory(dir: number): void {
    const sent = this.mc.ingameGUI.getChatGUI().getSentMessages();
    const n = sent.length;
    const i = Math.max(0, Math.min(n, this.sentHistoryCursor + dir));
    if (i === this.sentHistoryCursor) return;
    if (i === n) {
      this.sentHistoryCursor = n;
      this.inputField.setText(this.historyBuffer);
    } else {
      if (this.sentHistoryCursor === n) this.historyBuffer = this.inputField.getText();
      this.inputField.setText(sent[i]);
      this.sentHistoryCursor = i;
    }
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    GuiScreen.drawRect(2, this.height - 14, this.width - 2, this.height - 2, -2147483648);
    this.inputField.drawTextBox();
    super.drawScreen(mx, my, pt);
  }

  override doesGuiPauseGame(): boolean {
    return false;
  }
}
