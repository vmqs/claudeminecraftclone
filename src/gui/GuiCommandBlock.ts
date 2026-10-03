import { Keyboard, Keys } from '../client/Keyboard';
import { I18n } from '../core/I18n';
import type { TileEntity } from '../world/tileentity/TileEntity';
import { GuiButton } from './GuiButton';
import { GuiScreen } from './GuiScreen';
import { GuiTextField } from './GuiTextField';

/** The parts of TileEntityCommandBlock the screen uses. */
interface CommandBlockLike {
  getCommand(): string;
  setCommand(cmd: string): void;
}

/** Whether a tile entity is a command block (has the command accessors). */
export function isCommandBlock(te: unknown): boolean {
  const c = te as Partial<CommandBlockLike> | null;
  return !!c && typeof c.getCommand === 'function' && typeof c.setCommand === 'function';
}

/**
 * "Set Console Command for Block" (GuiCommandBlock): a 300 px command field with Done/Cancel.
 * Done is what the client sent as the MC|AdvCdm payload; the integrated server's handler sets
 * the command when the player may use level-2 commands in Creative and answers
 * "Command set: ...", otherwise advMode.notAllowed.
 */
export class GuiCommandBlock extends GuiScreen {
  private commandTextField!: GuiTextField;
  private doneBtn!: GuiButton;
  private cancelBtn!: GuiButton;

  constructor(private readonly commandBlock: TileEntity) {
    super();
  }

  private get block(): CommandBlockLike {
    return this.commandBlock as unknown as CommandBlockLike;
  }

  override updateScreen(): void {
    this.commandTextField.updateCursorCounter();
  }

  override initGui(): void {
    const t = (k: string) => I18n.translateToLocal(k);
    const cx = Math.trunc(this.width / 2);
    const qy = Math.trunc(this.height / 4);
    Keyboard.enableRepeatEvents(true);
    this.buttonList = [];
    this.buttonList.push((this.doneBtn = new GuiButton(0, cx - 100, qy + 96 + 12, t('gui.done'))));
    this.buttonList.push((this.cancelBtn = new GuiButton(1, cx - 100, qy + 120 + 12, t('gui.cancel'))));
    this.commandTextField = new GuiTextField(this.fontRenderer, cx - 150, 60, 300, 20);
    this.commandTextField.setMaxStringLength(32767);
    this.commandTextField.setFocused(true);
    this.commandTextField.setText(this.block.getCommand());
    this.doneBtn.enabled = this.commandTextField.getText().trim().length > 0;
  }

  override onGuiClosed(): void {
    Keyboard.enableRepeatEvents(false);
  }

  protected override actionPerformed(b: GuiButton): void {
    if (!b.enabled) return;
    if (b.id === 0) this.sendCommand(this.commandTextField.getText());
    if (b.id === 0 || b.id === 1) this.mc.displayGuiScreen(null);
  }

  /** NetServerHandler's MC|AdvCdm handler (the integrated server always enables command blocks). */
  private sendCommand(cmd: string): void {
    const p = this.mc.thePlayer;
    if (!p) return;
    // Packet.readString(…, 256) rejects longer commands and the packet is dropped.
    if (cmd.length > 256) return;
    if (p.canCommandSenderUseCommand(2, '') && p.capabilities.isCreativeMode) {
      const te = this.commandBlock;
      // The server looks the block up again by its coordinates.
      const w = p.worldObj;
      const found = w.getBlockTileEntity(te.xCoord, te.yCoord, te.zCoord);
      if (!found || !isCommandBlock(found)) return;
      (found as unknown as CommandBlockLike).setCommand(cmd);
      w.markBlockForUpdate(te.xCoord, te.yCoord, te.zCoord);
      p.sendChatToPlayer('Command set: ' + cmd);
    } else {
      p.sendChatToPlayer(p.translateString('advMode.notAllowed'));
    }
  }

  protected override keyTyped(ch: string, key: number): void {
    this.commandTextField.textboxKeyTyped(ch, key);
    this.doneBtn.enabled = this.commandTextField.getText().trim().length > 0;
    if (key === Keys.RETURN || ch === '\r') this.actionPerformed(this.doneBtn);
    else if (key === Keys.ESCAPE) this.actionPerformed(this.cancelBtn);
  }

  protected override mouseClicked(x: number, y: number, button: number): void {
    super.mouseClicked(x, y, button);
    this.commandTextField.mouseClicked(x, y, button);
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    const t = (k: string) => I18n.translateToLocal(k);
    const cx = Math.trunc(this.width / 2);
    this.drawDefaultBackground();
    this.drawCenteredString(this.fontRenderer, t('advMode.setCommand'), cx, Math.trunc(this.height / 4) - 60 + 20, 0xffffff);
    this.drawString(this.fontRenderer, t('advMode.command'), cx - 150, 47, 0xa0a0a0);
    this.drawString(this.fontRenderer, t('advMode.nearestPlayer'), cx - 150, 97, 0xa0a0a0);
    this.drawString(this.fontRenderer, t('advMode.randomPlayer'), cx - 150, 108, 0xa0a0a0);
    this.drawString(this.fontRenderer, t('advMode.allPlayers'), cx - 150, 119, 0xa0a0a0);
    this.commandTextField.drawTextBox();
    super.drawScreen(mx, my, pt);
  }
}
