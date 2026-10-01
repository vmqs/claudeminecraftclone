import type { Minecraft } from '../client/Minecraft';
import type { EnumOptions } from '../client/GameSettings';
import { GL } from '../render/gl/GL';
import { Gui } from './Gui';

/** A 200x20 (or custom width) button drawn as two halves of the gui.png button strip. */
export class GuiButton extends Gui {
  width: number;
  height: number;
  enabled = true;
  drawButton = true;
  protected hovered = false;

  constructor(
    public id: number,
    public xPosition: number,
    public yPosition: number,
    widthOrText: number | string,
    height?: number,
    displayString?: string,
  ) {
    super();
    if (typeof widthOrText === 'string') {
      this.width = 200;
      this.height = 20;
      this.displayString = widthOrText;
    } else {
      this.width = widthOrText;
      this.height = height ?? 20;
      this.displayString = displayString ?? '';
    }
  }

  displayString: string;

  protected getHoverState(hover: boolean): number {
    return !this.enabled ? 0 : hover ? 2 : 1;
  }

  drawButtonOn(mc: Minecraft, mx: number, my: number): void {
    if (!this.drawButton) return;
    const fr = mc.fontRenderer;
    mc.renderEngine.bindTexture('/gui/gui.png');
    GL.color(1, 1, 1, 1);
    this.hovered = mx >= this.xPosition && my >= this.yPosition && mx < this.xPosition + this.width && my < this.yPosition + this.height;
    const state = this.getHoverState(this.hovered);
    const half = Math.trunc(this.width / 2);
    this.drawTexturedModalRect(this.xPosition, this.yPosition, 0, 46 + state * 20, half, this.height);
    this.drawTexturedModalRect(this.xPosition + half, this.yPosition, 200 - half, 46 + state * 20, half, this.height);
    this.mouseDragged(mc, mx, my);
    let color = 0xe0e0e0;
    if (!this.enabled) color = -6250336;
    else if (this.hovered) color = 0xffffa0;
    this.drawCenteredString(fr, this.displayString, this.xPosition + half, this.yPosition + Math.trunc((this.height - 8) / 2), color);
  }

  protected mouseDragged(_mc: Minecraft, _x: number, _y: number): void {}

  mouseReleased(_x: number, _y: number): void {}

  mousePressed(_mc: Minecraft, x: number, y: number): boolean {
    return this.enabled && this.drawButton && x >= this.xPosition && y >= this.yPosition && x < this.xPosition + this.width && y < this.yPosition + this.height;
  }

  isMouseOver(): boolean {
    return this.hovered;
  }
}

/** 150-wide button bound to an option (GuiSmallButton). */
export class GuiSmallButton extends GuiButton {
  constructor(
    id: number,
    x: number,
    y: number,
    private readonly enumOptions: EnumOptions | null,
    text: string,
    w = 150,
    h = 20,
  ) {
    super(id, x, y, w, h, text);
  }

  returnEnumOptions(): EnumOptions | null {
    return this.enumOptions;
  }
}

/** A slider for float options (GuiSlider). */
export class GuiSlider extends GuiButton {
  dragging = false;

  constructor(
    id: number,
    x: number,
    y: number,
    private readonly idFloat: EnumOptions,
    text: string,
    public sliderValue: number,
  ) {
    super(id, x, y, 150, 20, text);
  }

  protected override getHoverState(): number {
    return 0;
  }

  private setFromMouse(mc: Minecraft, x: number): void {
    let v = Math.fround((x - (this.xPosition + 4)) / (this.width - 8));
    if (v < 0) v = 0;
    if (v > 1) v = 1;
    this.sliderValue = v;
    mc.gameSettings.setOptionFloatValue(this.idFloat, v);
    this.displayString = mc.gameSettings.getKeyBinding(this.idFloat);
  }

  protected override mouseDragged(mc: Minecraft, x: number): void {
    if (!this.drawButton) return;
    if (this.dragging) this.setFromMouse(mc, x);
    GL.color(1, 1, 1, 1);
    const knob = this.xPosition + Math.trunc(this.sliderValue * (this.width - 8));
    this.drawTexturedModalRect(knob, this.yPosition, 0, 66, 4, 20);
    this.drawTexturedModalRect(knob + 4, this.yPosition, 196, 66, 4, 20);
  }

  override mousePressed(mc: Minecraft, x: number, y: number): boolean {
    if (!super.mousePressed(mc, x, y)) return false;
    this.setFromMouse(mc, x);
    this.dragging = true;
    return true;
  }

  override mouseReleased(): void {
    this.dragging = false;
  }
}
