import { Keyboard, Keys } from '../client/Keyboard';
import { TileEntityRenderer } from '../render/tileentity/TileEntityRenderer';
import { GL } from '../render/gl/GL';
import type { TileEntity } from '../world/tileentity/TileEntity';
import { FontRenderer } from './FontRenderer';
import { GuiButton } from './GuiButton';
import { GuiScreen } from './GuiScreen';

const SIGN_POST_ID = 63;

/** The parts of TileEntitySign the editor uses. */
interface EditableSign {
  signText: string[];
  /** The line drawn with "> <" markers, -1 for none. */
  lineBeingEdited: number;
  setEditable?(v: boolean): void;
  isEditable?: boolean;
}

/**
 * "Edit sign message:" (GuiEditSign): the sign drawn large through its tile-entity renderer,
 * Up/Down/Enter change the line, typing appends up to 15 characters, Esc or Done finish.
 */
export class GuiEditSign extends GuiScreen {
  protected screenTitle = 'Edit sign message:';
  private updateCounter = 0;
  private editLine = 0;
  private doneBtn!: GuiButton;

  constructor(private readonly entitySign: TileEntity) {
    super();
  }

  private get sign(): EditableSign {
    return this.entitySign as unknown as EditableSign;
  }

  override initGui(): void {
    this.buttonList = [];
    Keyboard.enableRepeatEvents(true);
    this.buttonList.push((this.doneBtn = new GuiButton(0, Math.trunc(this.width / 2) - 100, Math.trunc(this.height / 4) + 120, 'Done')));
    this.setEditable(false);
  }

  private setEditable(v: boolean): void {
    if (this.sign.setEditable) this.sign.setEditable(v);
    else this.sign.isEditable = v;
  }

  override onGuiClosed(): void {
    Keyboard.enableRepeatEvents(false);
    this.setEditable(true);
  }

  override updateScreen(): void {
    this.updateCounter++;
  }

  protected override actionPerformed(b: GuiButton): void {
    if (!b.enabled) return;
    if (b.id === 0) {
      this.entitySign.onInventoryChanged();
      this.mc.displayGuiScreen(null);
    }
  }

  protected override keyTyped(ch: string, key: number): void {
    const text = this.sign.signText;
    if (key === Keys.UP) this.editLine = (this.editLine - 1) & 3;
    if (key === Keys.DOWN || key === Keys.RETURN) this.editLine = (this.editLine + 1) & 3;
    if (key === Keys.BACK && text[this.editLine].length > 0) text[this.editLine] = text[this.editLine].substring(0, text[this.editLine].length - 1);
    if (ch.length === 1 && FontRenderer.allowedCharacters.indexOf(ch) >= 0 && text[this.editLine].length < 15) text[this.editLine] += ch;
    if (key === Keys.ESCAPE) this.actionPerformed(this.doneBtn);
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.drawDefaultBackground();
    this.drawCenteredString(this.fontRenderer, this.screenTitle, Math.trunc(this.width / 2), 40, 0xffffff);
    GL.pushMatrix();
    GL.translate(Math.trunc(this.width / 2), 0, 50);
    const k = 93.75;
    GL.scale(-k, -k, -k);
    GL.rotate(180, 0, 1, 0);
    const block = this.entitySign.getBlockType();
    const meta = this.entitySign.getBlockMetadata();
    if (block && block.blockID === SIGN_POST_ID) {
      GL.rotate(Math.fround((meta * 360) / 16), 0, 1, 0);
    } else {
      const angle = meta === 2 ? 180 : meta === 4 ? 90 : meta === 5 ? -90 : 0;
      GL.rotate(angle, 0, 1, 0);
    }
    GL.translate(0, -1.0625, 0);
    if (Math.trunc(this.updateCounter / 6) % 2 === 0) this.sign.lineBeingEdited = this.editLine;
    TileEntityRenderer.instance.renderTileEntityAt(this.entitySign, -0.5, -0.75, -0.5, 0);
    this.sign.lineBeingEdited = -1;
    GL.popMatrix();
    super.drawScreen(mx, my, pt);
  }
}
