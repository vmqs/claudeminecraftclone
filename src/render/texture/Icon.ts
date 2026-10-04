/**
 * A sprite in a stitched atlas (TextureStitched's Icon interface). Worker-safe:
 * the main thread's TextureMap fills in UVs after stitching and broadcasts them as
 * an {@link IconTable}; workers apply the table to their own Icon objects.
 */
export class Icon {
  minU = 0;
  maxU = 1;
  minV = 0;
  maxV = 1;
  originX = 0;
  originY = 0;
  width = 16;
  height = 16;
  sheetWidth = 16;
  sheetHeight = 16;

  constructor(readonly iconName: string) {}

  getIconName(): string {
    return this.iconName;
  }
  getMinU(): number {
    return this.minU;
  }
  getMaxU(): number {
    return this.maxU;
  }
  getMinV(): number {
    return this.minV;
  }
  getMaxV(): number {
    return this.maxV;
  }
  getOriginX(): number {
    return this.originX;
  }
  getOriginY(): number {
    return this.originY;
  }
  getSheetWidth(): number {
    return this.sheetWidth;
  }
  getSheetHeight(): number {
    return this.sheetHeight;
  }

  /** U at `u16` sixteenths across the icon (0..16). */
  getInterpolatedU(u16: number): number {
    return this.minU + (this.maxU - this.minU) * (u16 / 16);
  }

  getInterpolatedV(v16: number): number {
    return this.minV + (this.maxV - this.minV) * (v16 / 16);
  }

  /** Same as TextureStitched.init: UVs are inset by 0.01 texel against bleeding. */
  setPlacement(sheetW: number, sheetH: number, x: number, y: number, w: number, h: number): void {
    this.sheetWidth = sheetW;
    this.sheetHeight = sheetH;
    this.originX = x;
    this.originY = y;
    this.width = w;
    this.height = h;
    const eu = 0.01 / sheetW;
    const ev = 0.01 / sheetH;
    this.minU = x / sheetW + eu;
    this.maxU = (x + w) / sheetW - eu;
    this.minV = y / sheetH + ev;
    this.maxV = (y + h) / sheetH - ev;
  }

  copyFrom(o: Icon): void {
    this.setPlacement(o.sheetWidth, o.sheetHeight, o.originX, o.originY, o.width, o.height);
  }
}

/** Blocks and items register their icons through this (TextureMap on the main thread). */
export interface IconRegister {
  registerIcon(name: string): Icon;
}

/** Serialisable atlas layout: name -> [x, y, w, h] in pixels, plus the sheet size. */
export interface IconTable {
  sheetWidth: number;
  sheetHeight: number;
  icons: Record<string, [number, number, number, number]>;
  /** Placement used for names that are not in the atlas. */
  missing: [number, number, number, number];
}

/** IconRegister for workers: hands out Icons and positions them from a broadcast IconTable. */
export class IconTableRegister implements IconRegister {
  private icons = new Map<string, Icon>();

  registerIcon(name: string): Icon {
    let icon = this.icons.get(name);
    if (!icon) {
      icon = new Icon(name);
      this.icons.set(name, icon);
    }
    return icon;
  }

  apply(table: IconTable): void {
    for (const [name, icon] of this.icons) {
      const p = table.icons[name] ?? table.missing;
      icon.setPlacement(table.sheetWidth, table.sheetHeight, p[0], p[1], p[2], p[3]);
    }
  }
}
