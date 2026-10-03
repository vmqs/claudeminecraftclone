import { Keyboard, Mouse } from '../client/Keyboard';
import { PlayerSkins } from '../client/skin/PlayerSkins';
import { pickPngFile, readSkinFile, saveSkin } from '../client/skin/SkinFiles';
import { I18n } from '../core/I18n';
import { filterUsername, isUsernameChar, isValidUsername, saveUsername } from '../net/Username';
import { GL } from '../render/gl/GL';
import { RenderHelper } from '../render/RenderHelper';
import { ModelBiped } from '../render/entity/ModelBiped';
import { bindSkin } from '../render/entity/SkinTextures';
import { Gui } from './Gui';
import { GuiButton } from './GuiButton';
import { GuiScreen } from './GuiScreen';
import { GuiTextField } from './GuiTextField';

const f = Math.fround;
const SCALE = f(0.0625);
/** Degrees the preview turns per tick while nobody drags it. */
const SPIN_PER_TICK = 1.5;

const STATUS_INFO = 0xa0a0a0;
const STATUS_ERROR = 0xff5555;
const STATUS_OK = 0x55ff55;

/**
 * "Account Manager": everything about the player in one 1.5.2-style screen (the launcher's job
 * in 1.5.2). The username (3 to 16 letters, digits or _, used in single player, when hosting a
 * LAN game and when joining one) and the skin: a turning preview of the player model wearing it
 * (drag it to turn it), "Upload Skin..." for a 64x32 or 64x64 PNG, and "Reset to Steve". Opened
 * from the title screen and from Options.
 */
export class GuiAccountManager extends GuiScreen {
  private nameField!: GuiTextField;
  private buttonDone!: GuiButton;
  private buttonUpload!: GuiButton;
  private status = '';
  private statusColor = STATUS_INFO;
  /** The preview's turn: automatic spin plus what the mouse added. */
  private spin = 0;
  private prevSpin = 0;
  private dragYaw = 0;
  private dragPitch = 0;
  private dragging = false;
  private lastDragX = 0;
  private lastDragY = 0;
  private ticks = 0;
  private picking = false;
  private readonly model = new ModelBiped(0);
  private box = { x: 0, y: 0, w: 0, h: 0 };

  constructor(private readonly parentScreen: GuiScreen | null) {
    super();
  }

  override initGui(): void {
    Keyboard.enableRepeatEvents(true);
    this.buttonList = [];
    const cx = Math.trunc(this.width / 2);
    const top = Math.trunc(this.height / 6);
    this.box = { x: cx - 150, y: top, w: 120, h: 130 };
    const rx = cx - 10;
    const old = this.nameField?.getText() ?? this.mc.username;
    this.nameField = new GuiTextField(this.fontRenderer, rx, top + 16, 160, 20);
    this.nameField.setMaxStringLength(16);
    this.nameField.setFocused(true);
    this.nameField.setText(old);
    this.buttonList.push((this.buttonUpload = new GuiButton(1, rx, top + 72, 160, 20, 'Upload Skin...')));
    this.buttonList.push(new GuiButton(2, rx, top + 96, 160, 20, 'Reset to Steve'));
    this.buttonList.push((this.buttonDone = new GuiButton(200, cx - 100, top + 168, I18n.translateToLocal('gui.done'))));
    this.updateButtons();
  }

  private updateButtons(): void {
    this.buttonDone.enabled = isValidUsername(this.nameField.getText());
    this.buttonUpload.enabled = !this.picking;
  }

  override updateScreen(): void {
    this.nameField.updateCursorCounter();
    this.ticks++;
    this.prevSpin = this.spin;
    if (!this.dragging) this.spin += SPIN_PER_TICK;
  }

  override onGuiClosed(): void {
    Keyboard.enableRepeatEvents(false);
    this.commitName();
  }

  /** The typed name becomes the account's when it is valid. */
  private commitName(): boolean {
    const name = this.nameField.getText();
    if (!isValidUsername(name)) return false;
    if (name === this.mc.username) return true;
    this.mc.username = name;
    saveUsername(name);
    // In single player the player takes the new name at once; a LAN game keeps the name it was
    // opened or joined with until the next one.
    const p = this.mc.thePlayer;
    if (p && !this.mc.lanServer && !this.mc.netHandler) p.username = name;
    return true;
  }

  private setStatus(text: string, color = STATUS_INFO): void {
    this.status = text;
    this.statusColor = color;
  }

  protected override actionPerformed(b: GuiButton): void {
    if (!b.enabled) return;
    if (b.id === 1) {
      this.picking = true;
      this.updateButtons();
      this.setStatus('Choose a 64x32 or 64x64 PNG skin');
      pickPngFile().then(
        (file) => {
          this.picking = false;
          this.updateButtons();
          if (file) void this.useSkinFile(file);
          else this.setStatus('');
        },
        () => {
          this.picking = false;
          this.updateButtons();
        },
      );
    } else if (b.id === 2) {
      PlayerSkins.setLocal(null);
      saveSkin(null);
      this.setStatus('You wear the default skin', STATUS_OK);
    } else if (b.id === 200) {
      if (!this.commitName()) return;
      this.mc.displayGuiScreen(this.parentScreen);
    }
  }

  /** Checks an uploaded file and wears it (what Upload Skin... does with the chosen file). */
  async useSkinFile(file: Blob): Promise<boolean> {
    this.setStatus('Reading the skin...');
    const r = await readSkinFile(file);
    if (!r.ok) {
      this.setStatus(r.error, STATUS_ERROR);
      return false;
    }
    PlayerSkins.setLocal(r.rgba);
    saveSkin(PlayerSkins.local);
    this.setStatus('Skin changed', STATUS_OK);
    return true;
  }

  protected override keyTyped(ch: string, key: number): void {
    if (this.nameField.isFocused) {
      if (ch.length === 1 && ch >= ' ' && !isUsernameChar(ch)) return;
      if (this.nameField.textboxKeyTyped(ch, key)) {
        const clean = filterUsername(this.nameField.getText());
        if (clean !== this.nameField.getText()) this.nameField.setText(clean);
        this.updateButtons();
        return;
      }
    }
    if (ch === '\r') this.actionPerformed(this.buttonDone);
    else super.keyTyped(ch, key);
  }

  private inBox(x: number, y: number): boolean {
    const b = this.box;
    return x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h;
  }

  protected override mouseClicked(x: number, y: number, button: number): void {
    super.mouseClicked(x, y, button);
    this.nameField.mouseClicked(x, y, button);
    if (button === 0 && this.inBox(x, y)) {
      this.dragging = true;
      this.lastDragX = x;
      this.lastDragY = y;
    }
  }

  /** Dragging turns the model (polled each frame: the mouse moves without events, like GuiSlot). */
  private followDrag(x: number, y: number): void {
    if (!this.dragging) return;
    if (!Mouse.isButtonDown(0)) {
      this.dragging = false;
      return;
    }
    this.dragYaw += (x - this.lastDragX) * 2.5;
    this.dragPitch = Math.max(-40, Math.min(40, this.dragPitch + (y - this.lastDragY) * 1.5));
    this.lastDragX = x;
    this.lastDragY = y;
  }

  protected override mouseMovedOrUp(x: number, y: number, button: number): void {
    super.mouseMovedOrUp(x, y, button);
    if (button === 0) this.dragging = false;
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    this.followDrag(mx, my);
    this.drawDefaultBackground();
    const cx = Math.trunc(this.width / 2);
    const top = this.box.y;
    const rx = cx - 10;
    this.drawCenteredString(this.fontRenderer, 'Account Manager', cx, top - 20, 0xffffff);
    const b = this.box;
    Gui.drawRect(b.x - 1, b.y - 1, b.x + b.w + 1, b.y + b.h + 1, -6250336);
    Gui.drawRect(b.x, b.y, b.x + b.w, b.y + b.h, -16777216);
    this.drawSkinPreview(pt);
    this.drawCenteredString(this.fontRenderer, PlayerSkins.local ? 'Custom skin' : 'Steve', b.x + Math.trunc(b.w / 2), b.y + b.h + 5, 0xa0a0a0);
    const name = this.nameField.getText();
    const valid = isValidUsername(name);
    this.drawString(this.fontRenderer, 'Username', rx, top + 4, 0xa0a0a0);
    this.nameField.drawTextBox();
    if (!valid) this.drawString(this.fontRenderer, '3-16 letters, digits or _', rx, top + 40, 0xff5555);
    else if (this.mc.lanServer || this.mc.netHandler) this.drawString(this.fontRenderer, 'Used from the next game you join', rx, top + 40, 0x808080);
    this.drawString(this.fontRenderer, 'Skin', rx, top + 60, 0xa0a0a0);
    let y = top + 122;
    for (const line of this.fontRenderer.listFormattedStringToWidth(this.status, 160).slice(0, 3)) {
      this.drawString(this.fontRenderer, line, rx, y, this.statusColor);
      y += this.fontRenderer.FONT_HEIGHT;
    }
    super.drawScreen(mx, my, pt);
  }

  /** The player model in the preview box (lit like the inventory's player), turning slowly. */
  private drawSkinPreview(pt: number): void {
    const b = this.box;
    const scale = (b.h - 34) / 1.8;
    const yaw = f(this.prevSpin + (this.spin - this.prevSpin) * pt + this.dragYaw);
    GL.enable(GL.COLOR_MATERIAL);
    GL.enable(GL.DEPTH_TEST);
    GL.pushMatrix();
    GL.translate(b.x + b.w / 2, b.y + b.h - 14, 50);
    GL.scale(-scale, scale, scale);
    GL.rotate(180, 0, 0, 1);
    GL.rotate(135, 0, 1, 0);
    RenderHelper.enableStandardItemLighting();
    GL.rotate(-135, 0, 1, 0);
    GL.rotate(f(-this.dragPitch), 1, 0, 0);
    // RenderLiving: face the body yaw, flip into model space, the player's 0.9375 scale.
    GL.rotate(f(180 - yaw), 0, 1, 0);
    GL.disable(GL.CULL_FACE);
    GL.enable(GL.RESCALE_NORMAL);
    GL.scale(-1, -1, 1);
    GL.scale(f(0.9375), f(0.9375), f(0.9375));
    GL.translate(0, f(f(-24 * SCALE) - f(0.0078125)), 0);
    GL.enable(GL.ALPHA_TEST);
    GL.alphaFunc(GL.GREATER, f(0.1));
    GL.color(1, 1, 1, 1);
    bindSkin(this.mc.renderEngine, PlayerSkins.local, '/mob/char.png');
    this.model.onGround = 0;
    this.model.render(null, 0, 0, f(this.ticks + pt), 0, 0, SCALE);
    GL.popMatrix();
    GL.disable(GL.RESCALE_NORMAL);
    GL.enable(GL.CULL_FACE);
    RenderHelper.disableStandardItemLighting();
    GL.disable(GL.COLOR_MATERIAL);
  }
}
