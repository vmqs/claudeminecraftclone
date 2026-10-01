/** GUI scale: the largest factor (up to the setting) that keeps at least 320x240 GUI pixels. */
export class ScaledResolution {
  private scaledWidth: number;
  private scaledHeight: number;
  private readonly scaledWidthD: number;
  private readonly scaledHeightD: number;
  private scaleFactor = 1;

  constructor(guiScale: number, width: number, height: number) {
    this.scaledWidth = width;
    this.scaledHeight = height;
    const max = guiScale === 0 ? 1000 : guiScale;
    while (this.scaleFactor < max && Math.trunc(this.scaledWidth / (this.scaleFactor + 1)) >= 320 && Math.trunc(this.scaledHeight / (this.scaleFactor + 1)) >= 240) this.scaleFactor++;
    this.scaledWidthD = this.scaledWidth / this.scaleFactor;
    this.scaledHeightD = this.scaledHeight / this.scaleFactor;
    this.scaledWidth = Math.ceil(this.scaledWidthD);
    this.scaledHeight = Math.ceil(this.scaledHeightD);
  }

  getScaledWidth(): number {
    return this.scaledWidth;
  }
  getScaledHeight(): number {
    return this.scaledHeight;
  }
  getScaledWidth_double(): number {
    return this.scaledWidthD;
  }
  getScaledHeight_double(): number {
    return this.scaledHeightD;
  }
  getScaleFactor(): number {
    return this.scaleFactor;
  }
}
