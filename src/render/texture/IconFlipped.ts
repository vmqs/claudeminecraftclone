import { Icon } from './Icon';

/**
 * An icon drawn mirrored (IconFlipped): doors use horizontally flipped copies of their
 * textures for the hinge on the other side. Reads its base icon's placement on every call,
 * so it follows atlas restitching. Worker-safe.
 */
export class IconFlipped extends Icon {
  constructor(
    private readonly baseIcon: Icon,
    private readonly flipU: boolean,
    private readonly flipV: boolean,
  ) {
    super(baseIcon.iconName);
  }

  override getOriginX(): number {
    return this.baseIcon.getOriginX();
  }
  override getOriginY(): number {
    return this.baseIcon.getOriginY();
  }
  override getMinU(): number {
    return this.flipU ? this.baseIcon.getMaxU() : this.baseIcon.getMinU();
  }
  override getMaxU(): number {
    return this.flipU ? this.baseIcon.getMinU() : this.baseIcon.getMaxU();
  }
  override getInterpolatedU(u16: number): number {
    const d = this.getMaxU() - this.getMinU();
    return this.getMinU() + d * (u16 / 16);
  }
  /** As in the original, a V flip only moves maxV (minV stays). */
  override getMinV(): number {
    return this.baseIcon.getMinV();
  }
  override getMaxV(): number {
    return this.flipV ? this.baseIcon.getMinV() : this.baseIcon.getMaxV();
  }
  override getInterpolatedV(v16: number): number {
    const d = this.getMaxV() - this.getMinV();
    return this.getMinV() + d * (v16 / 16);
  }
  override getSheetWidth(): number {
    return this.baseIcon.getSheetWidth();
  }
  override getSheetHeight(): number {
    return this.baseIcon.getSheetHeight();
  }
  getBaseIcon(): Icon {
    return this.baseIcon;
  }
  isFlippedU(): boolean {
    return this.flipU;
  }
}
