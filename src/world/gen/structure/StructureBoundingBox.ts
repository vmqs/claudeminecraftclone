/** An inclusive block box (StructureBoundingBox). */
export class StructureBoundingBox {
  constructor(
    public minX: number,
    public minY: number,
    public minZ: number,
    public maxX: number,
    public maxY: number,
    public maxZ: number,
  ) {}

  static getNewBoundingBox(): StructureBoundingBox {
    return new StructureBoundingBox(0x7fffffff, 0x7fffffff, 0x7fffffff, -0x80000000, -0x80000000, -0x80000000);
  }

  /** A box in the y range 1..512 (the chunk area of generateStructuresInChunk). */
  static of2D(minX: number, minZ: number, maxX: number, maxZ: number): StructureBoundingBox {
    return new StructureBoundingBox(minX, 1, minZ, maxX, 512, maxZ);
  }

  static copy(b: StructureBoundingBox): StructureBoundingBox {
    return new StructureBoundingBox(b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ);
  }

  /**
   * getComponentToAddBoundingBox: a w*h*d box at offset (ox, oy, oz) from (x, y, z), rotated for
   * the facing (0 south, 1 west, 2 north, 3 east).
   */
  static getComponentToAddBoundingBox(x: number, y: number, z: number, ox: number, oy: number, oz: number, w: number, h: number, d: number, facing: number): StructureBoundingBox {
    switch (facing) {
      case 1:
        return new StructureBoundingBox(x - d + 1 + oz, y + oy, z + ox, x + oz, y + h - 1 + oy, z + w - 1 + ox);
      case 2:
        return new StructureBoundingBox(x + ox, y + oy, z - d + 1 + oz, x + w - 1 + ox, y + h - 1 + oy, z + oz);
      case 3:
        return new StructureBoundingBox(x + oz, y + oy, z + ox, x + d - 1 + oz, y + h - 1 + oy, z + w - 1 + ox);
      default:
        return new StructureBoundingBox(x + ox, y + oy, z + oz, x + w - 1 + ox, y + h - 1 + oy, z + d - 1 + oz);
    }
  }

  intersectsWith(b: StructureBoundingBox): boolean {
    return this.maxX >= b.minX && this.minX <= b.maxX && this.maxZ >= b.minZ && this.minZ <= b.maxZ && this.maxY >= b.minY && this.minY <= b.maxY;
  }

  intersectsWith2D(minX: number, minZ: number, maxX: number, maxZ: number): boolean {
    return this.maxX >= minX && this.minX <= maxX && this.maxZ >= minZ && this.minZ <= maxZ;
  }

  expandTo(b: StructureBoundingBox): void {
    this.minX = Math.min(this.minX, b.minX);
    this.minY = Math.min(this.minY, b.minY);
    this.minZ = Math.min(this.minZ, b.minZ);
    this.maxX = Math.max(this.maxX, b.maxX);
    this.maxY = Math.max(this.maxY, b.maxY);
    this.maxZ = Math.max(this.maxZ, b.maxZ);
  }

  offset(dx: number, dy: number, dz: number): void {
    this.minX += dx;
    this.minY += dy;
    this.minZ += dz;
    this.maxX += dx;
    this.maxY += dy;
    this.maxZ += dz;
  }

  isVecInside(x: number, y: number, z: number): boolean {
    return x >= this.minX && x <= this.maxX && z >= this.minZ && z <= this.maxZ && y >= this.minY && y <= this.maxY;
  }

  getXSize(): number {
    return this.maxX - this.minX + 1;
  }
  getYSize(): number {
    return this.maxY - this.minY + 1;
  }
  getZSize(): number {
    return this.maxZ - this.minZ + 1;
  }
  getCenterX(): number {
    return this.minX + Math.trunc((this.maxX - this.minX + 1) / 2);
  }
  getCenterY(): number {
    return this.minY + Math.trunc((this.maxY - this.minY + 1) / 2);
  }
  getCenterZ(): number {
    return this.minZ + Math.trunc((this.maxZ - this.minZ + 1) / 2);
  }
}
